// Accountability partner: shares only a first name, streak and today's progress.
// Storage: Upstash Redis (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel).
// Without those variables a short lived in memory store is used (development only).
const mem = new Map();
const TTL = 60 * 60 * 24 * 4; // entries vanish after 4 days without an update
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const hits = new Map();

async function kv(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memCmd(cmd);
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('kv ' + r.status);
  const j = await r.json();
  return j.result;
}
function memCmd(cmd) {
  const [op, key, val] = cmd;
  const now = Date.now();
  const e = mem.get(key);
  if (e && e.exp < now) mem.delete(key);
  if (op === 'GET') return mem.get(key) ? mem.get(key).v : null;
  if (op === 'SET') { mem.set(key, { v: val, exp: now + TTL * 1000 }); return 'OK'; }
  if (op === 'DEL') { mem.delete(key); return 1; }
  return null;
}

function clean(s, n) {
  return String(s == null ? '' : s).replace(/[<>]/g, '').slice(0, n).trim();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (['capacitor://localhost', 'https://localhost', 'http://localhost'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ladder-user');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 40) return res.status(429).json({ error: 'Too many requests' });
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();

  const b = req.body || {};
  const code = String(b.code || '').toUpperCase();
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Bad code' });
  const key = 'buddy:' + code;

  try {
    if (b.action === 'publish') {
      const old = JSON.parse((await kv(['GET', key])) || 'null') || {};
      const rec = {
        name: clean(b.name, 24) || 'Friend',
        streak: Math.max(0, Math.min(9999, parseInt(b.streak, 10) || 0)),
        done: Math.max(0, Math.min(99, parseInt(b.done, 10) || 0)),
        total: Math.max(0, Math.min(99, parseInt(b.total, 10) || 0)),
        day: clean(b.day, 10),
        ts: now,
        nudges: old.nudges || 0,
        nudgeFrom: old.nudgeFrom || '',
      };
      await kv(['SET', key, JSON.stringify(rec), 'EX', TTL]);
      return res.status(200).json({ ok: true, nudges: rec.nudges, nudgeFrom: rec.nudgeFrom });
    }
    if (b.action === 'view') {
      const raw = await kv(['GET', key]);
      if (!raw) return res.status(404).json({ error: 'Not found' });
      const r = JSON.parse(raw);
      return res.status(200).json({ name: r.name, streak: r.streak, done: r.done, total: r.total, day: r.day, ts: r.ts });
    }
    if (b.action === 'nudge') {
      const raw = await kv(['GET', key]);
      if (!raw) return res.status(404).json({ error: 'Not found' });
      const r = JSON.parse(raw);
      r.nudges = (r.nudges || 0) + 1;
      r.nudgeFrom = clean(b.from, 24) || 'Your partner';
      await kv(['SET', key, JSON.stringify(r), 'EX', TTL]);
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'ack') {
      const raw = await kv(['GET', key]);
      if (raw) {
        const r = JSON.parse(raw);
        r.nudges = 0;
        r.nudgeFrom = '';
        await kv(['SET', key, JSON.stringify(r), 'EX', TTL]);
      }
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'remove') {
      await kv(['DEL', key]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('buddy error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

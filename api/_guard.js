// Shared protection for the AI endpoints.
// 1. Rejects oversized bodies.
// 2. Basic per instance rate limit per IP (best effort on serverless).
// 3. When REVENUECAT_SECRET_KEY is set in Vercel, only users with an active "pro"
//    entitlement (including the free trial) may call the endpoints.
//    Leave the variable unset during development and nothing is enforced.
const hits = new Map();

export async function guard(req, res) {
  const size = JSON.stringify(req.body || {}).length;
  if (size > 20000) {
    res.status(413).json({ error: 'Request too large' });
    return false;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 15) {
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();

  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret) return true;

  const uid = req.headers['x-ladder-user'];
  if (!uid || typeof uid !== 'string' || uid.length > 120) {
    res.status(401).json({ error: 'Subscription required' });
    return false;
  }
  try {
    const r = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(uid), {
      headers: { Authorization: 'Bearer ' + secret },
    });
    if (!r.ok) {
      res.status(401).json({ error: 'Subscription required' });
      return false;
    }
    const j = await r.json();
    const e = j && j.subscriber && j.subscriber.entitlements && j.subscriber.entitlements.pro;
    const active = e && (!e.expires_date || new Date(e.expires_date).getTime() > Date.now());
    if (!active) {
      res.status(402).json({ error: 'Subscription required' });
      return false;
    }
    return true;
  } catch (err) {
    res.status(503).json({ error: 'Could not verify subscription' });
    return false;
  }
}

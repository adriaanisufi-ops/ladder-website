import { guard } from './_guard.js';

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
  if (!(await guard(req, res))) return;

  const { area, draft, goals, hour, minutes } = req.body || {};
  const a = String(area || '').slice(0, 200);
  const d = String(draft || '').slice(0, 300);
  if (!a.trim() && !d.trim()) return res.status(400).json({ error: 'Missing text' });
  const g = Array.isArray(goals)
    ? goals.slice(0, 6).map((x) => {
        const o = x && typeof x === 'object' ? x : {};
        return (
          String(o.name || '').slice(0, 80) +
          (o.outcome ? ' (outcome: ' + String(o.outcome).slice(0, 120) + ')' : '') +
          (o.deadline ? ' (deadline: ' + String(o.deadline).slice(0, 40) + ')' : '') +
          (Array.isArray(o.items) && o.items.length ? ' (deliverables: ' + o.items.slice(0, 8).map((i) => String(i).slice(0, 100)).join(' | ') + ')' : '')
        );
      })
    : [];

  const prompt =
`You are the sharp but kind coach inside a discipline app called LADDER. The person must write one DELIVERABLE: something concrete that will exist when a timer ends. A good deliverable has a number and a thing you can point at, and it can be finished within the time they choose.

Area they are working on: ${a}
${d ? 'What they wrote so far: ' + d : 'They have not written anything yet.'}
${g.length ? 'Their goals: ' + g.join(' ; ') : ''}
${Number.isFinite(+minutes) && +minutes > 0 ? 'Time available: ' + Math.round(+minutes) + ' minutes' : ''}
Local hour: ${Number.isFinite(+hour) ? +hour : 'unknown'}

Do two things.
1. Write one short piece of advice (max 25 words) about how to make their deliverable sharper, based on what they wrote and their goals. If they wrote nothing, say what to think about. Teach the thinking, do not only hand over an answer. If what they wrote is already good, say so plainly.
2. Give exactly 3 example deliverables for this area, each with a number, each realistic for one work session, max 12 words each, using their own goals and words.

Plain direct language, correct grammar, no dash characters, no emojis, no motivational filler. Match their language (Dutch stays Dutch).

Respond ONLY with raw JSON, no markdown: {"advice":"...","options":["...","...","..."]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      console.error('Anthropic API error', response.status, await response.text());
      return res.status(response.status).json({ error: 'Anthropic API error' });
    }
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('sharpen error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

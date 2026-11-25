import { guard } from './_guard.js';

// Turns what someone wants to move forward today into at most three concrete to dos,
// scariest first, that fit inside their work hours.
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

  const { want, goals, hours } = req.body || {};
  const w = String(want || '').slice(0, 600).trim();
  if (w.split(/\s+/).filter(Boolean).length < 2) return res.status(400).json({ error: 'Write a bit more first' });
  const g = Array.isArray(goals) ? goals.slice(0, 5).map((x) => String(x).slice(0, 120)).join('; ') : '';
  const h = Math.min(12, Math.max(1, parseFloat(hours) || 4));

  const prompt =
`You help someone in a discipline app called LADDER write today's to dos. They have ${h} hours of work today.
Their goals: ${g || '(not given)'}
What they want to move forward today, in their words: ${w}

Write at most 3 to dos. Each one is a DELIVERABLE: something that will exist when it is done, with a number or a name, so it can be proven later with a photo or a screenshot. Like "10 outreach messages sent" or "Script for video 3 written". Not an activity like "work on outreach".
Put the one they will most want to avoid FIRST (a call, asking someone, showing their work). Mark it scary.
Together they must fit inside ${h} hours. Give minutes for each.
Stay close to their own words. Do not invent goals they did not mention.
Plain direct language, no dash characters, no emojis. Match their language (Dutch stays Dutch).

Respond ONLY with raw JSON, no markdown:
{"todos":[{"t":"...","mins":60,"scary":true}],"note":"one short sentence, max 15 words, why the first one goes first"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) {
      console.error('Anthropic API error', response.status, await response.text());
      return res.status(502).json({ error: 'Anthropic API error' });
    }
    const data = await response.json();
    const txt = (data.content || []).map((i) => (i.type === 'text' ? i.text : '')).join('').replace(/```json|```/g, '').trim();
    const p = JSON.parse(txt);
    const todos = (Array.isArray(p.todos) ? p.todos : []).slice(0, 3).map((x) => ({
      t: String(x.t || '').slice(0, 120),
      mins: Math.max(5, Math.min(480, parseInt(x.mins, 10) || 60)),
      scary: !!x.scary,
    })).filter((x) => x.t);
    return res.status(200).json({ todos, note: String(p.note || '').slice(0, 200) });
  } catch (err) {
    console.error('deliver error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

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

  const wrap = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
  // Think first: the coach only looks at something the person wrote themselves.
  if (d.trim().split(/\s+/).filter(Boolean).length < 2) {
    const note = 'Think first. Write your own version, even a rough one. The coach only looks at what you wrote.';
    return res.status(200).json(wrap({ sharp: false, note, questions: [], advice: note, options: [] }));
  }

  const prompt =
`You are the coach inside a discipline app called LADDER. The person wrote their own draft of a DELIVERABLE: something concrete that will exist when a timer ends. A good deliverable has a number and a thing you can point at, and it can be finished within the time they choose.

Area they are working on: ${a}
Their own draft: ${d}
${g.length ? 'Their goals: ' + g.join(' ; ') : ''}
${Number.isFinite(+minutes) && +minutes > 0 ? 'Time available: ' + Math.round(+minutes) + ' minutes' : ''}
Local hour: ${Number.isFinite(+hour) ? +hour : 'unknown'}

Your job is to make them think. You never think for them.
1. Decide if the draft is already sharp: it has a number, a thing you can point at, it can be finished in one work session, and it clearly serves the area or a goal.
2. Write a note of max 25 words. If it is sharp, say so plainly and tell them to start the timer. If it is not, name the single weakest point of their draft, using their own words.
3. If it is not sharp, ask at most 2 short questions that make them repair it themselves. If it is sharp, ask none.
Never write an improved deliverable for them. Never give examples, options or a rewritten version.

Plain direct language, correct grammar, no dash characters, no emojis, no motivational filler. Match their language (Dutch stays Dutch).

Respond ONLY with raw JSON, no markdown: {"sharp":true,"note":"...","questions":["..."]}`;

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
    // Repackage so both the new client (note, questions) and older app builds (advice, options) can read it.
    try {
      const txt = (data.content || []).map((i) => (i.type === 'text' ? i.text : '')).join('').replace(/```json|```/g, '').trim();
      const p = JSON.parse(txt);
      const note = String(p.note || '').slice(0, 300);
      const questions = (Array.isArray(p.questions) ? p.questions : []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 2).map((q) => q.slice(0, 200));
      const advice = [note].concat(questions).join(' ');
      return res.status(200).json(wrap({ sharp: !!p.sharp, note, questions, advice, options: [] }));
    } catch (e) {
      return res.status(200).json(data);
    }
  } catch (err) {
    console.error('sharpen error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

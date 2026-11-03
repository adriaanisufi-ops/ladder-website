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

  const { answers, complaint, goals, current, hour } = req.body || {};
  const a = Array.isArray(answers) ? answers.map((x) => String(x || '').slice(0, 600)) : [];
  if (!a.some((x) => x.trim())) return res.status(400).json({ error: 'Missing answers' });
  const g = Array.isArray(goals) ? goals.slice(0, 8).map((x) => String(x).slice(0, 160)) : [];

  const prompt =
`You are the accountability voice inside a brutalist discipline app called LADDER. The person just vented for five minutes and answered three honest questions. Now they must pick ONE action that becomes today's hard task, the first thing they do.

Their answers:
1. What exactly is bothering me? ${a[0] || ''}
2. What do I actually want? ${a[1] || ''}
3. What am I avoiding? ${a[2] || ''}
${complaint ? 'What they vented: ' + String(complaint).slice(0, 800) : ''}
${g.length ? 'Their goals and daily actions: ' + g.join(' | ') : ''}
${current ? 'They already wrote: ' + String(current).slice(0, 200) : ''}
Local hour: ${Number.isFinite(+hour) ? +hour : 'unknown'}

Give exactly 4 different options. Mix them: usually a direct move on what they are avoiding (a conversation, a question or a decision), one small first step toward what they want, and one option that is not hard work at all when it fits what they said, like rest, a walk, sleep, or a proper break. Every option is one concrete action they can start today and finish or clearly begin in under an hour. Use their own words and facts, never quote their full sentences back. Max 14 words each. Plain direct language, no motivational filler, no dash characters, no emojis. Match their language (Dutch stays Dutch).

Respond ONLY with raw JSON, no markdown: {"options":["...","...","...","..."]}`;

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
    console.error('suggest-actions error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

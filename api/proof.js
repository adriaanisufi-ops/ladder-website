import { guard } from './_guard.js';

// Proof check: does what the person says now exists match what they promised this morning?
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

  const { promise, proof, image } = req.body || {};
  const pr = String(promise || '').slice(0, 300);
  const pf = String(proof || '').slice(0, 500);
  if (!pf.trim()) return res.status(400).json({ error: 'Missing proof' });

  let img = null;
  if (typeof image === 'string') {
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (m && m[2].length < 3000000) img = { media_type: m[1], data: m[2] };
  }

  const prompt =
`You check proof inside a discipline app called LADDER. This morning the person promised a DELIVERABLE: something concrete that would exist. Now they want to tick it off and unlock their phone. They wrote what exists now${img ? ' and added a photo' : ''}.

Promised: ${pr || '(not written)'}
What exists now, in their words: ${pf}

Decide if this is real proof that the deliverable is done.
Accept when the proof is specific (a number, a name, a link, a place, a result you could point at) and it matches the promise${img ? ', and the photo fits it or at least does not contradict it' : ''}.
Reject when it is vague ("done", "worked on it", "did my best"), when it is clearly less than promised, or when it does not match the promise.
You cannot check if it is true. You check if it is specific and matches. Be strict on vagueness, not on spelling or format.

Write a note of max 20 words. If you reject, name exactly what is missing, in their own words. If you accept, say it plainly.
Plain direct language, no dash characters, no emojis. Match their language (Dutch stays Dutch).

Respond ONLY with raw JSON, no markdown: {"ok":true,"note":"..."}`;

  const content = img
    ? [{ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } }, { type: 'text', text: prompt }]
    : prompt;

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
        max_tokens: 200,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!response.ok) {
      console.error('Anthropic API error', response.status, await response.text());
      return res.status(502).json({ error: 'Anthropic API error' });
    }
    const data = await response.json();
    const txt = (data.content || []).map((i) => (i.type === 'text' ? i.text : '')).join('').replace(/```json|```/g, '').trim();
    const p = JSON.parse(txt);
    return res.status(200).json({ ok: !!p.ok, note: String(p.note || '').slice(0, 300) });
  } catch (err) {
    console.error('proof error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Missing entries' });
  }

  const entriesText = entries.map(e => `${e.date}: ${e.text}`).join('\n');

  const prompt =
`You are analyzing a person's daily one-line reflections from an accountability app called LADDER. Each line is their answer to "if today taught you one thing, what was it."

Your job: find genuine recurring patterns across these entries. Not a summary of each one, an actual pattern. What keeps coming up. What they keep circling back to, avoiding, or repeating. Be direct and specific, quote their own words where it strengthens the point (briefly, not whole entries). No generic self-help language, no "it seems like you're on a journey." If there's a real tension or contradiction between entries, name it.

If there's truly not enough data yet for a real pattern (fewer than 4-5 entries, or they're all about different unrelated things), say that plainly instead of forcing a pattern that isn't there.

Keep it to 3-5 short sentences. No headers, no bullet points, just direct prose.

Entries:
${entriesText}`;

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
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      return res.status(response.status).json({ error: 'Anthropic API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('analyze-patterns error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { newText, existing } = req.body || {};
  if (!newText || typeof newText !== 'string' || !Array.isArray(existing)) {
    return res.status(400).json({ error: 'Missing input' });
  }

  if (existing.length === 0) {
    return res.status(200).json({ connections: [] });
  }

  const existingList = existing.map(e => `[${e.index}] ${e.text}`).join('\n');

  const prompt =
`A person is building a web of daily one-line reflections. Here is their new line, and their existing lines with index numbers.

New line: "${newText}"

Existing lines:
${existingList}

Which existing lines is the new one genuinely, thematically connected to? Not superficial word overlap, an actual shared idea, tension, or pattern. Usually 0 to 3 connections. Most new lines connect to few or none, don't force connections that aren't real.

Respond ONLY with raw JSON, no markdown, no backticks, exactly this shape:
{"connections":[index1,index2]}

If there are no real connections, respond with {"connections":[]}.`;

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
    console.error('find-connections error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

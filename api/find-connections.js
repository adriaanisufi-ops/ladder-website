export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { newText, existing } = req.body || {};
  if (!newText || typeof newText !== 'string' || !Array.isArray(existing)) {
    return res.status(400).json({ error: 'Missing input' });
  }

  const existingList = existing.length
    ? existing.map(e => `[${e.index}] ${e.text}`).join('\n')
    : '(none yet, this is the first line)';

  const prompt =
`A person is building a web of daily one-line reflections. Here is their new line, and their existing lines with index numbers.

New line: "${newText}"

Existing lines:
${existingList}

Task 1, connections. Which existing lines is the new one genuinely, thematically connected to? Not superficial word overlap, an actual shared idea, tension, or pattern. Usually 0 to 3 connections. Most new lines connect to few or none, don't force connections that aren't real. If there are no existing lines, skip this task and return an empty array.

Task 2, classify the new line. Use this test: did it describe an action taken against the pull of a feeling, or an action or state that simply followed the feeling.

Against the feeling is a "decision". Give it subtype "pushThrough" if they did something despite not wanting to (example: "didn't want to train, went anyway"). Give it subtype "holdBack" if they refrained from something despite wanting it (example: "wanted to check my phone before the task was done, didn't").

Following the feeling, or a line that is just a mood or observation with no action against it, is a "feeling" (example: "checked my balance again, restless, nothing had changed").

If genuinely too ambiguous to call, use "unclear".

Task 3, tag the pillar. Which of these three does the line relate to, if any.

"resistance": doing something hard despite not wanting to, or holding back from something despite wanting to, in a daily action.
"detachment": not checking or chasing a result or outcome, or the opposite, checking or chasing one.
"boredom": tolerating stillness or silence, or the opposite, filling it.

If none clearly apply, use "none".

Respond ONLY with raw JSON, no markdown, no backticks, exactly this shape:
{"connections":[index1,index2],"classification":{"type":"decision","subtype":"pushThrough","pillar":"resistance"}}

Set subtype to null when type is "feeling" or "unclear". Use an empty array when there are no real connections.`;

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
        max_tokens: 350,
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

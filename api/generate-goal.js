export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { input, qa } = req.body || {};
  if (!input || typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'Missing input' });
  }

  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const basePrompt =
`You are a goal-structuring assistant inside a brutalist accountability app called LADDER. The person writes freely about something they want. Your job: turn it into a sharply structured goal, or ask short questions first if you genuinely can't yet.

Today's actual date is ${todayStr}. Use this as your only source of truth for "today" — never assume or guess a different current date or year. Every date and deadline you produce, for the goal, milestones, or examples, must be AFTER today's date unless the person explicitly describes something in the past. When the person gives a date without a year (e.g. "1 november", "next month"), infer the year using today's date: pick the nearest matching date that is still in the future, rolling over to next year if that month/day has already passed this year.

Be concrete, direct, no fluff, no motivational filler. Use the person's own numbers and dates where given. Match their language (Dutch stays Dutch, English stays English).

DECIDE FIRST: do you have enough to build a genuinely SPECIFIC goal? You need at minimum: (a) a measurable outcome — a number, a count, or a clear finish line, with roughly when, and (b) at least one concrete daily action. If either is missing or too vague to pin a real number/date/action on, ask questions instead of guessing wildly. If you can make a reasonable, sensible assumption for a MINOR detail (e.g. exact deadline day when they said "next year"), just assume it — don't ask about minor things, only the critical missing pieces. Prefer generating the goal directly whenever reasonably possible; asking is the exception, not the default.

Respond ONLY with raw JSON, no markdown, no backticks. Exactly ONE of these two shapes:

If you need more info:
{"type":"questions","questions":["short direct question","short direct question"]}
Max 3 questions, each one sentence, no preamble, asking only for what's genuinely missing.

If you have enough:
{"type":"goal","name":"short goal name, 1-4 words","outcome":"specific measurable end result WITH number and date","deadline":"the date, e.g. 16 feb 2027","actions":[{"text":"concrete daily action","type":"check","minutes":0}],"adjust":"one sentence: if actions green 2 weeks but outcome flat, change what specifically","milestones":[{"text":"checkpoint","date":"deadline"}],"checkinFields":["Field1","Field2"]}

Rules for the goal shape: actions is 1-4 items, one per distinct daily activity described. If an action has an explicit duration ("1 hour of calling", "3 hours on the book", "write for 45 minutes"), set type to "timer" and minutes to that duration — this gives the person a real countdown timer instead of a checkbox, so they actually time it rather than just ticking a box. If it's a count or task with no fixed length ("call 5 organisations", "train"), set type to "check" and minutes to 0. 2-4 milestones, ordered by date, each a real checkpoint toward the outcome — not vague ("make progress") but a concrete thing that either happened or didn't. checkinFields are 2-4 short measurable field names for a weekly check-in — the actual numbers the person will type in every week. Every action must be small enough to survive a bad day but real enough to compound over months.

Two examples of the quality bar for a completed goal:

Input: "ik wil 10k sparen voor februari 2027, ik ga 1 uur bellen en mailen en 3 uur aan een boek en website werken elke dag"
Output: {"type":"goal","name":"Freedom of action","outcome":"€10.000 saldo op 16 feb 2027","deadline":"16 feb 2027","actions":[{"text":"1 uur bellen, mailen, LinkedIn","type":"timer","minutes":60},{"text":"3 uur boek en site","type":"timer","minutes":180}],"adjust":"2 weken groen maar geen beweging → verander prijs, kanaal of doelgroep","milestones":[{"text":"Eerste betaalde opdracht","date":"1 okt 2026"},{"text":"Eerste maandelijkse gebruiker","date":"1 nov 2026"}],"checkinFields":["Saldo","Verkopen","Gebruikers"]}

Input: "I want to get better at running"
Output: {"type":"questions","questions":["What's the actual target — a distance, a time, a race?","By when do you want to hit it?","How many days a week can you realistically train?"]}

Person's words:
` + input;

  let userContent = basePrompt;
  if (Array.isArray(qa) && qa.length) {
    const answered = qa.map(x => '- ' + x.question + ' ' + x.answer).join('\n');
    userContent += '\n\nFollow-up answers just given:\n' + answered +
      '\n\nYou now have what you need. Respond ONLY with the "goal" shape — do not ask more questions.';
  }

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
        max_tokens: 1000,
        messages: [{ role: 'user', content: userContent }],
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
    console.error('generate-goal error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

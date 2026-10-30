// Waitlist signup. Stores the email in MailerLite so the list is yours from day one.
// Vercel env vars: MAILERLITE_API_KEY (required), MAILERLITE_GROUP_ID (optional).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body || {};

  // Honeypot: real people never fill this field. Pretend it worked.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'not_configured' });
  }

  const payload = { email };
  if (process.env.MAILERLITE_GROUP_ID) payload.groups = [process.env.MAILERLITE_GROUP_ID];

  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(payload)
    });
    // 200 = already on the list, 201 = created
    if (r.status === 200 || r.status === 201) return res.status(200).json({ ok: true });
    if (r.status === 422) return res.status(400).json({ error: 'invalid_email' });
    return res.status(502).json({ error: 'upstream_error' });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_error' });
  }
}

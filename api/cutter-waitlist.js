// Made to Fit cutter waiting list.
// Stores an email address for people who want Made to Fit to arrange their cutting once a partner
// cutter signs up. Keeps the least it can: the email, the letters of the postcode area, the type of
// project and which consent wording they agreed to. No IP address, no name, no design.
// Rows go to a Supabase table (docs/cutter-waitlist.sql) with row level security on and no policies,
// so only this function, holding the secret key, can write and nobody can read through the public API.
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel (server only). Without them it returns 503
// and the form says sign-ups are not open yet.

const CONSENT_VERSION = '2026-10-30'; // change when the wording on the form changes
const TEMPLATES = ['eaves', 'understairs', 'custom', 'wardrobe', 'shelving', 'kitchenbase', 'kitchenwall'];
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Best-effort per-instance rate limit
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 5;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }

  // Same-origin only. Unlike the assistant, a missing Origin is refused too: browsers always send it on a fetch POST.
  const origin = req.headers.origin;
  if (!origin || (origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`)) return res.status(403).json({ error: 'forbidden' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).json({ error: 'unsupported_media_type' });

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return res.status(503).json({ error: 'not_configured' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_request' });
  // Honeypot: a hidden field people never see. Pretend it worked so bots learn nothing.
  if (body.website) return res.status(200).json({ ok: true });
  if (body.consent !== true) return res.status(400).json({ error: 'no_consent' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) return res.status(400).json({ error: 'bad_email' });
  const area = typeof body.area === 'string' && /^[A-Z]{1,2}$/.test(body.area) ? body.area : null;
  const template = TEMPLATES.includes(body.template) ? body.template : null;

  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy service_role JWT
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/cutter_waitlist?on_conflict=email`, {
      method: 'POST', headers, body: JSON.stringify({ email, area, template, consent_version: CONSENT_VERSION }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) { console.error('waitlist insert failed', r.status); return res.status(502).json({ error: 'upstream' }); }
  } catch (err) {
    console.error('waitlist insert error', err?.name);
    return res.status(502).json({ error: 'upstream' });
  }
  // Same answer for a new or an existing address, so the form cannot be used to check who signed up
  return res.status(200).json({ ok: true });
}

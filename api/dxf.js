// Made to Fit: turns a cut list into DXF files for the cutting partner.
// POST JSON { gap?, margin?, materials: [...], parts: [...] } (format in docs/ORDER-PACK.md).
// Everything is checked again here; the browser is not trusted. Nothing is stored, and the request
// carries no customer details, so the files hold none either.
import { generateOrderDxf } from './_lib/order-dxf.js';
import { ValidationError } from './_lib/validate.js';
import { LayoutError } from './_lib/nest.js';
import { DXF_SETTINGS } from './_lib/dxf-settings.js';

// Best-effort per-instance rate limit, as in assistant.js.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 30;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

// Access control. Orders are not stored yet, so each request is a customer turning their own
// cut list into files, and there is nothing of anyone else's to reach. Once orders are saved on the
// server, look the order up here and allow only its owner or an admin, before anything is generated.
function canDownload(_req) { return true; }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' }); }

  // Same-origin only. A JSON content type also forces a CORS preflight for any cross-site caller.
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'forbidden', message: 'Requests must come from Made to Fit.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'forbidden', message: 'Requests must come from Made to Fit.' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return res.status(415).json({ error: 'unsupported_media_type', message: 'Send the cut list as JSON.' });
  if (Number(req.headers['content-length'] || 0) > DXF_SETTINGS.limits.bodyBytes) return res.status(413).json({ error: 'too_large', message: 'The cut list is too large.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited', message: 'Too many downloads in a short time. Try again in a few minutes.' });
  if (!canDownload(req)) return res.status(403).json({ error: 'forbidden', message: 'You can only download your own orders.' });

  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > DXF_SETTINGS.limits.bodyBytes) return res.status(413).json({ error: 'too_large', message: 'The cut list is too large.' });
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad_json', message: 'The cut list could not be read.' }); }
  } else if (body && JSON.stringify(body).length > DXF_SETTINGS.limits.bodyBytes) {
    return res.status(413).json({ error: 'too_large', message: 'The cut list is too large.' });
  }

  try {
    const out = generateOrderDxf(body);
    return res.status(200).json(out);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(422).json({ error: 'invalid', message: err.message, problems: err.problems });
    if (err instanceof LayoutError) return res.status(422).json({ error: 'layout', message: err.message });
    // Server log only: the error type and message start, never the request
    console.error('dxf error', err?.name, String(err?.message || '').slice(0, 200));
    return res.status(500).json({ error: 'server', message: 'The files could not be made. Please try again.' });
  }
}

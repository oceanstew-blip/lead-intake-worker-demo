// A small lead-intake API on Cloudflare Workers + D1.
//   GET  /health      -> { ok: true }
//   POST /api/leads   -> validate, save, return 201 (public)
//   GET  /api/leads   -> latest 50, needs "Authorization: Bearer <ADMIN_TOKEN>"
// It never sends email or messages. See the README for where that would go.
import { validateLead } from './validate.js';

const MAX_BODY_BYTES = 10_000;
// Hidden form field. Real people leave it empty; simple bots fill it in.
const HONEYPOT = 'company_site';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const corsHeaders = (request, env) => {
  const origin = request.headers.get('origin');
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    vary: 'origin',
  };
};

// Compare secrets without leaking length or position of the first mismatch:
// hash both to a fixed length, then compare every byte.
async function tokenMatches(given, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function createLead(request, env, cors) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Send Content-Type: application/json.' }, 415, cors);
  }

  // Read the body as text so the size limit holds even without a Content-Length header.
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large.' }, 413, cors);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Body is not valid JSON.' }, 400, cors);
  }

  // Bots get the same success answer, and nothing is saved.
  if (body && typeof body === 'object' && body[HONEYPOT]) {
    return json({ status: 'received' }, 200, cors);
  }

  const result = validateLead(body);
  if (!result.ok) return json({ error: 'Validation failed.', errors: result.errors }, 422, cors);

  const { name, email, phone, service, message } = result.value;
  const saved = await env.DB.prepare(
    'INSERT INTO leads (name, email, phone, service, message) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(name, email, phone || null, service, message)
    .run();

  // ponytail: no email or CRM call here on purpose. A real build would add it after the
  // insert (ctx.waitUntil) and send to a human review queue first, never straight to the customer.
  return json({ status: 'received', id: saved.meta.last_row_id }, 201, cors);
}

async function listLeads(request, env, cors) {
  if (!env.ADMIN_TOKEN) return json({ error: 'Listing is not configured.' }, 503, cors);
  const header = request.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given || !(await tokenMatches(given, env.ADMIN_TOKEN))) {
    return json({ error: 'Unauthorized.' }, 401, { ...cors, 'www-authenticate': 'Bearer' });
  }
  const { results } = await env.DB.prepare(
    'SELECT id, created_at, name, email, phone, service, message, status FROM leads ORDER BY id DESC LIMIT 50',
  ).all();
  return json({ leads: results }, 200, cors);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/health') return json({ ok: true }, 200, cors);
      if (url.pathname === '/api/leads') {
        if (request.method === 'POST') return await createLead(request, env, cors);
        if (request.method === 'GET') return await listLeads(request, env, cors);
        return json({ error: 'Method not allowed.' }, 405, { ...cors, allow: 'GET, POST, OPTIONS' });
      }
      return json({ error: 'Not found.' }, 404, cors);
    } catch (err) {
      // Log the detail for the developer; send the caller nothing they can use.
      console.error('unhandled error', err);
      return json({ error: 'Something went wrong.' }, 500, cors);
    }
  },
};

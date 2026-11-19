// One self-check, no framework: `npm run check`. Runs the Worker in Node with a fake database.
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const inserts = [];
const env = {
  ADMIN_TOKEN: 'test-token',
  DB: {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => { inserts.push({ sql, args }); return { meta: { last_row_id: inserts.length } }; },
      }),
      all: async () => ({ results: inserts.map((i, n) => ({ id: n + 1, name: i.args[0] })) }),
    }),
  },
};
const call = (method, path, { body, headers = {} } = {}) =>
  worker.fetch(new Request('http://local' + path, { method, body, headers }), env);
const post = (obj, headers = { 'content-type': 'application/json' }) =>
  call('POST', '/api/leads', { body: typeof obj === 'string' ? obj : JSON.stringify(obj), headers });

const good = { name: '  Jordan   Example ', email: 'Jordan@Example.com', phone: '(555) 010-0101', service: 'Gutter cleaning', message: 'Please call about cleaning before spring.' };

let r = await post(good);
assert.equal(r.status, 201);
assert.deepEqual(inserts[0].args, ['Jordan Example', 'jordan@example.com', '5550100101', 'Gutter cleaning', 'Please call about cleaning before spring.']);

r = await post({ ...good, email: 'not-an-email', message: 'short' });
assert.equal(r.status, 422);
assert.deepEqual(Object.keys((await r.json()).errors).sort(), ['email', 'message']);

assert.equal((await post('{nope')).status, 400);
assert.equal((await post(good, { 'content-type': 'text/plain' })).status, 415);
assert.equal((await post({ ...good, message: 'x'.repeat(11_000) })).status, 413);

const before = inserts.length;
r = await post({ ...good, company_site: 'spam.example' });
assert.equal(r.status, 200);
assert.equal(inserts.length, before, 'honeypot submissions must not be saved');

assert.equal((await call('GET', '/api/leads')).status, 401);
assert.equal((await call('GET', '/api/leads', { headers: { authorization: 'Bearer wrong' } })).status, 401);
r = await call('GET', '/api/leads', { headers: { authorization: 'Bearer test-token' } });
assert.equal(r.status, 200);
assert.equal((await r.json()).leads.length, 1);

assert.equal((await call('GET', '/health')).status, 200);
assert.equal((await call('DELETE', '/api/leads')).status, 405);
assert.equal((await call('GET', '/nope')).status, 404);

console.log('all checks passed');

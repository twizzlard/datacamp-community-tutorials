// Exercises api/state.js against a fake Upstash REST endpoint. Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const handler = createRequire(import.meta.url)('../api/state.js');

const hashes = new Map();
global.fetch = async (url, init) => {
  assert.equal(url, 'https://fake.upstash.io/pipeline');
  assert.equal(init.headers.Authorization, 'Bearer tok');
  const results = JSON.parse(init.body).map(([cmd, key, ...args]) => {
    const h = hashes.get(key) || new Map();
    hashes.set(key, h);
    if (cmd === 'HSET') {
      for (let i = 0; i < args.length; i += 2) h.set(args[i], args[i + 1]);
      return { result: args.length / 2 };
    }
    if (cmd === 'HDEL') return { result: args.filter((f) => h.delete(f)).length };
    if (cmd === 'HGETALL') return { result: [...h].flat() };
    return { error: `unknown ${cmd}` };
  });
  return { ok: true, json: async () => results };
};

async function call(method, { body, key } = {}) {
  const req = { method, body, headers: key ? { 'x-family-key': key } : {} };
  const res = {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  await handler(req, res);
  return res;
}

test('503 until storage is configured', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  assert.equal((await call('GET')).statusCode, 503);
});

test('set, read back, delete', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io/';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  assert.equal((await call('POST', { body: { set: { 'dog|2026-10-25T07:10:00.000Z': 'raya', 'shower|raya|2026-10-25': '2026-10-25T19:00:00.000Z' } } })).statusCode, 200);
  await call('POST', { body: { del: ['dog|2026-10-25T07:10:00.000Z', 'shower|raya|2026-10-25'] } });
  let res = await call('POST', { body: { set: { 'shower|kid1|2026-10-25T20:00:00.000Z': '1', offset: '2' }, del: [] } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data, { 'shower|kid1|2026-10-25T20:00:00.000Z': '1', offset: '2' });
  res = await call('POST', { body: JSON.stringify({ set: {}, del: ['offset'] }) });
  assert.deepEqual(Object.keys(res.payload.data), ['shower|kid1|2026-10-25T20:00:00.000Z']);
  res = await call('GET');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(res.payload.data), ['shower|kid1|2026-10-25T20:00:00.000Z']);
});

test('rejects junk fields and values', async () => {
  for (const body of [{ set: { 'evil key': '1' } }, { set: { offset: 'x'.repeat(100) } }, { set: [], del: [] }, 'not json', { del: ['__proto__'] }]) {
    assert.equal((await call('POST', { body })).statusCode, 400, JSON.stringify(body));
  }
  assert.equal((await call('DELETE')).statusCode, 405);
});

test('family key gates reads and writes', async () => {
  process.env.FAMILY_KEY = 'pancakes';
  assert.equal((await call('GET')).statusCode, 401);
  assert.equal((await call('GET', { key: 'waffles' })).statusCode, 401);
  assert.equal((await call('GET', { key: 'pancakes' })).statusCode, 200);
  delete process.env.FAMILY_KEY;
});

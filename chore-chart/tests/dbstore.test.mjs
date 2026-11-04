// The claude.ai shared-database store, against an in-memory fake of the db capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDbStore, bucketOf } from '../store.js';

function fakeDb() {
  const docs = new Map(); // id -> body
  const leases = new Map();
  const listeners = new Set();
  const tick = () => new Promise((r) => setTimeout(r, 1));
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
    return out;
  };
  const snapshot = () => ({
    docs: [...docs].map(([id, body]) => ({ id, exists: true, data: () => body })),
    metadata: { fromCache: false, hasPendingWrites: false },
  });
  const notify = () => listeners.forEach((fn) => fn(snapshot()));
  const doc = (id) => ({
    async get() { await tick(); return { id, exists: docs.has(id), data: () => docs.get(id) }; },
    async set(body) { await tick(); docs.set(id, body); notify(); },
    async update(body) {
      await tick();
      if (!docs.has(id)) throw { code: 'invalid_argument', message: 'missing' };
      docs.set(id, merge(docs.get(id), body));
      notify();
    },
    async acquire({ holder, ttlMs }) {
      await tick();
      const l = leases.get(id);
      if (l && l.holder !== holder && l.until > Date.now()) return { acquired: false };
      leases.set(id, { holder, until: Date.now() + ttlMs });
      return { acquired: true };
    },
  });
  return {
    docs,
    collection: () => ({ doc, onSnapshot(next) { listeners.add(next); setTimeout(() => next(snapshot()), 1); return () => listeners.delete(next); } }),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 60));

test('fields land in month documents', () => {
  assert.equal(bucketOf('done|2026-11-04|homework|raya'), '2026-11');
  assert.equal(bucketOf('done|w2026-11-01|trash|raya'), '2026-11');
  assert.equal(bucketOf('shower|raya|2026-11-02'), '2026-11');
  assert.equal(bucketOf('dog|2026-11-04T07:10:00.000Z'), '2026-11');
  assert.equal(bucketOf('offset'), 'meta');
});

test('two devices share one chart, including both creating a new month at once', async () => {
  const db = fakeDb();
  const fridge = createDbStore(db, { onChange() {} });
  const phone = createDbStore(db, { onChange() {} });
  fridge.start();
  phone.start();
  await settle();
  assert.equal(fridge.mode, 'cloud');

  fridge.commit({ set: { 'done|2026-11-04|homework|raya': '2026-11-04T15:00:00.000Z' }, del: [] });
  phone.commit({ set: { 'dog|2026-11-04T07:10:00.000Z': 'zamir' }, del: [] });
  assert.ok(fridge.data['done|2026-11-04|homework|raya'], 'shows the tap right away');
  for (let i = 0; i < 100 && (fridge.pendingCount || phone.pendingCount); i += 1) await settle();
  await settle();

  for (const s of [fridge, phone]) {
    assert.equal(s.data['done|2026-11-04|homework|raya'], '2026-11-04T15:00:00.000Z');
    assert.equal(s.data['dog|2026-11-04T07:10:00.000Z'], 'zamir');
    assert.equal(s.pendingCount, 0);
  }
  assert.deepEqual([...db.docs.keys()], ['2026-11']);

  phone.commit({ set: {}, del: ['done|2026-11-04|homework|raya'] });
  await settle();
  assert.equal('done|2026-11-04|homework|raya' in fridge.data, false);
  assert.equal(db.docs.get('2026-11').f['done|2026-11-04|homework|raya'], null);
});

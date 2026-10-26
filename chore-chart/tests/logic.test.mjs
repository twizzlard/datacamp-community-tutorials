// Run with: node --test tests/   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { applyOp } from '../store.js';

const config = {
  weekStartsOn: 0,
  rotationStart: '2026-10-25',
  showerEvery: 2,
  kids: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  chores: [{ id: 'dishes', when: 'daily' }, { id: 'trash', when: 'weekly' }, { id: 'tidy', when: 'daily' }],
  everyone: [],
};

const kidsFor = (data, start) => Object.fromEntries(Object.entries(L.assignments(config, data, start)).map(([c, a]) => [c, a.kidId]));

test('week starts on the configured day', () => {
  assert.equal(L.dateKey(L.weekStart(new Date(2026, 9, 28), 0)), '2026-10-25'); // Wed -> Sun
  assert.equal(L.dateKey(L.weekStart(new Date(2026, 9, 25), 1)), '2026-10-19'); // Sun -> previous Mon
  assert.equal(L.dateKey(L.weekStart(new Date(2026, 9, 26), 1)), '2026-10-26');
});

test('rotation moves each kid down one chore per week, across DST', () => {
  const w0 = new Date(2026, 9, 25);
  assert.deepEqual(kidsFor({}, w0), { dishes: 'a', trash: 'b', tidy: 'c' });
  assert.deepEqual(kidsFor({}, L.addDays(w0, 7)), { dishes: 'c', trash: 'a', tidy: 'b' }); // spans the Nov 1 US DST change
  assert.deepEqual(kidsFor({}, L.addDays(w0, 21)), { dishes: 'a', trash: 'b', tidy: 'c' });
  assert.deepEqual(kidsFor({}, L.addDays(w0, -7)), { dishes: 'b', trash: 'c', tidy: 'a' });
});

test('offset shifts the whole rotation', () => {
  const w0 = new Date(2026, 9, 25);
  assert.deepEqual(kidsFor({ offset: '1' }, w0), kidsFor({}, L.addDays(w0, 7)));
});

test('swap exchanges kids for one week only and cleans up when swapped back', () => {
  const w0 = new Date(2026, 9, 25);
  const data = {};
  applyOp(data, L.swapOp(config, data, w0, 'dishes', 'trash'));
  assert.deepEqual(kidsFor(data, w0), { dishes: 'b', trash: 'a', tidy: 'c' });
  assert.equal(L.assignments(config, data, w0).dishes.overridden, true);
  assert.deepEqual(kidsFor(data, L.addDays(w0, 7)), { dishes: 'c', trash: 'a', tidy: 'b' });
  applyOp(data, L.swapOp(config, data, w0, 'dishes', 'trash'));
  assert.deepEqual(data, {});
});

test('reassign gives a chore to one kid, and back to rotation removes the override', () => {
  const w0 = new Date(2026, 9, 25);
  const data = {};
  applyOp(data, L.reassignOp(config, data, w0, 'tidy', 'a'));
  assert.deepEqual(kidsFor(data, w0), { dishes: 'a', trash: 'b', tidy: 'a' });
  applyOp(data, L.reassignOp(config, data, w0, 'tidy', 'c'));
  assert.deepEqual(data, {});
});

test('done toggles on and off, and counts for the chore whoever checked it', () => {
  const data = {};
  applyOp(data, L.toggleDoneOp(data, '2026-10-26', 'dishes', 'a', false));
  assert.equal(L.doneFields(data, '2026-10-26', 'dishes').length, 1);
  applyOp(data, L.toggleDoneOp(data, '2026-10-26', 'dishes', 'b', false));
  assert.equal(L.doneFields(data, '2026-10-26', 'dishes').length, 0);
});

test('shower status counts calendar days', () => {
  const kid = { id: 'a' };
  const now = new Date(2026, 9, 28, 8, 0);
  const at = (d, h) => new Date(2026, 9, d, h).toISOString();
  assert.equal(L.showerStatus({}, kid, config, now).status, 'none');
  assert.deepEqual(
    [27, 26, 25].map((d) => L.showerStatus({ [`shower|a|${at(d, 21)}`]: '1' }, kid, config, now).status),
    ['fresh', 'due', 'overdue'],
  );
  const data = { [`shower|a|${at(20, 21)}`]: '1', [`shower|a|${at(27, 23)}`]: '1' };
  assert.equal(L.showerStatus(data, kid, config, now).days, 1);
  assert.equal(L.showerStatus(data, { id: 'a', showerEvery: 1 }, config, now).status, 'due');
});

test('prune drops old entries only', () => {
  const now = new Date(2026, 9, 25);
  const data = {
    offset: '1',
    'ov|2026-01-04|dishes': 'a',
    'done|2026-01-05|dishes|a': 'x',
    'done|w2026-01-04|trash|a': 'x',
    'shower|a|2026-01-05T20:00:00.000Z': '1',
    'done|2026-10-20|dishes|a': 'x',
  };
  assert.deepEqual(L.pruneOp(data, now).del.sort(), [
    'done|2026-01-05|dishes|a', 'done|w2026-01-04|trash|a', 'ov|2026-01-04|dishes', 'shower|a|2026-01-05T20:00:00.000Z',
  ]);
});

test('one shower per kid per day, whatever the format', () => {
  const day = new Date(2026, 9, 26, 20, 15);
  const field = L.showerField('a', day);
  assert.equal(field, 'shower|a|2026-10-26');
  // logging twice writes the same field, so it's idempotent at the data level
  const data = {};
  applyOp(data, { set: { [field]: day.toISOString() } });
  applyOp(data, { set: { [field]: day.toISOString() } });
  assert.equal(L.showers(data, 'a').length, 1);
  // older one-per-press fields on the same day collapse into one entry
  const legacy = {
    [`shower|a|${new Date(2026, 9, 26, 19, 0).toISOString()}`]: '1',
    [`shower|a|${new Date(2026, 9, 26, 19, 1).toISOString()}`]: '1',
    [`shower|a|${new Date(2026, 9, 24, 20, 0).toISOString()}`]: '1',
  };
  const list = L.showers(legacy, 'a');
  assert.equal(list.length, 2);
  assert.equal(list[0].fields.length, 2);
  assert.equal(L.showerStatus(legacy, { id: 'a' }, { showerEvery: 2 }, new Date(2026, 9, 27, 9)).days, 1);
});

test('old shower fields migrate to one per day, keeping the latest time', () => {
  const late = new Date(2026, 9, 26, 19, 1);
  const data = {
    [`shower|a|${new Date(2026, 9, 26, 19, 0).toISOString()}`]: '1',
    [`shower|a|${late.toISOString()}`]: '1',
    'shower|b|2026-10-25': new Date(2026, 9, 25, 21).toISOString(),
  };
  applyOp(data, L.migrateShowersOp(data));
  assert.deepEqual(Object.keys(data).sort(), ['shower|a|2026-10-26', 'shower|b|2026-10-25']);
  assert.equal(data['shower|a|2026-10-26'], late.toISOString());
  assert.equal(L.migrateShowersOp(data), null);
});

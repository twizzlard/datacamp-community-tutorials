// Run with: node --test tests/*.test.mjs   (Node 22+)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { computeAwards, firstFinisher, streak, showersOnTime } from '../awards.js';

const config = {
  weekStartsOn: 0,
  days: [0, 1, 2, 3, 4, 5], // Saturday off
  rotationStart: '2026-10-25',
  showerEvery: 2,
  kids: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  chores: [
    { id: 'table', when: 'daily', room: { id: 'playroom', name: 'Playroom' } },
    { id: 'bottles', when: 'daily', room: { id: 'basement', name: 'Basement' } },
    { id: 'sweep', when: 'daily', room: { id: 'art', name: 'Art room' } },
  ],
  everyone: [{ id: 'homework', when: 'daily' }],
};

const SUN = new Date(2026, 9, 25);
const day = (n) => L.addDays(SUN, n);
const at = (n, h, m = 0) => new Date(2026, 9, 25 + n, h, m).toISOString();
// Week of Oct 25: a -> table+playroom, b -> bottles+basement, c -> sweep+art; it rotates after that.
const MINE = { a: ['table', 'playroom'], b: ['bottles', 'basement'], c: ['sweep', 'art'] };
const due = (kid, n) => L.makeView(config, {}).dailyTasks(kid, day(n)).map((x) => x.task.id);

function finish(data, kid, n, h, m = 0, tasks = due(kid, n)) {
  for (const t of tasks) data[`done|${L.dateKey(day(n))}|${t}|${kid}`] = at(n, h, m);
}

test('a job brings its room along, and Saturday has nothing due', () => {
  const view = L.makeView(config, {});
  assert.deepEqual(view.dailyTasks('a', day(1)).map((x) => x.task.id), [...MINE.a, 'homework']);
  assert.deepEqual(due('a', 8), ['bottles', 'basement', 'homework']); // next week, rotated
  assert.equal(view.dailyTasks('a', day(6)).length, 0);
  assert.deepEqual(L.chartDays(config, SUN).map((d) => d.getDay()), [0, 1, 2, 3, 4, 5]);
});

test('day progress and the first finisher', () => {
  const data = {};
  finish(data, 'a', 1, 18);
  finish(data, 'b', 1, 17, 30);
  finish(data, 'c', 1, 19, 0, ['sweep']); // c not finished
  const view = L.makeView(config, data);
  assert.deepEqual(view.dayProgress('c', day(1)), { total: 3, done: 1, complete: false, finishedAt: null });
  assert.equal(firstFinisher(view, day(1)), 'b');
});

test('catching up on a past day does not make you the early bird for it', () => {
  const data = {};
  finish(data, 'a', 1, 18);
  for (const t of [...MINE.b, 'homework']) data[`done|${L.dateKey(day(1))}|${t}|b`] = at(2, 7); // ticked next morning
  assert.equal(firstFinisher(L.makeView(config, data), day(1)), 'a');
});

test('streaks skip Saturday and an unfinished today', () => {
  const data = {};
  for (const n of [3, 4, 5, 7]) finish(data, 'a', n, 18); // Wed, Thu, Fri, (Sat off), Sun
  const view = L.makeView(config, data);
  assert.equal(streak(view, 'a', day(8)), 4); // Monday not done yet: still 4
  assert.equal(streak(view, 'b', day(8)), 0);
});

test('weekly awards: early bird, steady star, perfect week, team day', () => {
  const data = {};
  for (let n = 0; n <= 5; n += 1) {
    finish(data, 'a', n, 17);
    finish(data, 'b', n, 18);
    if (n !== 2) finish(data, 'c', n, 19);
  }
  const view = L.makeView(config, data);
  const aw = computeAwards(view, SUN, new Date(2026, 9, 31, 12)); // Saturday after the week
  const ids = (k) => aw.byKid[k].map((x) => x.id);
  assert.ok(ids('a').includes('early') && ids('a').includes('perfect') && ids('a').includes('steady'));
  assert.ok(ids('b').includes('perfect') && ids('b').includes('steady') && !ids('b').includes('early'));
  assert.ok(!ids('c').includes('perfect'));
  assert.equal(aw.teamDays.length, 5);
  assert.ok(ids('c').includes('team'));
});

test('comeback only counts once the chart was in use the week before', () => {
  const data = {};
  for (let n = 7; n <= 9; n += 1) finish(data, 'a', n, 18);
  const now = new Date(2026, 10, 3, 20); // Tuesday of week 2
  assert.ok(!computeAwards(L.makeView(config, data), day(7), now).byKid.a.some((x) => x.id === 'comeback'));
  finish(data, 'b', 1, 18); // someone used it last week; a did nothing then
  assert.ok(computeAwards(L.makeView(config, data), day(7), now).byKid.a.some((x) => x.id === 'comeback'));
});

test('squeaky clean means never past due for a shower', () => {
  const kid = { id: 'a' };
  const ok = { [`shower|a|${at(-1, 20)}`]: '1', [`shower|a|${at(1, 20)}`]: '1', [`shower|a|${at(3, 20)}`]: '1' };
  assert.equal(showersOnTime(L.makeView(config, ok), kid, SUN, day(4)), true);
  const late = { [`shower|a|${at(-1, 20)}`]: '1', [`shower|a|${at(3, 20)}`]: '1' }; // Tue is 3 days after Sat
  assert.equal(showersOnTime(L.makeView(config, late), kid, SUN, day(4)), false);
});

test('dog trips give paw points, and the most this week is Top dog', () => {
  const withPet = { ...config, pet: { name: 'Bamba' } };
  const data = {
    [`dog|${at(1, 7)}`]: 'b',
    [`dog|${at(1, 18)}`]: 'c',
    [`dog|${at(2, 7)}`]: 'c',
    [`dog|${at(-2, 7)}`]: 'a', // last week, doesn't count
  };
  const view = L.makeView(withPet, data);
  assert.equal(view.dogTrips[0].kidId, 'c');
  const aw = computeAwards(view, SUN, new Date(2026, 9, 28, 12));
  assert.deepEqual(aw.dogPoints, { a: 0, b: 1, c: 2 });
  assert.ok(aw.byKid.c.some((x) => x.id === 'topdog'));
  assert.ok(!aw.byKid.b.some((x) => x.id === 'topdog'));
  assert.ok(!computeAwards(L.makeView(config, data), SUN, new Date(2026, 9, 28, 12)).byKid.c.some((x) => x.id === 'topdog'));
});

test('every trip is a point, several a day included', () => {
  const withPet = { ...config, pet: { name: 'Bamba' } };
  const data = { [`dog|${at(1, 7)}`]: 'a', [`dog|${at(1, 13)}`]: 'a', [`dog|${at(1, 19)}`]: 'a', [`dog|${at(2, 7)}`]: 'a' };
  assert.equal(computeAwards(L.makeView(withPet, data), SUN, new Date(2026, 9, 28, 12)).dogPoints.a, 4);
});

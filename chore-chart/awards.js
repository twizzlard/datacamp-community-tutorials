// Awards, worked out from the check-off times and showers already saved. Nothing extra is stored,
// so changing the rules here re-scores past weeks too.
import * as L from './logic.js';

export const AWARDS = [
  { id: 'early', name: 'Early bird', about: 'First to check every box today.' },
  { id: 'streak', name: 'On a roll', about: 'Every box checked two or more days in a row.' },
  { id: 'steady', name: 'Steady star', about: 'Most boxes checked so far this week (at least half).' },
  { id: 'perfect', name: 'Perfect week', about: 'Every box checked, every day of the week.' },
  { id: 'clean', name: 'Squeaky clean', about: 'Never late for a shower this week.' },
  { id: 'comeback', name: 'Comeback kid', about: 'Way more boxes checked than by this point last week.' },
  { id: 'team', name: 'Team day', about: 'Everyone checked every box on the same day. Everybody gets it.' },
];

const sameDay = (a, b) => L.dayNumber(a) === L.dayNumber(b);
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pct = (t) => `${Math.round(t.ratio * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The kid who checked their last box earliest on `day`. Boxes ticked on a later day (catching up) don't count.
export function firstFinisher(view, day) {
  let best = null;
  for (const kid of view.config.kids) {
    const p = view.dayProgress(kid.id, day);
    if (!p.complete || !p.finishedAt || !sameDay(p.finishedAt, day)) continue;
    if (!best || p.finishedAt < best.at) best = { kidId: kid.id, at: p.finishedAt };
  }
  return best ? best.kidId : null;
}

// Complete days in a row, counting back from today. Days off are skipped; an unfinished today doesn't break it.
export function streak(view, kidId, today, maxDays = 120) {
  let n = 0;
  for (let i = 0; i < maxDays; i += 1) {
    const p = view.dayProgress(kidId, L.addDays(today, -i));
    if (p.total === 0) continue;
    if (p.complete) n += 1;
    else if (i > 0) break;
  }
  return n;
}

// Boxes checked vs boxes due from `start` through `through`, including one box per weekly chore.
export function tally(view, kidId, start, through) {
  let total = 0;
  let done = 0;
  for (const d of L.weekDays(start)) {
    if (d > through) break;
    const p = view.dayProgress(kidId, d);
    total += p.total;
    done += p.done;
  }
  const a = view.assign(start);
  for (const c of view.config.chores) {
    if (c.when !== 'weekly' || a[c.id].kidId !== kidId) continue;
    total += 1;
    if (view.isDone(`w${L.dateKey(start)}`, c.id)) done += 1;
  }
  return { total, done, ratio: total ? done / total : 0 };
}

// True when the kid was never past due for a shower on any day from `start` through `through`.
export function showersOnTime(view, kid, start, through) {
  const list = view.showers(kid.id);
  const every = L.showerEvery(kid, view.config);
  for (let d = start; d <= through; d = L.addDays(d, 1)) {
    const endOfDay = L.addDays(d, 1);
    const last = list.find((at) => at < endOfDay);
    if (!last || L.daysBetween(last, d) > every) return false;
  }
  return true;
}

// -> { byKid: { [kidId]: [{ id, label, detail }] }, firstToday, teamDays: [Date], teamToday }
export function computeAwards(view, start, now = new Date()) {
  const { config } = view;
  const today = midnight(now);
  const end = L.addDays(start, 6);
  const out = { byKid: {}, firstToday: null, teamDays: [], teamToday: false };
  for (const k of config.kids) out.byKid[k.id] = [];
  if (start > today) return out;

  const through = end < today ? end : today;
  const isCurrent = today <= end;
  const days = L.weekDays(start).filter((d) => d <= through);

  const wins = {};
  for (const d of days) {
    const k = firstFinisher(view, d);
    if (!k) continue;
    wins[k] = (wins[k] || 0) + 1;
    if (isCurrent && sameDay(d, today)) out.firstToday = k;
  }

  for (const d of days) {
    const progress = config.kids.map((k) => view.dayProgress(k.id, d));
    if (progress.some((p) => p.total) && progress.every((p) => p.complete || p.total === 0)) out.teamDays.push(d);
  }
  out.teamToday = isCurrent && out.teamDays.some((d) => sameDay(d, today));

  const tallies = Object.fromEntries(config.kids.map((k) => [k.id, tally(view, k.id, start, through)]));
  const best = Math.max(...Object.values(tallies).map((t) => t.ratio));
  const lastWeek = Object.fromEntries(config.kids.map((k) => [k.id, tally(view, k.id, L.addDays(start, -7), L.addDays(through, -7))]));
  // A comeback needs a real last week to come back from, not the week before the chart existed.
  const chartUsedLastWeek = Object.values(lastWeek).some((t) => t.done > 0);

  for (const kid of config.kids) {
    const list = out.byKid[kid.id];
    const t = tallies[kid.id];

    const w = wins[kid.id] || 0;
    if (w) {
      list.push({
        id: 'early',
        label: w > 1 ? `Early bird ×${w}` : 'Early bird',
        detail: out.firstToday === kid.id ? 'First to finish today' : `First to finish on ${plural(w, 'day')} this week`,
      });
    }

    if (isCurrent) {
      const s = streak(view, kid.id, today);
      if (s >= 2) list.push({ id: 'streak', label: `${s}-day streak`, detail: `Every box checked ${s} days in a row` });
    }

    if (t.total && t.ratio >= 0.5 && t.ratio === best) {
      list.push({ id: 'steady', label: 'Steady star', detail: `${pct(t)} of boxes checked` });
    }

    const chartDays = L.weekDays(start).filter((d) => view.dailyTasks(kid.id, d).length);
    if (chartDays.length && chartDays.every((d) => view.dayProgress(kid.id, d).complete)) {
      list.push({ id: 'perfect', label: 'Perfect week', detail: 'Every box checked' });
    }

    if (L.daysBetween(start, through) >= 2 && showersOnTime(view, kid, start, through)) {
      list.push({ id: 'clean', label: 'Squeaky clean', detail: 'Never late for a shower' });
    }

    const last = lastWeek[kid.id];
    if (chartUsedLastWeek && last.total && t.ratio >= 0.6 && t.ratio - last.ratio >= 0.2) {
      list.push({ id: 'comeback', label: 'Comeback kid', detail: `Up from ${pct(last)} to ${pct(t)}` });
    }

    if (out.teamDays.length) {
      const n = out.teamDays.length;
      list.push({ id: 'team', label: n > 1 ? `Team day ×${n}` : 'Team day', detail: `Everyone finished on ${plural(n, 'day')}` });
    }
  }
  return out;
}

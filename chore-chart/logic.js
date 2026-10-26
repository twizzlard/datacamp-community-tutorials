// Pure helpers: dates, the weekly rotation, overrides and shower math.
// Everything here works on the flat `data` map that the store syncs:
//   offset                       -> "0"       whole-rotation shift (settings)
//   ov|<weekKey>|<choreId>       -> kidId     manual override for one week
//   done|<periodKey>|<choreId>|<kidId> -> ISO time   a check-off
//   shower|<kidId>|<dateKey>     -> ISO time  the shower that day (one per kid per day, so logging twice is a no-op)
//   shower|<kidId>|<ISO time>    -> "1"       older format, one field per press; still read, and merged by migrateShowersOp
//   dog|<ISO time>               -> kidId     who let the dog out, and when

const DAY_MS = 86400000;

export const pad = (n) => String(n).padStart(2, '0');
const mod = (a, n) => ((a % n) + n) % n;

export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Whole days since the epoch, immune to DST shifts.
export function dayNumber(d) {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function weekStart(d, weekStartsOn = 0) {
  return addDays(d, -mod(d.getDay() - weekStartsOn, 7));
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekIndex(start, config, offset = 0) {
  const anchor = weekStart(parseKey(config.rotationStart), config.weekStartsOn);
  return Math.floor((dayNumber(start) - dayNumber(anchor)) / 7) + offset;
}

// In week 0 chore i belongs to kid i. Each week every kid moves one chore down the list.
export function rotationKid(choreIndex, wIndex, kids) {
  return kids[mod(choreIndex - wIndex, kids.length)].id;
}

export function getOffset(data) {
  const n = parseInt(data.offset ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

// -> { [choreId]: { kidId, rotationKidId, overridden } }
export function assignments(config, data, start) {
  const wk = dateKey(start);
  const w = weekIndex(start, config, getOffset(data));
  const kidIds = new Set(config.kids.map((k) => k.id));
  const out = {};
  config.chores.forEach((chore, i) => {
    const rotationKidId = rotationKid(i, w, config.kids);
    const ov = data[`ov|${wk}|${chore.id}`];
    const kidId = ov && kidIds.has(ov) ? ov : rotationKidId;
    out[chore.id] = { kidId, rotationKidId, overridden: kidId !== rotationKidId };
  });
  return out;
}

function overrideOp(field, kidId, rotationKidId, op) {
  if (kidId === rotationKidId) op.del.push(field);
  else op.set[field] = kidId;
}

// Swap the kids on two chores for one week. Overrides that land back on the
// normal rotation are deleted so "Swapped" tags stay accurate.
export function swapOp(config, data, start, choreA, choreB) {
  const wk = dateKey(start);
  const a = assignments(config, data, start);
  const op = { set: {}, del: [] };
  overrideOp(`ov|${wk}|${choreA}`, a[choreB].kidId, a[choreA].rotationKidId, op);
  overrideOp(`ov|${wk}|${choreB}`, a[choreA].kidId, a[choreB].rotationKidId, op);
  return op;
}

export function reassignOp(config, data, start, choreId, kidId) {
  const wk = dateKey(start);
  const a = assignments(config, data, start);
  const op = { set: {}, del: [] };
  overrideOp(`ov|${wk}|${choreId}`, kidId, a[choreId].rotationKidId, op);
  return op;
}

export function clearWeekOp(data, start) {
  const prefix = `ov|${dateKey(start)}|`;
  return { set: {}, del: Object.keys(data).filter((f) => f.startsWith(prefix)) };
}

export function periodKey(chore, day, start) {
  return chore.when === 'weekly' ? `w${dateKey(start)}` : dateKey(day);
}

// For rotating chores any kid's check counts (the chore may have been swapped after).
export function doneFields(data, period, choreId, kidId = null) {
  const prefix = `done|${period}|${choreId}|`;
  return Object.keys(data).filter((f) => f.startsWith(prefix) && (!kidId || f === prefix + kidId));
}

export function toggleDoneOp(data, period, choreId, kidId, perKid) {
  const existing = doneFields(data, period, choreId, perKid ? kidId : null);
  if (existing.length) return { set: {}, del: existing };
  return { set: { [`done|${period}|${choreId}|${kidId}`]: new Date().toISOString() }, del: [] };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function showerField(kidId, day) {
  return `shower|${kidId}|${dateKey(day)}`;
}

// When a shower field says it happened, for either format. null if unreadable.
function showerTime(f, value) {
  const key = f.split('|')[2] || '';
  if (DATE_KEY.test(key)) {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) return at;
    const d = parseKey(key);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  }
  const at = new Date(key);
  return Number.isNaN(at.getTime()) ? null : at;
}

// One entry per day, newest first: { day: dateKey, at: Date, fields: [all fields for that day] }.
export function showers(data, kidId) {
  const prefix = `shower|${kidId}|`;
  const byDay = new Map();
  for (const f of Object.keys(data)) {
    if (!f.startsWith(prefix)) continue;
    const at = showerTime(f, data[f]);
    if (!at) continue;
    const day = dateKey(at);
    const entry = byDay.get(day);
    if (!entry) byDay.set(day, { day, at, fields: [f] });
    else {
      entry.fields.push(f);
      if (at > entry.at) entry.at = at;
    }
  }
  return [...byDay.values()].sort((x, y) => y.at - x.at);
}

// Rewrites old one-per-press shower fields as one field per kid per day. null when there's nothing to do.
export function migrateShowersOp(data) {
  const op = { set: {}, del: [] };
  for (const f of Object.keys(data)) {
    const parts = f.split('|');
    if (parts[0] !== 'shower' || parts.length !== 3 || DATE_KEY.test(parts[2])) continue;
    const at = showerTime(f, data[f]);
    op.del.push(f);
    if (!at) continue;
    const field = showerField(parts[1], at);
    const current = op.set[field] || data[field];
    if (!current || new Date(current) < at) op.set[field] = at.toISOString();
  }
  return op.del.length ? op : null;
}

export function daysBetween(earlier, later) {
  return dayNumber(later) - dayNumber(earlier);
}

// Every time the dog was let out, newest first: { field, at: Date, kidId }.
export function dogTrips(data) {
  const out = [];
  for (const f of Object.keys(data)) {
    if (!f.startsWith('dog|')) continue;
    const at = new Date(f.slice(4));
    if (!Number.isNaN(at.getTime())) out.push({ field: f, at, kidId: data[f] });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function showerEvery(kid, config) {
  return kid.showerEvery ?? config.showerEvery ?? 2;
}

// -> { days: number|null, every, status: 'fresh'|'due'|'overdue'|'none', last: Date|null }
export function showerStatus(data, kid, config, now = new Date()) {
  const last = showers(data, kid.id)[0]?.at ?? null;
  const every = showerEvery(kid, config);
  if (!last) return { days: null, every, status: 'none', last: null };
  const days = Math.max(0, daysBetween(last, now));
  const status = days < every ? 'fresh' : days === every ? 'due' : 'overdue';
  return { days, every, status, last };
}

// Drop check-offs, overrides and showers older than `keepDays` so the store stays small.
export function pruneOp(data, now = new Date(), keepDays = 120) {
  const cutoff = dayNumber(now) - keepDays;
  const del = [];
  for (const f of Object.keys(data)) {
    const parts = f.split('|');
    let key = null;
    if (parts[0] === 'ov') key = parts[1];
    else if (parts[0] === 'done') key = parts[1].replace(/^w/, '');
    else if (parts[0] === 'shower') key = parts[2]?.slice(0, 10);
    else if (parts[0] === 'dog') key = parts[1]?.slice(0, 10);
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key) && dayNumber(parseKey(key)) < cutoff) del.push(f);
  }
  return del.length ? { set: {}, del } : null;
}

// ---------- tasks per day ----------

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function taskDays(config, task) {
  return task.days || config.days || ALL_DAYS;
}

export function isTaskDay(config, task, day) {
  return taskDays(config, task).includes(day.getDay());
}

// A weekly job's room is its own row, but it travels with the job when the job rotates or is swapped.
export function roomTask(chore) {
  return { when: chore.when, ...chore.room, jobId: chore.id };
}

export function allTasks(config) {
  const out = [];
  for (const c of config.chores) {
    out.push(c);
    if (c.room) out.push(roomTask(c));
  }
  return out.concat(config.everyone || []);
}

// Days of the week that get a column on the chart.
export function chartDays(config, start) {
  return weekDays(start).filter((d) => (config.days || ALL_DAYS).includes(d.getDay()));
}

// A read-only snapshot of `data` with the check-offs indexed, so the chart and the awards
// can ask thousands of "is this done?" questions per render without rescanning every field.
export function makeView(config, data) {
  const done = new Map(); // `${period}|${taskId}` -> Map(kidId -> time ms)
  const showerTimes = new Map(); // kidId -> [Date] newest first
  const trips = dogTrips(data);
  for (const f of Object.keys(data)) {
    const parts = f.split('|');
    if (parts[0] === 'done' && parts.length === 4) {
      const key = `${parts[1]}|${parts[2]}`;
      if (!done.has(key)) done.set(key, new Map());
      done.get(key).set(parts[3], Date.parse(data[f]) || 0);
    } else if (parts[0] === 'shower' && parts.length === 3 && !showerTimes.has(parts[1])) {
      showerTimes.set(parts[1], showers(data, parts[1]).map((x) => x.at));
    }
  }

  const weeks = new Map();
  function assign(start) {
    const key = dateKey(start);
    if (!weeks.has(key)) weeks.set(key, assignments(config, data, start));
    return weeks.get(key);
  }

  function isDone(period, taskId, kidId = null) {
    const m = done.get(`${period}|${taskId}`);
    return Boolean(m) && (kidId ? m.has(kidId) : m.size > 0);
  }

  function doneTime(period, taskId, kidId = null) {
    const m = done.get(`${period}|${taskId}`);
    if (!m) return 0;
    if (kidId) return m.get(kidId) || 0;
    return Math.max(0, ...m.values());
  }

  // Daily tasks a kid has on `day`: their weekly job (and its room) for that week, plus the every-day list.
  function dailyTasks(kidId, day) {
    const start = weekStart(day, config.weekStartsOn);
    const a = assign(start);
    const out = [];
    for (const c of config.chores) {
      if (a[c.id].kidId !== kidId) continue;
      out.push({ task: c, perKid: false });
      if (c.room) out.push({ task: roomTask(c), perKid: false });
    }
    for (const c of config.everyone || []) out.push({ task: c, perKid: true });
    return out.filter(({ task }) => task.when !== 'weekly' && isTaskDay(config, task, day));
  }

  // -> { total, done, complete, finishedAt: Date|null }
  function dayProgress(kidId, day) {
    const period = dateKey(day);
    const tasks = dailyTasks(kidId, day);
    let count = 0;
    let last = 0;
    for (const { task, perKid } of tasks) {
      if (!isDone(period, task.id, perKid ? kidId : null)) continue;
      count += 1;
      last = Math.max(last, doneTime(period, task.id, perKid ? kidId : null));
    }
    const complete = tasks.length > 0 && count === tasks.length;
    return { total: tasks.length, done: count, complete, finishedAt: complete && last ? new Date(last) : null };
  }

  return {
    config,
    data,
    assign,
    isDone,
    doneTime,
    dailyTasks,
    dayProgress,
    showers: (kidId) => showerTimes.get(kidId) || [],
    dogTrips: trips,
  };
}

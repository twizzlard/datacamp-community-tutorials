// Pure helpers: dates, the weekly rotation, overrides and shower math.
// Everything here works on the flat `data` map that the store syncs:
//   offset                       -> "0"       whole-rotation shift (settings)
//   ov|<weekKey>|<choreId>       -> kidId     manual override for one week
//   done|<periodKey>|<choreId>|<kidId> -> ISO time   a check-off
//   shower|<kidId>|<ISO time>    -> "1"       one logged shower

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

export function showers(data, kidId) {
  const prefix = `shower|${kidId}|`;
  return Object.keys(data)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ field: f, at: new Date(f.slice(prefix.length)) }))
    .filter((s) => !Number.isNaN(s.at.getTime()))
    .sort((x, y) => y.at - x.at);
}

export function daysBetween(earlier, later) {
  return dayNumber(later) - dayNumber(earlier);
}

// -> { days: number|null, status: 'fresh'|'due'|'overdue'|'none', last: Date|null }
export function showerStatus(data, kid, config, now = new Date()) {
  const last = showers(data, kid.id)[0]?.at ?? null;
  if (!last) return { days: null, status: 'none', last: null };
  const every = kid.showerEvery ?? config.showerEvery ?? 2;
  const days = Math.max(0, daysBetween(last, now));
  const status = days < every ? 'fresh' : days === every ? 'due' : 'overdue';
  return { days, status, last };
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
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key) && dayNumber(parseKey(key)) < cutoff) del.push(f);
  }
  return del.length ? { set: {}, del } : null;
}

import { CONFIG } from './config.js';
import * as L from './logic.js';
import { sticker, ICONS, rgba, darken, lighten } from './art.js';
import { createStore } from './store.js';

const kidsById = Object.fromEntries(CONFIG.kids.map((k) => [k.id, k]));
const choresById = Object.fromEntries([...CONFIG.chores, ...CONFIG.everyone].map((c) => [c.id, c]));

const ui = { weekOffset: 0, sheet: null, toast: null, pop: null };
const boardEl = document.getElementById('board');
const sheetEl = document.getElementById('sheet');
const toastEl = document.getElementById('toast');
const loadedOn = L.dateKey(new Date());
let toastTimer = null;
let pruned = false;
let wakeState = 'off';

// A static preview copy can pin itself to on-device storage with <meta name="chore-chart-storage" content="local">.
const localOnly = document.querySelector('meta[name="chore-chart-storage"]')?.content === 'local';
const store = createStore({ onChange: render, localOnly });

// ---------- formatting ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtLong = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
const fmtWeekday = (d) => d.toLocaleDateString([], { weekday: 'long' });
const dayLetter = (d) => d.toLocaleDateString([], { weekday: 'narrow' });

function fmtRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  return `${fmtShort(start)} – ${sameMonth ? end.getDate() : fmtShort(end)}`;
}

function fmtWhen(at, now) {
  const days = L.daysBetween(at, now);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? fmtWeekday(at) : fmtShort(at);
  return `${day}, ${fmtTime(at)}`;
}

function weekLabel(offset, start) {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return `Week of ${fmtShort(start)}`;
}

function kidStyle(kid) {
  return [
    `--kid:${kid.color}`,
    `--kid-strong:${darken(kid.color, 0.16)}`,
    `--kid-light:${lighten(kid.color, 0.55)}`,
    `--kid-wash:${rgba(kid.color, 0.12)}`,
    `--kid-soft:${rgba(kid.color, 0.28)}`,
  ].join(';');
}

// ---------- state helpers ----------

function context(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = L.weekStart(today, CONFIG.weekStartsOn);
  const start = L.addDays(thisWeek, ui.weekOffset * 7);
  const data = store.data;
  return {
    now,
    today,
    todayKey: L.dateKey(today),
    start,
    days: L.weekDays(start),
    data,
    assign: L.assignments(CONFIG, data, start),
    nextAssign: L.assignments(CONFIG, data, L.addDays(start, 7)),
  };
}

function isDone(ctx, chore, period, kidId, perKid) {
  return L.doneFields(ctx.data, period, chore.id, perKid ? kidId : null).length > 0;
}

// Everything a kid is supposed to do today in the current week.
function allDoneToday(kid, ctx) {
  if (ui.weekOffset !== 0) return false;
  const tasks = [];
  for (const c of CONFIG.chores) if (ctx.assign[c.id].kidId === kid.id) tasks.push([c, false]);
  for (const c of CONFIG.everyone) tasks.push([c, true]);
  if (!tasks.length) return false;
  return tasks.every(([c, perKid]) => isDone(ctx, c, L.periodKey(c, ctx.today, ctx.start), kid.id, perKid));
}

// The op that puts back whatever `op` is about to change.
function invert(op, data) {
  const back = { set: {}, del: [] };
  for (const f of [...Object.keys(op.set || {}), ...(op.del || [])]) {
    if (f in data) back.set[f] = data[f];
    else back.del.push(f);
  }
  return back;
}

function commitWithUndo(op, text) {
  const undo = invert(op, store.data);
  store.commit(op);
  showToast(text, undo);
}

// ---------- rendering ----------

function header(ctx) {
  const end = L.addDays(ctx.start, 6);
  return `<header class="rail">
    <div class="brand">
      <h1>${esc(CONFIG.title)}</h1>
      <p>${fmtLong(ctx.now)} <span class="clock">${fmtTime(ctx.now)}</span></p>
    </div>
    <nav class="weeknav" aria-label="Choose week">
      <button class="icon-btn" data-action="week" data-delta="-1" aria-label="Previous week">${ICONS.left}</button>
      <div class="weeklabel"><strong>${weekLabel(ui.weekOffset, ctx.start)}</strong><span>${fmtRange(ctx.start, end)}</span></div>
      <button class="icon-btn" data-action="week" data-delta="1" aria-label="Next week">${ICONS.right}</button>
    </nav>
    <div class="tools">
      ${ui.weekOffset ? '<button class="btn btn-small" data-action="week" data-delta="0">Back to today</button>' : ''}
      <button class="icon-btn sync sync--${store.mode}" data-action="settings" aria-label="Settings">${ICONS.gear}<i aria-hidden="true"></i></button>
    </div>
  </header>`;
}

function dayChecks(kid, chore, ctx, perKid) {
  if (chore.when === 'weekly') {
    const period = L.periodKey(chore, null, ctx.start);
    const done = isDone(ctx, chore, period, kid.id, perKid);
    const future = ctx.start > ctx.today;
    const pop = ui.pop === `${period}|${chore.id}|${kid.id}` ? ' pop' : '';
    return `<button class="week-check${done ? ' is-done' : ''}${pop}" data-action="done" data-chore="${chore.id}" data-kid="${kid.id}"
        data-period="${period}" data-perkid="${perKid ? 1 : 0}" aria-pressed="${done}" ${future ? 'disabled' : ''}>
        <span class="mark">${done ? ICONS.star : ''}</span><span>${done ? 'Done this week!' : 'Done this week?'}</span></button>`;
  }
  const cells = ctx.days.map((d) => {
    const period = L.dateKey(d);
    const done = isDone(ctx, chore, period, kid.id, perKid);
    const today = period === ctx.todayKey;
    const future = d > ctx.today;
    const pop = ui.pop === `${period}|${chore.id}|${kid.id}` ? ' pop' : '';
    const cls = `day${done ? ' is-done' : ''}${today ? ' is-today' : ''}${future ? ' is-future' : ''}${pop}`;
    return `<button class="${cls}" data-action="done" data-chore="${chore.id}" data-kid="${kid.id}" data-period="${period}"
        data-perkid="${perKid ? 1 : 0}" aria-pressed="${done}" aria-label="${esc(chore.name)}, ${fmtWeekday(d)}" ${future ? 'disabled' : ''}>
        <span class="mark">${done ? ICONS.star : ''}</span><span class="dl">${dayLetter(d)}</span></button>`;
  });
  return `<div class="days" role="group" aria-label="${esc(chore.name)} by day">${cells.join('')}</div>`;
}

function showerBlock(kid, ctx) {
  const sh = L.showerStatus(ctx.data, kid, CONFIG, ctx.now);
  const word = { fresh: 'Fresh', due: 'Due today', overdue: 'Overdue', none: 'Not logged' }[sh.status];
  const num = sh.days ?? '?';
  const unit = sh.days === 1 ? 'day' : 'days';
  return `<div class="shower shower--${sh.status}">
    <button class="counter" data-action="shower-sheet" data-kid="${kid.id}" aria-label="${esc(kid.name)}: ${num} ${unit} since last shower. Open shower log.">
      <span class="num">${num}</span><span class="cap"><span>${unit} since<br>last shower</span><span class="pill">${word}</span></span>
    </button>
    <button class="btn btn-kid" data-action="shower" data-kid="${kid.id}">${ICONS.shower}<span>Showered!</span></button>
  </div>`;
}

function jobCard(kid, chore, ctx) {
  const a = ctx.assign[chore.id];
  return `<article class="job">
    <div class="job-top">
      <button class="job-art" data-action="chore" data-chore="${chore.id}" aria-label="Swap ${esc(chore.name)}">
        ${sticker(chore.icon, kid, { label: `${kid.name} doing ${chore.name}` })}
      </button>
      <div class="job-head">
        <h4>${esc(chore.name)}</h4>
        ${chore.note ? `<p class="note">${esc(chore.note)}</p>` : ''}
        <div class="job-meta">
          ${a.overridden ? '<span class="tag">Swapped</span>' : ''}
          <button class="btn btn-small btn-ghost" data-action="chore" data-chore="${chore.id}">${ICONS.swap}<span>Swap</span></button>
        </div>
      </div>
    </div>
    ${dayChecks(kid, chore, ctx, false)}
  </article>`;
}

function everyoneBlock(kid, ctx) {
  if (!CONFIG.everyone.length) return '';
  const rows = CONFIG.everyone.map((c) => `<div class="mini">
      <div class="mini-head">${sticker(c.icon, kid, { label: `${kid.name} doing ${c.name}` })}<h4>${esc(c.name)}</h4></div>
      ${dayChecks(kid, c, ctx, true)}
    </div>`);
  return `<div class="everyday"><h3 class="label">Every day</h3>${rows.join('')}</div>`;
}

function kidColumn(kid, ctx) {
  const jobs = CONFIG.chores.filter((c) => ctx.assign[c.id].kidId === kid.id);
  const next = CONFIG.chores.filter((c) => ctx.nextAssign[c.id].kidId === kid.id);
  const nextLabel = ui.weekOffset === 0 ? 'Next week' : 'Week after';
  const rows = CONFIG.everyone.length ? 5 : 4;
  return `<section class="kid" style="${kidStyle(kid)};--rows:${rows}" aria-label="${esc(kid.name)}">
    <div class="kid-top">
      <div class="portrait">${sticker('wave', kid, { label: kid.name })}</div>
      <div class="kid-name">
        <h2>${esc(kid.name)}</h2>
        ${allDoneToday(kid, ctx) ? `<span class="stamp">${ICONS.star}All done today</span>` : ''}
      </div>
    </div>
    ${showerBlock(kid, ctx)}
    <div class="jobs">
      <h3 class="label">${jobs.length > 1 ? 'Jobs' : 'Job'} ${ui.weekOffset === 0 ? 'this week' : 'that week'}</h3>
      ${jobs.length ? jobs.map((c) => jobCard(kid, c, ctx)).join('') : '<p class="empty">No main job. Lucky!</p>'}
    </div>
    ${everyoneBlock(kid, ctx)}
    <p class="next">${nextLabel}: <b>${next.map((c) => esc(c.name)).join(', ') || 'no main job'}</b></p>
  </section>`;
}

// ---------- sheets ----------

function sheetHead(art, title, sub, closable = true) {
  return `<div class="sheet-head">${art ? `<div class="sheet-art">${art}</div>` : ''}
    <div class="sheet-title"><h2 id="sheet-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${closable ? `<button class="icon-btn" data-action="close" aria-label="Close">${ICONS.close}</button>` : ''}</div>`;
}

function choreSheet(ctx, choreId) {
  const chore = choresById[choreId];
  const a = ctx.assign[choreId];
  const kid = kidsById[a.kidId];
  const others = CONFIG.chores.filter((c) => c.id !== choreId);
  const swap = others.length
    ? `<h3 class="label">Swap jobs with</h3><div class="opts">${others.map((c) => {
        const k = kidsById[ctx.assign[c.id].kidId];
        const same = k.id === kid.id;
        return `<button class="opt" style="${kidStyle(k)}" data-action="swap" data-a="${choreId}" data-b="${c.id}" ${same ? 'disabled' : ''}>
          ${sticker(c.icon, k, { label: '' })}<span><b>${esc(k.name)}</b>${esc(c.name)}</span></button>`;
      }).join('')}</div>`
    : '';
  const hand = `<h3 class="label">Or give it to</h3><div class="opts">${CONFIG.kids.map((k) => {
      const has = k.id === kid.id;
      return `<button class="opt" style="${kidStyle(k)}" data-action="assign" data-chore="${choreId}" data-kid="${k.id}" ${has ? 'disabled' : ''}>
        ${sticker('wave', k, { label: '' })}<span><b>${esc(k.name)}</b>${has ? 'Has it now' : 'Does it alone'}</span></button>`;
    }).join('')}</div>`;
  const reset = a.overridden
    ? `<button class="btn btn-wide" data-action="assign" data-chore="${choreId}" data-kid="${a.rotationKidId}">Back to the normal rotation (${esc(kidsById[a.rotationKidId].name)})</button>`
    : '';
  return sheetHead(sticker(chore.icon, kid, { label: '' }), esc(chore.name), `${esc(kid.name)}’s job · ${weekLabel(ui.weekOffset, ctx.start).toLowerCase()}`)
    + swap + hand + reset
    + `<p class="fine">Only changes ${ui.weekOffset === 0 ? 'this week' : 'that week'}. The rotation picks up as normal the week after.</p>`;
}

function showerSheet(ctx, kidId) {
  const kid = kidsById[kidId];
  const sh = L.showerStatus(ctx.data, kid, CONFIG, ctx.now);
  const list = L.showers(ctx.data, kidId).slice(0, 8);
  const sub = sh.last ? `Last shower: ${fmtWhen(sh.last, ctx.now)}` : 'No showers logged yet';
  return sheetHead(sticker('shower', kid, { label: '' }), `${esc(kid.name)}’s showers`, sub)
    + `<h3 class="label">Log a shower</h3><div class="btn-row">
        <button class="btn btn-kid" style="${kidStyle(kid)}" data-action="shower" data-kid="${kidId}" data-when="0">Just now</button>
        <button class="btn" data-action="shower" data-kid="${kidId}" data-when="1">Last night</button>
        <button class="btn" data-action="shower" data-kid="${kidId}" data-when="2">2 nights ago</button>
      </div>
      <h3 class="label">Recent</h3>
      ${list.length ? `<ul class="history">${list.map((s) => `<li><span>${fmtWhen(s.at, ctx.now)}</span>
        <button class="icon-btn icon-btn-small" data-action="unshower" data-field="${esc(s.field)}" aria-label="Remove this shower">${ICONS.close}</button></li>`).join('')}</ul>`
        : '<p class="fine">Nothing yet.</p>'}`;
}

const SYNC_TEXT = {
  cloud: 'Synced. Every phone and tablet with this page sees the same chart.',
  connecting: 'Connecting…',
  offline: 'Offline. Taps are saved here and will sync when the connection is back.',
  local: 'Saved on this device only. Add an Upstash Redis database in Vercel to sync between devices (see README).',
  locked: 'This chart needs the family key.',
};

const WAKE_TEXT = {
  on: 'The screen stays on while this page is open.',
  off: 'Tap anywhere to keep the screen on.',
  blocked: 'This browser didn’t allow keeping the screen on. Set the tablet’s auto-lock to Never instead.',
  unsupported: 'This browser can’t keep the screen on. Set the tablet’s auto-lock to Never instead.',
};

function keyForm(label) {
  return `<form class="key-form" data-form="key">
    <label for="family-key">${label}</label>
    <div class="btn-row"><input id="family-key" name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="btn btn-primary" type="submit">Unlock</button></div>
  </form>`;
}

function settingsSheet(ctx) {
  const swaps = L.clearWeekOp(ctx.data, ctx.start).del.length;
  return sheetHead('', 'Settings', '')
    + `<section class="set"><h3 class="label">Saving</h3><p class="sync-line sync--${store.mode}"><i></i>${SYNC_TEXT[store.mode]}</p>
        ${store.pendingCount ? `<p class="fine">${store.pendingCount} change${store.pendingCount > 1 ? 's' : ''} waiting to sync.</p>` : ''}
        ${store.mode === 'cloud' && store.hasKey ? '<button class="btn btn-small" data-action="forget-key">Forget the family key on this device</button>' : ''}
      </section>
      <section class="set"><h3 class="label">Rotation</h3>
        <p>Moves every main job one kid over, for every week. Use it if the rotation is out of step.</p>
        <div class="btn-row"><button class="btn" data-action="shift" data-delta="-1">${ICONS.left}<span>Back one</span></button>
        <button class="btn" data-action="shift" data-delta="1"><span>Forward one</span>${ICONS.right}</button></div>
      </section>
      <section class="set"><h3 class="label">Swaps ${ui.weekOffset === 0 ? 'this week' : 'that week'}</h3>
        ${swaps ? `<button class="btn" data-action="clear-swaps">Undo all ${swaps} swap${swaps > 1 ? 's' : ''}</button>` : '<p>None. Tap a job’s picture to swap it.</p>'}
      </section>
      <section class="set"><h3 class="label">Screen</h3><p>${WAKE_TEXT[wakeState]}</p></section>`;
}

function keySheet() {
  return sheetHead('', 'Family key', '', false)
    + `<p>This chart is locked. Type the family key you set in Vercel. You only need to do this once per device.</p>${keyForm('Family key')}`;
}

function renderSheet(ctx) {
  if (store.mode === 'locked' && !ui.sheet) ui.sheet = { type: 'key' };
  if (store.mode !== 'locked' && ui.sheet?.type === 'key') ui.sheet = null;
  document.body.classList.toggle('has-sheet', Boolean(ui.sheet));
  if (!ui.sheet) {
    sheetEl.innerHTML = '';
    delete sheetEl.dataset.open;
    return;
  }
  // Don't wipe what someone is typing when a background sync re-renders.
  if (sheetEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const s = ui.sheet;
  const body = s.type === 'chore' ? choreSheet(ctx, s.id)
    : s.type === 'shower' ? showerSheet(ctx, s.id)
    : s.type === 'settings' ? settingsSheet(ctx)
    : keySheet();
  const fresh = sheetEl.dataset.open !== `${s.type}:${s.id || ''}`;
  sheetEl.dataset.open = `${s.type}:${s.id || ''}`;
  const scrimAction = s.type === 'key' ? '' : ' data-action="close"';
  sheetEl.innerHTML = `<div class="scrim"${scrimAction}></div>
    <div class="sheet${fresh ? ' sheet-in' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${body}</div>`;
  if (fresh) sheetEl.querySelector('#family-key')?.focus({ preventScroll: true });
}

function renderToast() {
  toastEl.innerHTML = ui.toast
    ? `<div class="toast" role="status"><span>${esc(ui.toast.text)}</span>${ui.toast.undo ? '<button class="btn btn-small" data-action="undo">Undo</button>' : ''}</div>`
    : '';
}

function render() {
  const ctx = context();
  boardEl.innerHTML = header(ctx)
    + `<main class="board" style="--cols:${CONFIG.kids.length}">${CONFIG.kids.map((k) => kidColumn(k, ctx)).join('')}</main>`;
  ui.pop = null;
  renderSheet(ctx);
  renderToast();
  if (!pruned && (store.mode === 'cloud' || store.mode === 'local')) {
    pruned = true;
    store.commit(L.pruneOp(store.data));
  }
}

function showToast(text, undo = null) {
  ui.toast = { text, undo };
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    renderToast();
  }, 7000);
}

// ---------- actions ----------

function showerAt(daysAgo) {
  const now = new Date();
  if (!daysAgo) return now;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 19, 30);
}

const ACTIONS = {
  week(el) {
    const delta = Number(el.dataset.delta);
    ui.weekOffset = delta === 0 ? 0 : ui.weekOffset + delta;
    render();
  },
  done(el) {
    const { chore, kid, period } = el.dataset;
    const op = L.toggleDoneOp(store.data, period, chore, kid, el.dataset.perkid === '1');
    if (Object.keys(op.set).length) ui.pop = `${period}|${chore}|${kid}`;
    store.commit(op);
  },
  shower(el) {
    const kid = kidsById[el.dataset.kid];
    const at = showerAt(Number(el.dataset.when || 0));
    const field = `shower|${kid.id}|${at.toISOString()}`;
    ui.sheet = null;
    commitWithUndo({ set: { [field]: '1' }, del: [] }, `${kid.name}’s shower is logged.`);
  },
  unshower(el) {
    commitWithUndo({ set: {}, del: [el.dataset.field] }, 'Shower removed.');
  },
  'shower-sheet'(el) {
    ui.sheet = { type: 'shower', id: el.dataset.kid };
    render();
  },
  chore(el) {
    ui.sheet = { type: 'chore', id: el.dataset.chore };
    render();
  },
  swap(el) {
    const ctx = context();
    const { a, b } = el.dataset;
    const ka = kidsById[ctx.assign[a].kidId];
    const kb = kidsById[ctx.assign[b].kidId];
    ui.sheet = null;
    commitWithUndo(L.swapOp(CONFIG, store.data, ctx.start, a, b),
      `${ka.name} has ${choresById[b].name}, ${kb.name} has ${choresById[a].name}.`);
  },
  assign(el) {
    const ctx = context();
    const { chore, kid } = el.dataset;
    ui.sheet = null;
    commitWithUndo(L.reassignOp(CONFIG, store.data, ctx.start, chore, kid),
      `${choresById[chore].name} goes to ${kidsById[kid].name}.`);
  },
  'clear-swaps'() {
    const ctx = context();
    ui.sheet = null;
    commitWithUndo(L.clearWeekOp(store.data, ctx.start), 'Back to the normal rotation.');
  },
  shift(el) {
    const next = L.getOffset(store.data) + Number(el.dataset.delta);
    commitWithUndo({ set: { offset: String(next) }, del: [] }, 'Rotation shifted.');
  },
  settings() {
    ui.sheet = { type: 'settings' };
    render();
  },
  'forget-key'() {
    store.setKey('');
  },
  close() {
    ui.sheet = null;
    render();
  },
  undo() {
    const { undo } = ui.toast || {};
    ui.toast = null;
    renderToast();
    if (undo) store.commit(undo);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  ACTIONS[el.dataset.action]?.(el);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="key"]');
  if (!form) return;
  e.preventDefault();
  const value = form.querySelector('input').value;
  if (value.trim()) {
    form.querySelector('input').blur();
    store.setKey(value);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet && ui.sheet.type !== 'key') ACTIONS.close();
});

// ---------- fridge duty: keep awake, keep the clock right, pick up new deploys ----------

async function keepAwake() {
  if (!('wakeLock' in navigator)) {
    wakeState = 'unsupported';
    return;
  }
  if (wakeState === 'on' || document.visibilityState !== 'visible') return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    wakeState = 'on';
    lock.addEventListener('release', () => {
      wakeState = 'off';
    });
  } catch {
    wakeState = 'blocked';
  }
}

document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerdown', () => {
  if (wakeState !== 'on') keepAwake();
}, { passive: true });

let lastMinute = new Date().getMinutes();
setInterval(() => {
  const now = new Date();
  // Reload once a night so the fridge picks up code changes.
  if (L.dateKey(now) !== loadedOn && now.getHours() >= 3 && !ui.sheet) {
    location.reload();
    return;
  }
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    if (!(sheetEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) render();
  }
}, 5000);

// A family key can arrive in the link once (?key=...), then it lives on the device.
const params = new URLSearchParams(location.search);
if (params.get('key')) {
  store.setKey(params.get('key'));
  params.delete('key');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
}

render();
store.start();
keepAwake();

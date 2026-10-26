import { CONFIG } from './config.js';
import * as L from './logic.js';
import { sticker, petSticker, setPet, medal, ICONS, rgba, darken, lighten } from './art.js';
import { awardList, computeAwards } from './awards.js';
import * as FX from './fx.js';
import { createStore } from './store.js';

const kidsById = Object.fromEntries(CONFIG.kids.map((k) => [k.id, k]));
const choresById = Object.fromEntries(CONFIG.chores.map((c) => [c.id, c]));
const tasksById = Object.fromEntries(L.allTasks(CONFIG).map((t) => [t.id, t]));
const PET = CONFIG.pet || null;
if (PET) setPet(PET.look);

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

// The weekday of the last shower; a date once it's more than a week back.
function showerDay(at, now) {
  const days = L.daysBetween(at, now);
  if (days === 0) return 'Today';
  return days < 7 ? fmtWeekday(at) : fmtShort(at);
}

// "at 3:42 PM, 20 min ago", "yesterday at 9:10 PM", "Thursday at 9:10 PM"
function fmtTrip(at, now) {
  const days = L.daysBetween(at, now);
  if (days === 0) {
    const mins = Math.round((now - at) / 60000);
    const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ago`;
    return `at ${fmtTime(at)}, ${ago}`;
  }
  return `${days === 1 ? 'yesterday' : days < 7 ? fmtWeekday(at) : fmtShort(at)} at ${fmtTime(at)}`;
}

function weekLabel(offset, start) {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  return `Week of ${fmtShort(start)}`;
}

const jobName = (c) => (c.room ? `${c.name} & ${c.room.name.charAt(0).toLowerCase()}${c.room.name.slice(1)}` : c.name);

function kidStyle(kid) {
  return [
    `--kid:${kid.color}`,
    `--kid-strong:${darken(kid.color, 0.16)}`,
    `--kid-light:${lighten(kid.color, 0.55)}`,
    `--kid-wash:${rgba(kid.color, 0.1)}`,
    `--kid-tint:${rgba(kid.color, 0.2)}`,
    `--kid-soft:${rgba(kid.color, 0.32)}`,
  ].join(';');
}

// ---------- state helpers ----------

function context(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = L.weekStart(today, CONFIG.weekStartsOn);
  const start = L.addDays(thisWeek, ui.weekOffset * 7);
  const data = store.data;
  const view = L.makeView(CONFIG, data);
  return {
    now,
    today,
    todayKey: L.dateKey(today),
    start,
    days: L.chartDays(CONFIG, start),
    data,
    view,
    assign: view.assign(start),
    nextAssign: view.assign(L.addDays(start, 7)),
    awards: computeAwards(view, start, now),
  };
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
  const team = ctx.awards.teamDays.length;
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
      <button class="icon-btn" data-action="awards" aria-label="Awards">${ICONS.trophy}${team ? `<b class="count" aria-label="${team} team days">${team}</b>` : ''}</button>
      <button class="icon-btn sync sync--${store.mode}" data-action="settings" aria-label="Settings">${ICONS.gear}<i aria-hidden="true"></i></button>
    </div>
  </header>`;
}

function dogBar(ctx) {
  if (!PET) return '';
  const last = ctx.view.dogTrips[0];
  const lastText = last
    ? `Last out ${fmtTrip(last.at, ctx.now)} with ${esc(kidsById[last.kidId]?.name || 'someone')}`
    : 'No trips logged yet';
  const kids = CONFIG.kids.map((k) => {
    const n = ctx.awards.dogPoints[k.id] || 0;
    return `<button class="dog-kid" style="${kidStyle(k)}" data-action="dog" data-kid="${k.id}"
        aria-label="${esc(k.name)} let ${esc(PET.name)} out. ${n} paw points ${weekLabel(ui.weekOffset, ctx.start).toLowerCase()}.">
      <span class="dog-face">${sticker('wave', k, { label: '' })}</span><span class="dog-name">${esc(k.name)}</span>
      <span class="paws">${ICONS.paw}<b>${n}</b></span></button>`;
  }).join('');
  return `<section class="dogbar" aria-label="Who let ${esc(PET.name)} out?">
    <button class="dog-art" data-action="dog-sheet" aria-label="${esc(PET.name)}’s trips">${petSticker({ label: PET.name })}</button>
    <div class="dog-text"><h2>Who let ${esc(PET.name)} out?</h2><p>${lastText}</p></div>
    <div class="dog-kids">${kids}</div>
  </section>`;
}

function showerBlock(kid, ctx) {
  const sh = L.showerStatus(ctx.data, kid, CONFIG, ctx.now);
  const word = sh.status === 'none' ? 'Not logged'
    : sh.status === 'overdue' ? 'Overdue'
    : sh.status === 'due' ? 'Tonight!'
    : sh.days === sh.every - 1 ? 'Next: tomorrow' : 'Fresh';
  const day = sh.last ? showerDay(sh.last, ctx.now) : 'Not yet';
  const num = sh.days ?? '?';
  const unit = sh.days === 1 ? 'day' : 'days';
  return `<div class="shower shower--${sh.status}">
    <button class="counter" data-action="shower-sheet" data-kid="${kid.id}" aria-label="${esc(kid.name)}: last shower ${day}, ${num} ${unit} ago. Open shower log.">
      <span class="num"><b>${num}</b><small>${unit}</small></span>
      <span class="cap"><span class="cap-label">Last shower</span><b class="cap-day">${day}</b><span class="pill">${word}</span></span>
    </button>
    ${sh.days === 0
      ? `<button class="btn btn-kid is-logged" data-action="shower" data-kid="${kid.id}">${ICONS.check}<span>Showered today</span></button>`
      : `<button class="btn btn-kid" data-action="shower" data-kid="${kid.id}">${ICONS.shower}<span>Showered!</span></button>`}
  </div>`;
}

function badges(kid, ctx) {
  const list = ctx.awards.byKid[kid.id];
  const inner = list.length
    ? list.map((a) => `<span class="badge" title="${esc(a.detail)}">${medal(a.id)}<span>${esc(a.label)}</span></span>`).join('')
    : '<span class="badges-empty">No badges yet this week</span>';
  return `<button class="badges" data-action="awards" aria-label="${esc(kid.name)}’s badges. Open awards.">${inner}</button>`;
}

function dayCell(kid, task, d, ctx, perKid) {
  if (!L.isTaskDay(CONFIG, task, d)) return '<span class="cell is-off"></span>';
  const period = L.dateKey(d);
  const done = ctx.view.isDone(period, task.id, perKid ? kid.id : null);
  const today = period === ctx.todayKey;
  const future = d > ctx.today;
  const pop = ui.pop === `${period}|${task.id}|${kid.id}` ? ' pop' : '';
  const cls = `cell${done ? ' is-done' : ''}${today ? ' is-today' : ''}${future ? ' is-future' : ''}${pop}`;
  return `<button class="${cls}" data-action="done" data-task="${task.id}" data-kid="${kid.id}" data-period="${period}"
      data-perkid="${perKid ? 1 : 0}" aria-pressed="${done}" aria-label="${esc(task.name)}, ${fmtWeekday(d)}" ${future ? 'disabled' : ''}>
      <span class="mark">${done ? ICONS.star : ''}</span></button>`;
}

function weekCell(kid, task, ctx, perKid) {
  const period = `w${L.dateKey(ctx.start)}`;
  const done = ctx.view.isDone(period, task.id, perKid ? kid.id : null);
  const pop = ui.pop === `${period}|${task.id}|${kid.id}` ? ' pop' : '';
  return `<button class="cell cell-week${done ? ' is-done' : ''}${pop}" data-action="done" data-task="${task.id}" data-kid="${kid.id}"
      data-period="${period}" data-perkid="${perKid ? 1 : 0}" aria-pressed="${done}" ${ctx.start > ctx.today ? 'disabled' : ''}>
      <span class="mark">${done ? ICONS.star : ''}</span><span>${done ? 'Done this week!' : 'Once this week'}</span></button>`;
}

function taskRow(kid, task, ctx, { jobId = null, room = false, perKid = false } = {}) {
  const art = `<span class="task-art">${sticker(task.icon, kid, { label: '' })}</span>`;
  let name;
  if (jobId && !room) {
    const swapped = ctx.assign[jobId].overridden ? '<em class="tag">Swapped</em>' : '';
    name = `<button class="task task-btn" data-action="chore" data-chore="${jobId}" aria-label="${esc(task.name)}. Swap or hand it off.">
      ${art}<span class="task-name">${esc(task.name)}${swapped}</span><span class="swap-ico">${ICONS.swap}</span></button>`;
  } else {
    name = `<div class="task">${art}<span class="task-name">${esc(task.name)}</span></div>`;
  }
  const cells = task.when === 'weekly'
    ? weekCell(kid, task, ctx, perKid)
    : ctx.days.map((d) => dayCell(kid, task, d, ctx, perKid)).join('');
  return `<div class="row${jobId ? ' row-job' : ' row-every'}${room ? ' row-room' : ''}">${name}${cells}</div>`;
}

function chart(kid, ctx) {
  const jobs = CONFIG.chores.filter((c) => ctx.assign[c.id].kidId === kid.id);
  const stripe = (cls) => ctx.days.map((d) => `<span class="${cls}${L.dateKey(d) === ctx.todayKey ? ' is-today' : ''}">${cls === 'dh' ? dayLetter(d) : ''}</span>`).join('');
  const head = `<div class="row row-head"><span class="label">Weekly job</span>${stripe('dh')}</div>`;
  const jobRows = jobs.length
    ? jobs.map((c) => taskRow(kid, c, ctx, { jobId: c.id }) + (c.room ? taskRow(kid, L.roomTask(c), ctx, { jobId: c.id, room: true }) : '')).join('')
    : `<div class="row row-empty"><span class="empty">No weekly job. Lucky!</span>${stripe('gap')}</div>`;
  const every = CONFIG.everyone.length
    ? `<div class="row row-sub"><span class="label">Every day</span>${stripe('gap')}</div>${CONFIG.everyone.map((c) => taskRow(kid, c, ctx, { perKid: true })).join('')}`
    : '';
  return `<div class="chart" style="--ndays:${ctx.days.length}" role="group" aria-label="${esc(kid.name)}’s chart">${head}${jobRows}${every}</div>`;
}

function kidTile(kid, ctx) {
  const next = CONFIG.chores.filter((c) => ctx.nextAssign[c.id].kidId === kid.id);
  const nextLabel = ui.weekOffset === 0 ? 'Next week' : 'Week after';
  const today = ui.weekOffset === 0 ? ctx.view.dayProgress(kid.id, ctx.today) : null;
  let status = '';
  if (today && today.complete) {
    status = `<span class="stamp">${ICONS.star}${ctx.awards.firstToday === kid.id ? 'First to finish!' : 'All done!'}</span>`;
  } else if (today && today.total) {
    status = `<span class="today-count"><b>${today.done}</b> of ${today.total} done today</span>`;
  }
  // .kid-side / .kid-main only matter in the portrait band layout; elsewhere they are display: contents.
  return `<section class="kid" style="${kidStyle(kid)}" aria-label="${esc(kid.name)}">
    <div class="kid-side">
      <div class="kid-top">
        <div class="portrait">${sticker('wave', kid, { label: kid.name })}</div>
        <div class="kid-name">
          <h2 style="--name-len:${Math.max(kid.name.length, 4)}">${esc(kid.name)}</h2>
          ${status}
        </div>
      </div>
      ${showerBlock(kid, ctx)}
      ${badges(kid, ctx)}
      <p class="next">${nextLabel}: <b>${next.map((c) => esc(jobName(c))).join(', ') || 'no weekly job'}</b></p>
    </div>
    <div class="kid-main">${chart(kid, ctx)}</div>
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
          ${sticker(c.icon, k, { label: '' })}<span><b>${esc(k.name)}</b>${esc(jobName(c))}</span></button>`;
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
  return sheetHead(sticker(chore.icon, kid, { label: '' }), esc(jobName(chore)), `${esc(kid.name)}’s job · ${weekLabel(ui.weekOffset, ctx.start).toLowerCase()}`)
    + swap + hand + reset
    + `<p class="fine">The room goes with the job. Only changes ${ui.weekOffset === 0 ? 'this week' : 'that week'}; the rotation picks up as normal the week after.</p>`;
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
        <button class="icon-btn icon-btn-small" data-action="unshower" data-fields="${esc(s.fields.join(' '))}" aria-label="Remove this shower">${ICONS.close}</button></li>`).join('')}</ul>`
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
  blocked: 'This browser didn’t allow keeping the screen on. Set the tablet’s screen timeout to its longest option instead.',
  unsupported: 'This browser can’t keep the screen on. Set the tablet’s screen timeout to its longest option instead.',
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
        <p>Moves every weekly job (and its room) one kid over, for every week. Use it if the rotation is out of step.</p>
        <div class="btn-row"><button class="btn" data-action="shift" data-delta="-1">${ICONS.left}<span>Back one</span></button>
        <button class="btn" data-action="shift" data-delta="1"><span>Forward one</span>${ICONS.right}</button></div>
      </section>
      <section class="set"><h3 class="label">Swaps ${ui.weekOffset === 0 ? 'this week' : 'that week'}</h3>
        ${swaps ? `<button class="btn" data-action="clear-swaps">Undo all ${swaps} swap${swaps > 1 ? 's' : ''}</button>` : '<p>None. Tap a weekly job’s name to swap it.</p>'}
      </section>
      <section class="set"><h3 class="label">Screen</h3><p>${WAKE_TEXT[wakeState]}</p></section>`;
}

function dogSheet(ctx) {
  const trips = ctx.view.dogTrips.slice(0, 10);
  const points = CONFIG.kids.map((k) => `${esc(k.name)} ${ctx.awards.dogPoints[k.id] || 0}`).join(' · ');
  return sheetHead(petSticker({ label: '' }), `${esc(PET.name)}’s trips`, `Paw points ${weekLabel(ui.weekOffset, ctx.start).toLowerCase()}: ${points}`)
    + '<h3 class="label">Recent</h3>'
    + (trips.length ? `<ul class="history">${trips.map((t) => `<li><span>${esc(kidsById[t.kidId]?.name || '?')}, ${fmtWhen(t.at, ctx.now)}</span>
        <button class="icon-btn icon-btn-small" data-action="undog" data-field="${esc(t.field)}" aria-label="Remove this trip">${ICONS.close}</button></li>`).join('')}</ul>`
      : '<p class="fine">Nothing yet.</p>')
    + `<p class="fine">Tap your face on the bar when you let ${esc(PET.name)} out. A second tap within ${PET.cooldownMinutes ?? 10} minutes of the last trip doesn’t count.</p>`;
}

function awardsSheet(ctx) {
  const holders = (id) => CONFIG.kids
    .map((k) => ({ k, a: ctx.awards.byKid[k.id].find((x) => x.id === id) }))
    .filter((h) => h.a);
  const items = awardList(CONFIG).map((award) => {
    const hs = holders(award.id);
    return `<li class="award">${medal(award.id)}
      <div class="award-text"><b>${award.name}</b><p>${award.about}</p></div>
      <div class="holders">${hs.length
        ? hs.map(({ k, a }) => `<span class="holder" style="${kidStyle(k)}" title="${esc(a.detail)}">${sticker('wave', k, { label: '' })}<span>${esc(k.name)}</span></span>`).join('')
        : '<span class="fine">Not yet</span>'}</div></li>`;
  }).join('');
  return sheetHead('', 'Awards', weekLabel(ui.weekOffset, ctx.start)) + `<ul class="award-list">${items}</ul>`;
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
    : s.type === 'awards' ? awardsSheet(ctx)
    : s.type === 'dog' ? dogSheet(ctx)
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
    ? `<div class="toast" role="status"><span>${esc(ui.toast.text)}</span>${ui.toast.undo ? `<button class="btn btn-small" data-action="undo">${esc(ui.toast.action)}</button>` : ''}</div>`
    : '';
}

function render() {
  const ctx = context();
  boardEl.innerHTML = header(ctx) + dogBar(ctx)
    + `<main class="board" style="--cols:${CONFIG.kids.length}">${CONFIG.kids.map((k) => kidTile(k, ctx)).join('')}</main>`;
  ui.pop = null;
  fitScreen();
  renderSheet(ctx);
  renderToast();
  if (!pruned && (store.mode === 'cloud' || store.mode === 'local')) {
    pruned = true;
    store.commit(L.migrateShowersOp(store.data));
    store.commit(L.pruneOp(store.data));
  }
}

function showToast(text, undo = null, action = 'Undo') {
  ui.toast = { text, undo, action };
  renderToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    renderToast();
  }, 7000);
}

// ---------- celebrations ----------

const CHEERS = ['Nice!', 'Woohoo!', 'Yes!', 'Boom!', 'Great job!', 'You rock!', 'Awesome!', 'Nailed it!', 'High five!', 'Star!', 'Done!', 'Yay!'];
let lastFx = '';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const centerOf = (rect) => [rect.left + rect.width / 2, rect.top + rect.height / 2];

// A different effect each time: one of the particle bursts, or the kid's sticker for that task popping out.
function celebrateCheck(kid, task, rect) {
  const [x, y] = centerOf(rect);
  const kind = pick([...FX.BURSTS, 'sticker'].filter((k) => k !== lastFx));
  lastFx = kind;
  if (kind === 'sticker') {
    FX.stickerPop(x, y, sticker(task.icon, kid, { label: '' }));
    FX.burst('sparkles', x, y, kid.color);
  } else {
    FX.burst(kind, x, y, kid.color);
  }
  FX.cheer(x, y - 22, Math.random() < 0.3 ? `Go ${esc(kid.name)}!` : pick(CHEERS), darken(kid.color, 0.12));
}

function todaySnapshot(kidId) {
  const view = L.makeView(CONFIG, store.data);
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const team = CONFIG.kids.every((k) => {
    const p = view.dayProgress(k.id, day);
    return p.complete || p.total === 0;
  });
  return { complete: view.dayProgress(kidId, day).complete, team };
}

// After a check: a big moment when a kid finishes the day, a bigger one when everyone has.
function celebrateMilestones(kid, before) {
  const after = todaySnapshot(kid.id);
  if (after.team && !before.team) {
    FX.bigMoment({
      art: `<div class="moment-trio">${CONFIG.kids.map((k) => sticker('wave', k, { label: '' })).join('')}</div>`,
      title: 'Team day!',
      subtitle: 'Everyone checked every box today.',
      colors: CONFIG.kids.map((k) => k.color).concat('#f4b000'),
    });
    return;
  }
  if (after.complete && !before.complete) {
    const now = new Date();
    const view = L.makeView(CONFIG, store.data);
    const awards = computeAwards(view, L.weekStart(now, CONFIG.weekStartsOn), now);
    const s = (awards.byKid[kid.id].find((a) => a.id === 'streak') || {}).label;
    const subtitle = awards.firstToday === kid.id ? 'First to finish today!' : s ? `${s}!` : 'Every box checked today.';
    FX.bigMoment({
      art: sticker('wave', kid, { label: '' }),
      title: `${esc(kid.name)} is all done!`,
      subtitle,
      colors: [kid.color, lighten(kid.color, 0.4), '#f4b000', '#ffffff'],
    });
  }
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
    const { task, kid, period } = el.dataset;
    const op = L.toggleDoneOp(store.data, period, task, kid, el.dataset.perkid === '1');
    const checking = Object.keys(op.set).length > 0;
    const before = checking && period === L.dateKey(new Date()) ? todaySnapshot(kid) : null;
    const rect = el.getBoundingClientRect();
    if (checking) ui.pop = `${period}|${task}|${kid}`;
    store.commit(op);
    if (!checking) return;
    celebrateCheck(kidsById[kid], tasksById[task], rect);
    if (before) celebrateMilestones(kidsById[kid], before);
  },
  // One shower per kid per day: pressing again (or on another device) changes nothing.
  shower(el) {
    const kid = kidsById[el.dataset.kid];
    const daysAgo = Number(el.dataset.when || 0);
    const at = showerAt(daysAgo);
    const field = L.showerField(kid.id, at);
    const when = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'last night' : `on ${fmtWeekday(at)}`;
    ui.sheet = null;
    const sameDay = L.showers(store.data, kid.id).find((s) => s.day === L.dateKey(at));
    if (sameDay) {
      render();
      showToast(`${kid.name}’s shower is already logged for ${when}.`, { set: {}, del: sameDay.fields }, 'Remove it');
      return;
    }
    const [x, y] = centerOf(el.getBoundingClientRect());
    commitWithUndo({ set: { [field]: at.toISOString() }, del: [] }, `${kid.name}’s shower is logged for ${when}.`);
    FX.burst('bubbles', x, y, kid.color);
    FX.cheer(x, y - 24, pick(['So fresh!', 'Squeaky clean!', 'Smells great!']), darken(kid.color, 0.12));
  },
  // Whoever let the dog out gets a paw point. Taps inside the cooldown after a trip don't add another.
  dog(el) {
    const kid = kidsById[el.dataset.kid];
    const now = new Date();
    const last = L.dogTrips(store.data)[0];
    if (last && now - last.at < (PET.cooldownMinutes ?? 10) * 60000) {
      const mins = Math.max(1, Math.round((now - last.at) / 60000));
      showToast(`${PET.name} went out ${mins} min ago with ${kidsById[last.kidId]?.name || 'someone'}. That trip already counts.`);
      return;
    }
    const [x, y] = centerOf(el.getBoundingClientRect());
    commitWithUndo({ set: { [`dog|${now.toISOString()}`]: kid.id }, del: [] }, `${kid.name} let ${PET.name} out. +1 paw!`);
    FX.burst('paws', x, y, darken(PET.look?.fur || '#d9a066', 0.25));
    FX.stickerPop(x, y - 30, sticker('dogout', kid, { label: '' }));
    FX.cheer(x, y - 40, pick(['Good job!', `${PET.name} says thanks!`, 'Woof!', '+1 paw!']), darken(kid.color, 0.12));
  },
  undog(el) {
    commitWithUndo({ set: {}, del: [el.dataset.field] }, 'Trip removed.');
  },
  'dog-sheet'() {
    ui.sheet = { type: 'dog' };
    render();
  },
  unshower(el) {
    commitWithUndo({ set: {}, del: el.dataset.fields.split(' ') }, 'Shower removed.');
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
      `${ka.name} has ${choresById[b].name.toLowerCase()}, ${kb.name} has ${choresById[a].name.toLowerCase()}.`);
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
  awards() {
    ui.sheet = { type: 'awards' };
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

// Tablets and fridge screens: scale the board so the whole chart fits on one screen, as large as the
// width allows. Only the board is zoomed; sheets and celebrations stay at normal size on top of it.
// Phones just scroll.
const FIT = matchMedia('(min-width: 600px) and (orientation: portrait), (min-width: 761px) and (orientation: landscape)');
const PORTRAIT = matchMedia('(orientation: portrait)');

function fitScreen() {
  const b = boardEl;
  b.style.zoom = '';
  b.style.width = '';
  b.style.setProperty('--screen-h', '0px');
  if (!FIT.matches) {
    b.style.removeProperty('--screen-h');
    return;
  }
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // At zoom z the layout is vw/z wide; zooming out widens it and shortens the content.
  // Find the largest zoom (up to the design width) at which everything fits on screen.
  const fits = (z) => {
    b.style.width = `${vw / z}px`;
    return b.offsetHeight * z <= vh;
  };
  let zoom = Math.min(vw / (PORTRAIT.matches ? 760 : 1180), 2);
  if (!fits(zoom)) {
    let lo = 0.6;
    let hi = zoom;
    for (let i = 0; i < 8; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    zoom = lo;
  }
  b.style.width = `${vw / zoom}px`;
  b.style.zoom = String(zoom);
  b.style.setProperty('--screen-h', `${Math.floor(vh / zoom)}px`);
}

window.addEventListener('resize', fitScreen);
if (document.fonts) document.fonts.ready.then(fitScreen);
render();
store.start();
keepAwake();

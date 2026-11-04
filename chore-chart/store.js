// Keeps the chart's flat key/value map in sync with /api/state.
// Writes apply locally first, queue in localStorage, then flush to the server,
// so a flaky fridge Wi-Fi never loses a tap.
//
// mode: 'connecting' | 'cloud' | 'offline' | 'local' (no backend, this device only) | 'locked' (wrong family key)

const API = 'api/state';
// An always-on fridge is the main source of requests: ~32K a month at these rates,
// comfortably inside the Vercel Hobby and Upstash free tiers. Opening the page refreshes immediately.
const POLL_MS = 60000;
const NIGHT_POLL_MS = 5 * 60000; // 10pm to 6am
const RETRY_MS = 10000;

const ls = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or storage blocked: keep going in memory */
    }
  },
};

export function applyOp(data, op) {
  for (const [f, v] of Object.entries(op.set || {})) data[f] = v;
  for (const f of op.del || []) delete data[f];
  return data;
}

function mergeOps(ops) {
  const set = {};
  const del = new Set();
  for (const op of ops) {
    for (const [f, v] of Object.entries(op.set || {})) {
      set[f] = v;
      del.delete(f);
    }
    for (const f of op.del || []) {
      delete set[f];
      del.add(f);
    }
  }
  return { set, del: [...del] };
}

export function createStore({ onChange, localOnly = false }) {
  let data = ls.get('cc.data', {});
  let pending = ls.get('cc.pending', []);
  let key = ls.get('cc.key', '');
  let mode = 'connecting';
  let inflight = false;
  let retryTimer = null;
  let lastRefresh = 0;

  const save = () => {
    ls.set('cc.data', data);
    ls.set('cc.pending', pending);
  };
  const changed = () => {
    save();
    onChange();
  };

  // Server truth plus whatever we have not managed to send yet.
  function adopt(serverData) {
    data = serverData;
    for (const op of pending) applyOp(data, op);
  }

  async function call(method, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['x-family-key'] = key;
    const res = await fetch(API, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* 404 page from a static host */
    }
    return { status: res.status, json };
  }

  // Maps a response to a mode. Returns true when the server answered with data.
  function handleStatus(status, json) {
    if (status === 200 && json && json.data) {
      mode = 'cloud';
      return true;
    }
    if (status === 401) mode = 'locked';
    else if ([404, 405, 501, 503].includes(status)) mode = 'local';
    else mode = 'offline';
    return false;
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => (pending.length ? flush() : refresh()), RETRY_MS);
  }

  async function flush() {
    if (inflight || !pending.length || mode === 'local' || mode === 'locked') return;
    inflight = true;
    const batch = pending.slice();
    try {
      const { status, json } = await call('POST', mergeOps(batch));
      if (handleStatus(status, json)) {
        pending = pending.slice(batch.length);
        adopt(json.data);
      } else if (status === 400) {
        // The server will never accept this batch (e.g. an id with spaces in config.js). Drop it rather than retry forever.
        console.error('Chore chart: server rejected changes:', json && json.message);
        pending = pending.slice(batch.length);
        mode = 'cloud';
      } else if (mode === 'local') {
        pending = [];
      } else {
        scheduleRetry();
      }
    } catch {
      mode = 'offline';
      scheduleRetry();
    } finally {
      inflight = false;
      changed();
    }
    if (pending.length && mode === 'cloud') flush();
  }

  async function refresh() {
    if (localOnly) {
      mode = 'local';
      return onChange();
    }
    if (inflight) return;
    if (pending.length && mode !== 'local') return flush();
    inflight = true;
    lastRefresh = Date.now();
    try {
      const { status, json } = await call('GET');
      if (handleStatus(status, json)) {
        const serverEmpty = Object.keys(json.data).length === 0;
        if (serverEmpty && Object.keys(data).length) {
          // First connection to a fresh database: upload what this device already has.
          pending.push({ set: { ...data }, del: [] });
        } else {
          adopt(json.data);
        }
      }
    } catch {
      mode = 'offline';
    } finally {
      inflight = false;
      changed();
    }
    if (pending.length && mode === 'cloud') flush();
  }

  function commit(op) {
    if (!op || (!Object.keys(op.set || {}).length && !(op.del || []).length)) return;
    applyOp(data, op);
    if (mode !== 'local') pending.push(op);
    changed();
    flush();
  }

  function start() {
    refresh();
    setInterval(() => {
      const hour = new Date().getHours();
      const every = hour >= 22 || hour < 6 ? NIGHT_POLL_MS : POLL_MS;
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= every - 1000) refresh();
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('online', refresh);
  }

  return {
    get data() {
      return data;
    },
    get mode() {
      return mode;
    },
    get pendingCount() {
      return pending.length;
    },
    get hasKey() {
      return Boolean(key);
    },
    setKey(next) {
      key = next.trim();
      ls.set('cc.key', key);
      mode = 'connecting';
      onChange();
      refresh();
    },
    commit,
    refresh,
    start,
  };
}

// ---------- claude.ai shared database ----------
// When the chart is opened as a claude.ai artifact, the artifact's own database replaces /api/state.
// The flat map is split into one document per month (`chart/2026-11`, plus `chart/meta` for settings),
// each holding { f: { field: value } }. Every write is a merge-update of a few fields, so two devices
// tapping at once don't overwrite each other. A deleted field is stored as null until its month is pruned.

const encodeKey = (f) => f.replace(/\./g, '~');
const decodeKey = (k) => k.replace(/~/g, '.');

export function bucketOf(field) {
  const p = field.split('|');
  const d = p[0] === 'done' ? p[1].replace(/^w/, '')
    : p[0] === 'ov' || p[0] === 'dog' ? p[1]
    : p[0] === 'shower' ? p[2]
    : '';
  return /^\d{4}-\d{2}/.test(d || '') ? d.slice(0, 7) : 'meta';
}

export function createDbStore(db, { onChange }) {
  const col = db.collection('chart');
  const holder = `tab-${Math.random().toString(36).slice(2)}`;
  let docs = new Map(); // month -> body
  let data = ls.get('cc.db.cache', {});
  let pending = [];
  let mode = 'connecting';
  let writing = false;
  const ready = new Set();

  function rebuild() {
    const next = {};
    for (const body of docs.values()) {
      for (const [k, v] of Object.entries(body.f || {})) if (v !== null && v !== undefined) next[decodeKey(k)] = v;
    }
    for (const op of pending) applyOp(next, op);
    data = next;
    ls.set('cc.db.cache', data);
  }

  // There is no create-if-absent write, so a new month's document is claimed under a short lease.
  async function ensure(month) {
    if (docs.has(month) || ready.has(month)) return;
    const ref = col.doc(month);
    for (let i = 0; i < 12 && !docs.has(month); i += 1) {
      const lease = await ref.acquire({ holder, ttlMs: 4000 });
      const snap = await ref.get();
      if (snap.exists && snap.data()?.f) break;
      if (lease.acquired) {
        await ref.set({ f: {} });
        break;
      }
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 200)); // someone else is creating it
    }
    ready.add(month);
  }

  function patches(op) {
    const byMonth = new Map();
    const put = (f, v) => {
      const m = bucketOf(f);
      if (!byMonth.has(m)) byMonth.set(m, {});
      byMonth.get(m)[encodeKey(f)] = v;
    };
    for (const [f, v] of Object.entries(op.set || {})) put(f, v);
    for (const f of op.del || []) put(f, null);
    return byMonth;
  }

  async function flush() {
    if (writing) return;
    writing = true;
    try {
      while (pending.length) {
        for (const [month, patch] of patches(pending[0])) {
          await ensure(month);
          await col.doc(month).update({ f: patch }); // one write at a time, merged into the month
        }
        pending.shift();
      }
    } catch (err) {
      const op = pending[0];
      const refused = err && ['invalid_argument', 'quota_exceeded', 'transform_error'].includes(err.code);
      if (refused && op && (op.tries = (op.tries || 0) + 1) >= 3) {
        // Refused three times (an id the store won't take, or the database is full): drop it rather than loop.
        console.error('Chore chart: the shared database refused a change:', err.message);
        pending.shift();
        setTimeout(flush, 0);
      } else if (refused) {
        ready.clear(); // most likely a month document that wasn't created yet: claim it again
        setTimeout(flush, 800);
      } else {
        mode = 'offline';
        setTimeout(flush, 4000 + Math.random() * 3000);
      }
    } finally {
      writing = false;
      rebuild();
      onChange();
    }
  }

  function start() {
    const timer = setTimeout(() => {
      if (mode === 'connecting') {
        mode = 'offline';
        onChange();
      }
    }, 10000);
    col.onSnapshot((snap) => {
      docs = new Map(snap.docs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
      if (!snap.metadata.fromCache) {
        clearTimeout(timer);
        mode = 'cloud';
      }
      rebuild();
      onChange();
    }, (err) => {
      clearTimeout(timer);
      mode = err && err.code === 'revoked' ? 'local' : 'offline';
      onChange();
    });
  }

  return {
    get data() {
      return data;
    },
    get mode() {
      return mode;
    },
    get pendingCount() {
      return pending.length;
    },
    hasKey: false,
    shared: true,
    setKey() {},
    refresh() {},
    commit(op) {
      if (!op || (!Object.keys(op.set || {}).length && !(op.del || []).length)) return;
      applyOp(data, op);
      pending.push(op);
      ls.set('cc.db.cache', data);
      onChange();
      flush();
    },
    start,
  };
}

// What the db store would show before it connects (for the first paint inside claude.ai).
export function placeholderStore() {
  return {
    data: ls.get('cc.db.cache', {}),
    mode: 'connecting',
    pendingCount: 0,
    hasKey: false,
    shared: true,
    setKey() {},
    refresh() {},
    commit() {},
    start() {},
  };
}

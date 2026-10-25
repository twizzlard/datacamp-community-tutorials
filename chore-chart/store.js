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

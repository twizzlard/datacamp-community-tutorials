// Vercel function: GET returns the whole chart, POST applies { set: {field: value}, del: [field] }.
// Storage is a single Redis hash in Upstash (add "Upstash for Redis" from the Vercel Marketplace),
// so every tap is an atomic HSET/HDEL and two devices never overwrite each other.
//
// Env vars:
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (or the older KV_REST_API_URL / KV_REST_API_TOKEN)
//   FAMILY_KEY        optional; when set, devices must send it in the x-family-key header
//   CHORE_CHART_HASH  optional; Redis key name, defaults to "chore-chart"

const crypto = require('crypto');

const FIELD_RE = /^(offset|(ov|done|shower)(\|[A-Za-z0-9_.:-]{1,40}){1,3})$/;
const MAX_FIELDS = 600;
const MAX_VALUE = 64;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function pipeline(cfg, commands) {
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Upstash error: ${failed.error}`);
  return out.map((r) => r.result);
}

function toObject(flat) {
  const obj = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
}

function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// -> { set, del } or a string describing what is wrong
function validate(body) {
  if (!body || typeof body !== 'object') return 'Body must be JSON: { set: {...}, del: [...] }';
  const set = body.set || {};
  const del = body.del || [];
  if (typeof set !== 'object' || Array.isArray(set) || !Array.isArray(del)) return '`set` must be an object and `del` an array';
  const fields = [...Object.keys(set), ...del];
  if (fields.length > MAX_FIELDS) return `Too many fields in one request (max ${MAX_FIELDS})`;
  for (const f of fields) {
    if (typeof f !== 'string' || !FIELD_RE.test(f)) return `Unexpected field name: ${String(f).slice(0, 80)}`;
  }
  for (const v of Object.values(set)) {
    if (typeof v !== 'string' || v.length > MAX_VALUE) return 'Values must be short strings';
  }
  return { set, del };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = redisConfig();
  if (!cfg) {
    return res.status(503).json({ error: 'storage_not_configured', message: 'Add Upstash for Redis to this Vercel project, then redeploy.' });
  }

  const familyKey = process.env.FAMILY_KEY;
  if (familyKey && !sameSecret(req.headers['x-family-key'] || '', familyKey)) {
    return res.status(401).json({ error: 'wrong_key' });
  }

  const hash = process.env.CHORE_CHART_HASH || 'chore-chart';

  try {
    if (req.method === 'GET') {
      const [flat] = await pipeline(cfg, [['HGETALL', hash]]);
      return res.status(200).json({ data: toObject(flat) });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = null;
        }
      }
      const op = validate(body);
      if (typeof op === 'string') return res.status(400).json({ error: 'bad_request', message: op });

      const commands = [];
      const pairs = Object.entries(op.set).flat();
      if (pairs.length) commands.push(['HSET', hash, ...pairs]);
      if (op.del.length) commands.push(['HDEL', hash, ...op.del]);
      commands.push(['HGETALL', hash]);
      const results = await pipeline(cfg, commands);
      return res.status(200).json({ data: toObject(results[results.length - 1]) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'storage_error' });
  }
};

/**
 * In-memory cache + concurrency limit for FieldRenderer.
 * Call setUncachedRenderer(renderTeam) once at boot (see ready.js).
 */
const crypto = require('crypto');
const logger = require('../logger/logger.js');

const TTL_MS = 90_000;
const MAX_ENTRIES = 120;
const MAX_CONCURRENT = 2;

/** @type {Map<string, { buf: Buffer, at: number }>} */
const cache = new Map();
let inFlight = 0;
/** @type {Array<() => void>} */
const waitQueue = [];
/** @type {null | Function} */
let uncachedRenderer = null;

function setUncachedRenderer(fn) {
  uncachedRenderer = fn;
}

function teamFingerprint(teamRows, formationId) {
  const parts = (teamRows || [])
    .map(r => `${r.slot}:${r.cardId}:${r.level ?? 0}`)
    .sort();
  const raw = `${formationId || '4-3-3'}|${parts.join(',')}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function prune() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at > TTL_MS) cache.delete(k);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function acquireSlot() {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    waitQueue.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  const next = waitQueue.shift();
  if (next) next();
}

/** True when a new render would wait behind others. */
function isRenderBusy() {
  return inFlight >= MAX_CONCURRENT || waitQueue.length > 0;
}

async function renderTeamCached(teamRows, allCards, formationId = '4-3-3') {
  prune();
  const key = teamFingerprint(teamRows, formationId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= TTL_MS) {
    return hit.buf;
  }

  const willWait = inFlight >= MAX_CONCURRENT;
  if (willWait) {
    logger.info(`teamRenderCache: queue depth ${waitQueue.length + 1} (max concurrent ${MAX_CONCURRENT})`);
  }

  await acquireSlot();
  try {
    const again = cache.get(key);
    if (again && Date.now() - again.at <= TTL_MS) return again.buf;

    if (typeof uncachedRenderer !== 'function') {
      const fr = require('./FieldRenderer.js');
      uncachedRenderer = fr.renderTeam;
    }
    const buf = await uncachedRenderer(teamRows, allCards, formationId);
    cache.set(key, { buf, at: Date.now() });
    return buf;
  } catch (err) {
    logger.error('teamRenderCache render failed', err.message);
    throw err;
  } finally {
    releaseSlot();
  }
}

/** Patch FieldRenderer.renderTeam so all callers get cache for free. */
function installAsDefault() {
  const fr = require('./FieldRenderer.js');
  if (fr.__teamCacheInstalled) return;
  const original = fr.renderTeam;
  setUncachedRenderer(original);
  fr.renderTeam = renderTeamCached;
  fr.__teamCacheInstalled = true;
}

function invalidateUser() {
  cache.clear();
}

function cacheStats() {
  return {
    size: cache.size,
    inFlight,
    queued: waitQueue.length,
    busy: isRenderBusy()
  };
}

module.exports = {
  renderTeamCached,
  teamFingerprint,
  setUncachedRenderer,
  installAsDefault,
  invalidateUser,
  cacheStats,
  isRenderBusy,
  TTL_MS,
  MAX_CONCURRENT
};

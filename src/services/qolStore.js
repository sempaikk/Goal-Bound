/**
 * Quality-of-life persistence (no DB migration required).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');
const { isPrivileged } = require('./staff.js');

const STORE_PATH = config.PATHS.QOL_STORE;
const MAX_HISTORY = 8;
const PITY_SOFT = 100;
const DAILY_IENE = 25;
const PULL_LOG_MAX = 5000;
const MS_DAY = 24 * 60 * 60 * 1000;

/** @type {object | null} */
let mem = null;
let memMtime = -1;

function empty() {
  return {
    history: {},
    globalPulls: {},
    pullLog: [],
    gateNotify: [],
    gateDue: {},
    snapshots: {},
    daily: {},
    pity: {},
    locale: {},
    bannerPublic: {},
    statsExcludeStaff: false
  };
}

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      mem = empty();
      memMtime = 0;
      return mem;
    }
    const st = fs.statSync(STORE_PATH);
    if (mem && st.mtimeMs === memMtime) return mem;
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
    mem = {
      history: raw.history && typeof raw.history === 'object' ? raw.history : {},
      globalPulls: raw.globalPulls && typeof raw.globalPulls === 'object' ? raw.globalPulls : {},
      pullLog: Array.isArray(raw.pullLog) ? raw.pullLog : [],
      gateNotify: Array.isArray(raw.gateNotify) ? raw.gateNotify.map(String) : [],
      gateDue: raw.gateDue && typeof raw.gateDue === 'object' ? raw.gateDue : {},
      snapshots: raw.snapshots && typeof raw.snapshots === 'object' ? raw.snapshots : {},
      daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : {},
      pity: raw.pity && typeof raw.pity === 'object' ? raw.pity : {},
      locale: raw.locale && typeof raw.locale === 'object' ? raw.locale : {},
      bannerPublic: raw.bannerPublic && typeof raw.bannerPublic === 'object' ? raw.bannerPublic : {},
      statsExcludeStaff: Boolean(raw.statsExcludeStaff)
    };
    memMtime = st.mtimeMs;
    return mem;
  } catch {
    mem = empty();
    memMtime = -1;
    return mem;
  }
}

/** Atomic write: temp + rename. */
function save(data) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(data);
  const tmp = path.join(dir, `qol-store.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, STORE_PATH);
  } catch {
    try {
      fs.writeFileSync(STORE_PATH, payload);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  mem = data;
  try {
    memMtime = fs.statSync(STORE_PATH).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

/** Single load → mutate → save (Node is single-threaded between awaits). */
function mutate(fn) {
  const data = load();
  const result = fn(data);
  save(data);
  return result;
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function prunePullLog(log, days = 7) {
  const cutoff = Date.now() - days * MS_DAY;
  return (log || []).filter(p => Number(p.at) >= cutoff).slice(-PULL_LOG_MAX);
}

function getDailyStatus(userId) {
  const data = load();
  const last = data.daily[String(userId)] || null;
  const today = utcDayKey();
  return {
    claimed: last === today,
    last,
    today,
    amount: DAILY_IENE
  };
}

function claimDaily(userId) {
  return mutate(data => {
    const id = String(userId);
    const today = utcDayKey();
    if (data.daily[id] === today) return { ok: false, reason: 'already' };
    data.daily[id] = today;
    return { ok: true, amount: DAILY_IENE };
  });
}

function getPity(userId) {
  const n = load().pity[String(userId)];
  return Math.max(0, Number(n) || 0);
}

function bumpPity(userId, gotNewGen) {
  return mutate(data => {
    const id = String(userId);
    if (gotNewGen) data.pity[id] = 0;
    else data.pity[id] = Math.min(PITY_SOFT, (Number(data.pity[id]) || 0) + 1);
    return data.pity[id];
  });
}

function shouldForceNewGen(userId) {
  return getPity(userId) >= PITY_SOFT - 1;
}

/**
 * Personal history always updates.
 * Server stats (globalPulls / pullLog) skip Owner + Tester.
 */
function recordPull(userId, entry) {
  const uid = String(userId);
  const staff = isPrivileged(uid);

  mutate(data => {
    const list = Array.isArray(data.history[uid]) ? [...data.history[uid]] : [];
    const atIso = entry.at || new Date().toISOString();
    list.unshift({
      cardId: entry.cardId,
      name: entry.name,
      banner: entry.banner || 'padrao',
      rarity: entry.rarity || null,
      at: atIso
    });
    data.history[uid] = list.slice(0, MAX_HISTORY);

    // Server-wide rankings: players only
    if (!staff && entry.cardId != null) {
      const key = String(entry.cardId);
      data.globalPulls[key] = (data.globalPulls[key] || 0) + 1;
      const log = Array.isArray(data.pullLog) ? data.pullLog : [];
      log.push({ cardId: entry.cardId, userId: uid, at: Date.now() });
      data.pullLog = prunePullLog(log, 7);
    }
  });
}

function getRecentPulls(userId, limit = 5) {
  const list = load().history[String(userId)] || [];
  return list.slice(0, limit);
}

/** Users whose recent pull history includes this card id. */
function listUserIdsWithHistoryCard(cardId) {
  const target = Number(cardId);
  const out = [];
  const history = load().history || {};
  for (const [uid, list] of Object.entries(history)) {
    if (!Array.isArray(list)) continue;
    if (list.some(e => Number(e.cardId) === target)) out.push(String(uid));
  }
  return out;
}

function getGlobalPullCounts() {
  return { ...load().globalPulls };
}

function getGlobalPullCountsLastDays(days = 7) {
  const data = load();
  const cutoff = Date.now() - days * MS_DAY;
  const counts = {};
  for (const p of data.pullLog || []) {
    if (Number(p.at) < cutoff) continue;
    // Skip staff rows (and legacy rows without userId stay counted only if not filtered)
    if (p.userId && isPrivileged(p.userId)) continue;
    const key = String(p.cardId);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function getPullLogTotalLastDays(days = 7) {
  return Object.values(getGlobalPullCountsLastDays(days)).reduce((s, n) => s + n, 0);
}

/**
 * One-time wipe of polluted server stats (owner/tester farm).
 * Personal history / pity / daily are kept.
 * @returns {{ didReset: boolean }}
 */
function ensureServerStatsResetOnce() {
  return mutate(data => {
    if (data.statsExcludeStaff) return { didReset: false };
    data.globalPulls = {};
    data.pullLog = [];
    data.statsExcludeStaff = true;
    return { didReset: true };
  });
}

function isGateNotify(userId) {
  return load().gateNotify.includes(String(userId));
}

function setGateNotify(userId, enabled) {
  return mutate(data => {
    const id = String(userId);
    const set = new Set(data.gateNotify);
    if (enabled) set.add(id);
    else {
      set.delete(id);
      delete data.gateDue[id];
    }
    data.gateNotify = [...set];
    return enabled;
  });
}

function toggleGateNotify(userId) {
  const on = !isGateNotify(userId);
  setGateNotify(userId, on);
  return on;
}

function setGateDue(userId, openAtMs) {
  mutate(data => {
    const id = String(userId);
    if (!openAtMs || openAtMs <= Date.now()) delete data.gateDue[id];
    else data.gateDue[id] = Number(openAtMs);
  });
}

function clearGateDue(userId) {
  mutate(data => {
    delete data.gateDue[String(userId)];
  });
}

function listGateDues() {
  const out = [];
  for (const [userId, openAt] of Object.entries(load().gateDue || {})) {
    const n = Number(openAt);
    if (Number.isFinite(n)) out.push({ userId, openAt: n });
  }
  return out;
}

function saveTeamSnapshot(userId, teamRows) {
  if (!teamRows || teamRows.length === 0) return;
  mutate(data => {
    data.snapshots[String(userId)] = {
      at: new Date().toISOString(),
      rows: teamRows.map(r => ({
        slot: r.slot,
        cardId: r.cardId,
        cardName: r.cardName,
        level: r.level ?? 0
      }))
    };
  });
}

function getTeamSnapshot(userId) {
  return load().snapshots[String(userId)] || null;
}

function clearTeamSnapshot(userId) {
  mutate(data => {
    delete data.snapshots[String(userId)];
  });
}

function getLocale(userId) {
  const v = load().locale[String(userId)];
  return v === 'pt' ? 'pt' : 'en';
}

function setLocale(userId, locale) {
  return mutate(data => {
    const loc = locale === 'pt' ? 'pt' : 'en';
    data.locale[String(userId)] = loc;
    return loc;
  });
}

function toggleLocale(userId) {
  const next = getLocale(userId) === 'pt' ? 'en' : 'pt';
  return setLocale(userId, next);
}

function publicPullKey(userId, channelId) {
  return `${String(userId)}:${String(channelId)}`;
}

function getBannerPublicMessage(userId, channelId) {
  if (!userId || !channelId) return null;
  const data = load();
  if (!data.bannerPublic || typeof data.bannerPublic !== 'object') return null;
  const id = data.bannerPublic[publicPullKey(userId, channelId)];
  return id ? String(id) : null;
}

function setBannerPublicMessage(userId, channelId, messageId) {
  if (!userId || !channelId || !messageId) return;
  mutate(data => {
    if (!data.bannerPublic || typeof data.bannerPublic !== 'object') {
      data.bannerPublic = {};
    }
    data.bannerPublic[publicPullKey(userId, channelId)] = String(messageId);
  });
}

function clearBannerPublicMessage(userId, channelId) {
  if (!userId || !channelId) return;
  mutate(data => {
    if (!data.bannerPublic || typeof data.bannerPublic !== 'object') return;
    delete data.bannerPublic[publicPullKey(userId, channelId)];
  });
}

module.exports = {
  recordPull,
  getRecentPulls,
  listUserIdsWithHistoryCard,
  getGlobalPullCounts,
  getGlobalPullCountsLastDays,
  getPullLogTotalLastDays,
  ensureServerStatsResetOnce,
  isGateNotify,
  setGateNotify,
  toggleGateNotify,
  setGateDue,
  clearGateDue,
  listGateDues,
  saveTeamSnapshot,
  getTeamSnapshot,
  clearTeamSnapshot,
  getDailyStatus,
  claimDaily,
  getPity,
  bumpPity,
  shouldForceNewGen,
  getLocale,
  setLocale,
  toggleLocale,
  getBannerPublicMessage,
  setBannerPublicMessage,
  clearBannerPublicMessage,
  MAX_HISTORY,
  PITY_SOFT,
  DAILY_IENE
};

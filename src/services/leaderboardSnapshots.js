/**
 * Weekly score baselines — first freeze of the ISO week is the floor.
 * Climbers = current SP − baseline (only positive deltas).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');

const STORE_PATH = path.join(config.PERSIST_DIR, 'leaderboard-snapshots.json');

/** @type {{ weekKey: string, scores: Record<string, number>, frozenAt: string } | null} */
let mem = null;

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function load() {
  if (mem) return mem;
  try {
    if (!fs.existsSync(STORE_PATH)) {
      mem = { weekKey: '', scores: {}, frozenAt: '' };
      return mem;
    }
    mem = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {
      weekKey: '',
      scores: {},
      frozenAt: ''
    };
    return mem;
  } catch {
    mem = { weekKey: '', scores: {}, frozenAt: '' };
    return mem;
  }
}

function save(data) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data));
  } catch {
    /* ignore disk errors — climbers just stay empty */
  }
  mem = data;
}

/**
 * Ensure current ISO week has a baseline. New week → freeze current scores.
 * Existing week → fill missing users only (don't overwrite early scores).
 * @param {Array<{ userId: string, score: number }>} entries
 */
function ensureWeeklyBaseline(entries) {
  const weekKey = isoWeekKey();
  const data = load();

  if (data.weekKey !== weekKey) {
    const scores = {};
    for (const e of entries) {
      scores[String(e.userId)] = Number(e.score) || 0;
    }
    const next = {
      weekKey,
      scores,
      frozenAt: new Date().toISOString()
    };
    save(next);
    return next;
  }

  let changed = false;
  for (const e of entries) {
    const id = String(e.userId);
    if (data.scores[id] == null) {
      data.scores[id] = Number(e.score) || 0;
      changed = true;
    }
  }
  if (changed) save(data);
  return data;
}

/**
 * @param {Array<{ userId: string, username: string, score: number, rank: number }>}
 * @param {number} [limit=5]
 */
function getWeeklyClimbers(rankedEntries, limit = 5) {
  const baseline = ensureWeeklyBaseline(rankedEntries);
  const climbs = [];

  for (const e of rankedEntries) {
    const id = String(e.userId);
    const floor = baseline.scores[id];
    if (floor == null) continue;
    const delta = (Number(e.score) || 0) - (Number(floor) || 0);
    if (delta <= 0) continue;
    climbs.push({
      userId: id,
      username: e.username,
      rank: e.rank,
      score: e.score,
      delta,
      baseline: floor
    });
  }

  climbs.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    return a.rank - b.rank;
  });

  return {
    weekKey: baseline.weekKey,
    frozenAt: baseline.frozenAt,
    climbers: climbs.slice(0, limit)
  };
}

module.exports = {
  isoWeekKey,
  ensureWeeklyBaseline,
  getWeeklyClimbers
};

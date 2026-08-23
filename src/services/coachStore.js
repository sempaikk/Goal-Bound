/**
 * Active coach per user (card_id of a CO card, or null).
 * Stored in user-coaches.json under PERSIST_DIR so we don't need a DB migration.
 * Formation remapping goes through DataService.
 *
 * Performance: keeps the store in memory; reloads from disk only when
 * the file mtime changes (or after our own write).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');
const {
  COACH_IDS,
  getFormationForCoach,
  getFormationSlots,
  remapTeamSlots
} = require('./formations.js');
const { canPlaySlot } = require('./positionEligibility.js');

const STORE_PATH = config.PATHS.USER_COACHES;

/** @type {Record<string, number> | null} */
let mem = null;
let memMtime = -1;

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      mem = {};
      memMtime = 0;
      return mem;
    }
    const st = fs.statSync(STORE_PATH);
    if (mem && st.mtimeMs === memMtime) return mem;
    mem = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
    memMtime = st.mtimeMs;
    return mem;
  } catch {
    mem = {};
    memMtime = -1;
    return mem;
  }
}

/** Direct write — Windows often EPERM on rename-over-existing (AV lock). */
function save(data) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(data);
  try {
    fs.writeFileSync(STORE_PATH, payload);
  } catch {
    const tmp = path.join(dir, `user-coaches.${process.pid}.tmp`);
    try {
      fs.writeFileSync(tmp, payload);
      fs.copyFileSync(tmp, STORE_PATH);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }
  mem = data;
  try {
    memMtime = fs.statSync(STORE_PATH).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

function getCoachId(userId) {
  const data = load();
  const id = data[userId];
  return id == null ? null : id;
}

/** User ids whose active master is this coach card id. */
function listUserIdsWithCoach(coachCardId) {
  const target = Number(coachCardId);
  const out = [];
  for (const [uid, id] of Object.entries(load() || {})) {
    if (Number(id) === target) out.push(String(uid));
  }
  return out;
}

/**
 * @param {string} userId
 * @param {number|null} coachCardId
 * @param {{ userHasCard: Function, getTeam: Function, clearTeamSlot: Function, setTeamSlot: Function, loadCards?: Function }} ds
 */
function setCoachId(userId, coachCardId, ds) {
  if (coachCardId != null) {
    if (!COACH_IDS.includes(coachCardId)) {
      return { ok: false, reason: 'not_a_coach', formation: getFormationForCoach(null) };
    }
    if (!ds.userHasCard(userId, coachCardId)) {
      return { ok: false, reason: 'not_owned', formation: getFormationForCoach(null) };
    }
  }

  const formation = getFormationForCoach(coachCardId);
  const newSlots = formation.slots;
  const oldTeam = ds.getTeam(userId);
  const remapped = remapTeamSlots(oldTeam, newSlots);
  const newKeys = new Set(newSlots.map(s => s.key));

  for (const row of oldTeam) {
    if (!newKeys.has(row.slot)) {
      ds.clearTeamSlot(userId, row.slot);
    }
  }

  const cards = typeof ds.loadCards === 'function' ? ds.loadCards() : [];
  const byId = new Map((cards || []).map(c => [c.id, c]));

  for (const row of remapped) {
    const card = byId.get(row.cardId);
    // Prefer legal seats only when we know the card position
    if (card && !canPlaySlot(card.position, row.slot, newSlots)) {
      ds.clearTeamSlot(userId, row.slot);
      continue;
    }
    ds.setTeamSlot(userId, row.slot, row.cardId, row.cardName, { skipPositionCheck: true });
  }

  for (const slot of newSlots) {
    const kept = remapped.find(r => r.slot === slot.key);
    if (!kept) {
      const old = oldTeam.find(r => r.slot === slot.key);
      if (old) ds.clearTeamSlot(userId, slot.key);
    }
  }

  const data = { ...load() };
  if (coachCardId == null) delete data[userId];
  else data[userId] = coachCardId;
  save(data);

  return { ok: true, formation };
}

module.exports = {
  getCoachId,
  setCoachId,
  listUserIdsWithCoach,
  getFormationForCoach,
  getFormationSlots,
  COACH_IDS
};

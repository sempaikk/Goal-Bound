/**
 * One-shot-style repair for Jinpachi Ego (card_id 14) lost when the old
 * Kiyora 14→13 migration kept running after coaches were added.
 *
 * Sources of truth for "this user should own Ego":
 *  1. user_cards row id 13 still named like Ego (rename-only damage)
 *  2. pull history in qol-store (cardId 14)
 *  3. active master in user-coaches.json set to 14
 *
 * Safe to run every boot: only INSERT OR IGNORE / targeted UPDATEs.
 */
const logger = require('../logger/logger.js');
const DataService = require('./DataService.js');
const { listUserIdsWithHistoryCard } = require('./qolStore.js');
const { listUserIdsWithCoach } = require('./coachStore.js');

const EGO_ID = 14;
const EGO_NAME = 'Jinpachi Ego';
const KIYORA_ID = 13;
const KIYORA_NAME = 'Kiyora Tomoe';

function isEgoName(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('ego') || n.includes('jinpachi');
}

/**
 * @returns {{ restored: number, renamed: number, users: string[] }}
 */
function repairLostEgo() {
  const touched = new Set();
  let restored = 0;
  let renamed = 0;

  // --- A) Rows that are still id 13 but named Ego (migration UPDATE path) ---
  const misnamed = DataService.listCardsNamedLikeEgoAtId(KIYORA_ID);
  for (const row of misnamed) {
    const uid = String(row.user_id);
    if (DataService.userHasCard(uid, EGO_ID)) {
      // Already has real Ego — fix the 13 row back to Kiyora identity
      DataService.renameCard(uid, KIYORA_ID, KIYORA_NAME);
      renamed += 1;
      touched.add(uid);
      continue;
    }
    // Move the orphaned Ego row back to id 14
    const ok = DataService.reassignCardId(uid, KIYORA_ID, EGO_ID, EGO_NAME);
    if (ok) {
      restored += 1;
      touched.add(uid);
    }
  }

  // --- B) History says they pulled Ego ---
  let historyIds = [];
  try {
    historyIds = listUserIdsWithHistoryCard(EGO_ID);
  } catch (error) {
    logger.warn('repairEgo: could not read pull history', error.message);
  }

  // --- C) Coach store still points at Ego ---
  let coachIds = [];
  try {
    coachIds = listUserIdsWithCoach(EGO_ID);
  } catch (error) {
    logger.warn('repairEgo: could not read coach store', error.message);
  }

  const candidates = new Set([...historyIds, ...coachIds].map(String));

  for (const uid of candidates) {
    if (DataService.userHasCard(uid, EGO_ID)) continue;
    DataService.ensureUser(uid, 'repair');
    DataService.addCard(uid, EGO_ID, EGO_NAME);
    if (DataService.userHasCard(uid, EGO_ID)) {
      restored += 1;
      touched.add(uid);
    }
  }

  return {
    restored,
    renamed,
    users: [...touched]
  };
}

module.exports = { repairLostEgo, EGO_ID, EGO_NAME };

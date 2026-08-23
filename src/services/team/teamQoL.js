const DataService = require('../DataService.js');
const { getCoachId, COACH_IDS, getFormationForCoach } = require('../coachStore.js');
const { resolveSlots } = require('../FieldRenderer.js');
const { canPlaySlot } = require('../positionEligibility.js');
const {
  getTeamSnapshot,
  saveTeamSnapshot,
  clearTeamSnapshot
} = require('../qolStore.js');

function ownsAnyMaster(userId) {
  const cards = DataService.getUserCards(userId);
  return cards.some(c => COACH_IDS.includes(c.id));
}

function masterReminder(userId) {
  if (getCoachId(userId) != null) return null;
  if (!ownsAnyMaster(userId)) return null;
  return '🧭 **You own a master** but none is active — tap **Master** below to change the shape.';
}

function snapshotTeam(userId) {
  const rows = DataService.getTeam(userId);
  if (rows.length) saveTeamSnapshot(userId, rows);
}

function hasSnapshot(userId) {
  const snap = getTeamSnapshot(userId);
  return Boolean(snap && Array.isArray(snap.rows) && snap.rows.length);
}

function restoreSnapshot(userId) {
  const snap = getTeamSnapshot(userId);
  if (!snap || !Array.isArray(snap.rows) || snap.rows.length === 0) {
    return { ok: false, restored: 0 };
  }
  const cards = DataService.loadCards();
  const byId = new Map(cards.map(c => [c.id, c]));
  const formation = getFormationForCoach(getCoachId(userId));
  const slots = resolveSlots(formation.id);
  let restored = 0;
  for (const row of snap.rows) {
    if (!DataService.userHasCard(userId, row.cardId)) continue;
    const card = byId.get(row.cardId);
    if (!card || !canPlaySlot(card.position, row.slot, slots)) continue;
    DataService.setTeamSlot(userId, row.slot, row.cardId, row.cardName);
    restored += 1;
  }
  if (restored > 0) clearTeamSnapshot(userId);
  return { ok: restored > 0, restored };
}

/** Clear seats that violate current position rules (e.g. FW in GK from before the lock). */
function purgeInvalidSeats(userId) {
  const team = DataService.getTeam(userId);
  if (!team.length) return 0;
  const cards = DataService.loadCards();
  const byId = new Map(cards.map(c => [c.id, c]));
  const formation = getFormationForCoach(getCoachId(userId));
  const slots = resolveSlots(formation.id);
  let cleared = 0;
  for (const row of team) {
    const card = byId.get(row.cardId);
    if (!card || !canPlaySlot(card.position, row.slot, slots)) {
      DataService.clearTeamSlot(userId, row.slot);
      cleared += 1;
    }
  }
  return cleared;
}

module.exports = {
  masterReminder,
  snapshotTeam,
  hasSnapshot,
  restoreSnapshot,
  ownsAnyMaster,
  purgeInvalidSeats
};

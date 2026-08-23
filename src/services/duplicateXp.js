/**
 * Duplicate banner pulls → XP on the owned card (not a second copy).
 * Coaches (position CO) and max-level cards gain nothing.
 *
 * DataService is required lazily to avoid circular load with DataService.js.
 */
const { applyXpGain, getProgressForXp } = require('./xpCurve.js');

const DUP_XP_BY_RARITY = {
  LOCKED: 15,
  EGOISTA: 20,
  NEW_GEN: 50
};

function ds() {
  return require('./DataService.js');
}

/**
 * @param {string} userId
 * @param {{ id: number, name?: string, position?: string }} card
 * @param {string|null} rarity LOCKED | EGOISTA | NEW_GEN
 * @returns {{
 *   xpGained: number,
 *   leveledUp: boolean,
 *   previousLevel: number|null,
 *   newLevel: number|null,
 *   maxed: boolean,
 *   skipped: boolean
 * }}
 */
function applyDuplicateXp(userId, card, rarity) {
  const empty = {
    xpGained: 0,
    leveledUp: false,
    previousLevel: null,
    newLevel: null,
    maxed: false,
    skipped: true
  };

  if (!userId || !card || card.id == null) return empty;
  if (card.position === 'CO') return empty;

  const amount = DUP_XP_BY_RARITY[rarity] || 0;
  if (amount <= 0) return empty;

  const DataService = ds();
  const currentXp = DataService.getCardXp(userId, card.id);
  if (currentXp === null || currentXp === undefined) return empty;

  const before = getProgressForXp(currentXp);
  if (before.isMaxLevel) {
    return {
      xpGained: 0,
      leveledUp: false,
      previousLevel: before.level,
      newLevel: before.level,
      maxed: true,
      skipped: false
    };
  }

  const result = applyXpGain(currentXp, amount);
  DataService.setCardXp(userId, card.id, result.newTotalXp);
  if (result.leveledUp) {
    DataService.setCardLevel(userId, card.id, result.newLevel);
  }

  return {
    xpGained: amount,
    leveledUp: result.leveledUp,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    maxed: false,
    skipped: false
  };
}

module.exports = { applyDuplicateXp, DUP_XP_BY_RARITY };

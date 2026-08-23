/**
 * Squad Power — ranking score for the seated eleven.
 * Public, stable formula so players know what to farm.
 *
 * score =
 *   Σ (level × 8) for each seated card
 * + rarity weight per card (LOCKED 15 · EGOISTA 45 · NEW_GEN 120)
 * + 250 if formation is full (11/11)
 * + 120 if a master is active
 * + floor(avgLevel × 2)
 */

const DataService = require('./DataService.js');
const { getCoachId, getFormationForCoach, COACH_IDS } = require('./coachStore.js');

const RARITY_POINTS = {
  LOCKED: 15,
  EGOISTA: 45,
  NEW_GEN: 120
};

const FULL_TEAM_BONUS = 250;
const MASTER_BONUS = 120;
const LEVEL_MULT = 8;

const COACH_SHORT = {
  14: 'Ego',
  15: 'Noa',
  16: 'Lavinho',
  17: 'Snuffy'
};

/**
 * @param {string} userId
 * @returns {{
 *   score: number,
 *   filled: number,
 *   isComplete: boolean,
 *   avgLevel: number,
 *   coachId: number|null,
 *   coachShort: string|null,
 *   formationLabel: string,
 *   breakdown: { levels: number, rarity: number, fullTeam: number, master: number, avgBoost: number }
 * }}
 */
function computeSquadScore(userId) {
  const cards = DataService.loadCards() || [];
  const byId = new Map(cards.map(c => [Number(c.id), c]));
  const teamRows = DataService.getTeam(userId);
  const coachId = getCoachId(userId);
  const formation = getFormationForCoach(coachId);

  let levels = 0;
  let rarity = 0;
  let levelSum = 0;

  for (const row of teamRows) {
    const lv = Math.max(0, Number(row.level) || 0);
    levelSum += lv;
    levels += lv * LEVEL_MULT;
    const card = byId.get(Number(row.cardId));
    if (card && card.position !== 'CO') {
      rarity += RARITY_POINTS[card.rarity] || 0;
    }
  }

  const filled = teamRows.length;
  const isComplete = filled === 11;
  const avgLevel = filled > 0 ? Math.round(levelSum / filled) : 0;
  const fullTeam = isComplete ? FULL_TEAM_BONUS : 0;
  const master = coachId != null && COACH_IDS.includes(Number(coachId)) ? MASTER_BONUS : 0;
  const avgBoost = Math.floor(avgLevel * 2);

  const score = levels + rarity + fullTeam + master + avgBoost;

  return {
    score,
    filled,
    isComplete,
    avgLevel,
    coachId: coachId == null ? null : Number(coachId),
    coachShort: coachId != null ? COACH_SHORT[coachId] || null : null,
    formationLabel: formation?.label || '4-3-3',
    breakdown: { levels, rarity, fullTeam, master, avgBoost }
  };
}

function formatScore(n) {
  return Number(n || 0).toLocaleString('en-US');
}

module.exports = {
  computeSquadScore,
  formatScore,
  RARITY_POINTS,
  FULL_TEAM_BONUS,
  MASTER_BONUS,
  LEVEL_MULT,
  COACH_SHORT
};

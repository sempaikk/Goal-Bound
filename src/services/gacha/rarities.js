/**
 * Standard Banner rarity tiers (LOCKED / EGOISTA / NEW_GEN).
 * Weights 500:250:10 → ~65.79% / ~32.89% / ~1.32%
 */
const RARITIES = {
  LOCKED: {
    key: 'LOCKED',
    label: 'Locked',
    emoji: '🔒',
    weight: 500,
    color: '#8D99AE'
  },
  EGOISTA: {
    key: 'EGOISTA',
    label: 'Egoist',
    emoji: '👁️',
    weight: 250,
    color: '#E63946'
  },
  NEW_GEN: {
    key: 'NEW_GEN',
    label: 'New Gen',
    emoji: '💫',
    weight: 10,
    color: '#4CC9F0'
  }
};

const RARITY_ORDER = ['LOCKED', 'EGOISTA', 'NEW_GEN'];

const TOTAL_WEIGHT = RARITY_ORDER.reduce((sum, key) => sum + RARITIES[key].weight, 0);

function rollRarity() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const key of RARITY_ORDER) {
    roll -= RARITIES[key].weight;
    if (roll < 0) return key;
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

function percentageFor(key) {
  if (!RARITIES[key]) return 0;
  return (RARITIES[key].weight / TOTAL_WEIGHT) * 100;
}

module.exports = { RARITIES, RARITY_ORDER, TOTAL_WEIGHT, rollRarity, percentageFor };

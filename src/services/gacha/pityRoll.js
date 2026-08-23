/**
 * Soft pity for Standard Banner only.
 */
const DataService = require('../DataService.js');
const {
  shouldForceNewGen,
  bumpPity,
  getPity,
  PITY_SOFT
} = require('../qolStore.js');

function rollStandardWithPity(userId, pool) {
  const force = shouldForceNewGen(userId);
  let card = null;
  let rarity = 'LOCKED';
  let pityForced = false;

  if (force) {
    const ng = pool.filter(c => c.rarity === 'NEW_GEN');
    if (ng.length > 0) {
      card = ng[Math.floor(Math.random() * ng.length)];
      rarity = 'NEW_GEN';
      pityForced = true;
    }
  }

  if (!card) {
    const rolled = DataService.getWeightedRandomCard(pool);
    card = rolled.card;
    rarity = rolled.rarity;
  }

  const gotNewGen = rarity === 'NEW_GEN' || card?.rarity === 'NEW_GEN';
  const pityCount = bumpPity(userId, Boolean(gotNewGen));

  return { card, rarity, pityForced, pityCount };
}

module.exports = {
  rollStandardWithPity,
  getPity,
  PITY_SOFT
};

/**
 * x1 pull teaser hold time (ms) before the card is shown.
 * Higher tiers wait a beat longer so the reveal feels earned.
 */
const REVEAL_MS = {
  LOCKED: 1100,
  EGOISTA: 1900,
  NEW_GEN: 2400,
  COACH: 2400
};

function revealDelayMs(rarity, isCoach = false) {
  if (isCoach) return REVEAL_MS.COACH;
  if (rarity === 'NEW_GEN') return REVEAL_MS.NEW_GEN;
  if (rarity === 'EGOISTA') return REVEAL_MS.EGOISTA;
  return REVEAL_MS.LOCKED;
}

module.exports = { revealDelayMs, REVEAL_MS };

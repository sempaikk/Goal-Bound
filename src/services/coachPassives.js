/**
 * Active master (coach) passives.
 * Applied to XP / Iene / daily — never changes binder cards.
 */
const { getCoachId } = require('./coachStore.js');
const { DAILY_IENE } = require('./qolStore.js');

/**
 * @typedef {{ key: string, short: string, xpMultAll?: number, xpMultVoice?: number, xpMultChat?: number, ieneBonusPerTick?: number, dailyBonus?: number }}
 */

/** @type {Record<number, import('.').never>} */
const PASSIVES = {
  14: {
    key: 'EGO',
    name: 'Jinpachi Ego',
    short: '+5% XP · +2 daily Iene',
    xpMultAll: 1.05,
    dailyBonus: 2
  },
  15: {
    key: 'NOA',
    name: 'Noel Noa',
    short: '+10% voice XP',
    xpMultVoice: 1.1
  },
  16: {
    key: 'LAVINHO',
    name: 'Lavinho',
    short: '+10% chat XP',
    xpMultChat: 1.1
  },
  17: {
    key: 'SNUFFY',
    name: 'Marc Snuffy',
    short: '+1 Iene / XP tick',
    ieneBonusPerTick: 1
  }
};

const BASE_XP_TICK = 10;
const BASE_IENE_TICK = 1;

function getPassive(coachId) {
  if (coachId == null) return null;
  return PASSIVES[Number(coachId)] || null;
}

function getActivePassive(userId) {
  try {
    return getPassive(getCoachId(userId));
  } catch {
    return null;
  }
}

function scaleXp(base, mult) {
  if (!mult || mult === 1) return base;
  return Math.max(1, Math.round(base * mult));
}

/** Voice tick rewards (1 min in call). */
function getVoiceTickRewards(userId) {
  const p = getActivePassive(userId);
  let xp = BASE_XP_TICK;
  let iene = BASE_IENE_TICK;
  if (p) {
    const mult = (p.xpMultAll || 1) * (p.xpMultVoice || 1);
    xp = scaleXp(BASE_XP_TICK, mult);
    if (p.ieneBonusPerTick) iene += p.ieneBonusPerTick;
  }
  return { xp, iene, passive: p };
}

/** Chat grant rewards (every 10 counted messages). */
function getChatGrantRewards(userId) {
  const p = getActivePassive(userId);
  let xp = BASE_XP_TICK;
  let iene = BASE_IENE_TICK;
  if (p) {
    const mult = (p.xpMultAll || 1) * (p.xpMultChat || 1);
    xp = scaleXp(BASE_XP_TICK, mult);
    if (p.ieneBonusPerTick) iene += p.ieneBonusPerTick;
  }
  return { xp, iene, passive: p };
}

/** Daily claim amount (UTC). */
function getDailyAmount(userId) {
  const p = getActivePassive(userId);
  const bonus = p?.dailyBonus ? Number(p.dailyBonus) : 0;
  return {
    amount: DAILY_IENE + bonus,
    base: DAILY_IENE,
    bonus,
    passive: p
  };
}

function formatPassiveShort(userId) {
  const p = getActivePassive(userId);
  return p ? p.short : null;
}

function passiveLineForCoach(coachId) {
  const p = getPassive(coachId);
  return p ? p.short : null;
}

module.exports = {
  PASSIVES,
  BASE_XP_TICK,
  BASE_IENE_TICK,
  getPassive,
  getActivePassive,
  getVoiceTickRewards,
  getChatGrantRewards,
  getDailyAmount,
  formatPassiveShort,
  passiveLineForCoach,
  scaleXp
};

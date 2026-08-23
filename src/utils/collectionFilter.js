const { RARITIES, RARITY_ORDER } = require('../services/rarities.js');

const TIER_ALL = 'all';
const TIER_COACH = 'COACH';

/** Position group filters (alongside rarity tiers). */
const ROLE_ALL = 'role_all';
const ROLE_GK = 'role_gk';
const ROLE_ATT = 'role_att';
const ROLE_MID = 'role_mid';
const ROLE_DEF = 'role_def';

/** Goal Bound cards use FW / MF / DF / GK (+ legacy ST/CM/…). */
const ATT_POS = new Set(['FW', 'ST', 'CF', 'LW', 'RW', 'SS', 'LF', 'RF']);
const MID_POS = new Set(['MF', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'AM', 'DM', 'LCM', 'RCM']);
const DEF_POS = new Set(['DF', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'SW']);
const GK_POS = new Set(['GK']);

const TIER_OPTIONS = [
  { value: TIER_ALL, label: 'All tiers', emoji: '📚' },
  ...RARITY_ORDER.map(key => ({
    value: key,
    label: RARITIES[key].label,
    emoji: RARITIES[key].emoji
  })),
  { value: TIER_COACH, label: 'Masters', emoji: '🎩' },
  { value: ROLE_GK, label: 'Goalkeepers', emoji: '🧤' },
  { value: ROLE_ATT, label: 'Attack', emoji: '⚔️' },
  { value: ROLE_MID, label: 'Midfield', emoji: '🎯' },
  { value: ROLE_DEF, label: 'Defense', emoji: '🛡️' }
];

const ROLE_VALUES = new Set([ROLE_GK, ROLE_ATT, ROLE_MID, ROLE_DEF]);

function isRoleFilter(value) {
  return ROLE_VALUES.has(value);
}

function parseTierFromQuery(query) {
  const q = String(query || '');
  if (q.startsWith('__tier:')) {
    const tier = q.slice(7);
    if (
      tier === TIER_ALL ||
      tier === TIER_COACH ||
      RARITY_ORDER.includes(tier) ||
      isRoleFilter(tier)
    ) {
      return tier;
    }
  }
  return TIER_ALL;
}

function encodeTierQuery(tier) {
  if (!tier || tier === TIER_ALL || tier === ROLE_ALL) return '';
  return `__tier:${tier}`;
}

function isTierQuery(query) {
  return String(query || '').startsWith('__tier:');
}

function textQuery(query) {
  if (isTierQuery(query)) return '';
  return String(query || '').trim();
}

function roleGroupOf(position) {
  const p = String(position || '').toUpperCase();
  if (GK_POS.has(p)) return ROLE_GK;
  if (ATT_POS.has(p)) return ROLE_ATT;
  if (MID_POS.has(p)) return ROLE_MID;
  if (DEF_POS.has(p)) return ROLE_DEF;
  return null;
}

function matchesTier(card, tier) {
  if (!tier || tier === TIER_ALL || tier === ROLE_ALL) return true;
  if (tier === TIER_COACH) return card.position === 'CO';
  if (isRoleFilter(tier)) {
    if (card.position === 'CO') return false;
    return roleGroupOf(card.position) === tier;
  }
  if (card.position === 'CO') return false;
  return card.rarity === tier;
}

module.exports = {
  TIER_ALL,
  TIER_COACH,
  ROLE_ALL,
  ROLE_GK,
  ROLE_ATT,
  ROLE_MID,
  ROLE_DEF,
  TIER_OPTIONS,
  parseTierFromQuery,
  encodeTierQuery,
  isTierQuery,
  textQuery,
  matchesTier,
  isRoleFilter,
  roleGroupOf
};

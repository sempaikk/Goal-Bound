/**
 * Soft-hard position lock for /team.
 * Card position (FW/MF/DF/GK) must match the slot line.
 * CAM is shared by FW + MF. GK is exclusive.
 */
const { t } = require('../utils/i18n.js');

const LINE_FOR_POSITION = {
  FW: 'ATT',
  MF: 'MID',
  DF: 'DEF',
  GK: 'GK'
};

const SLOT_EXTRA = {
  CAM: ['FW', 'MF']
};

function normalizePos(pos) {
  const p = String(pos || '').toUpperCase().trim();
  if (p === 'FW' || p === 'MF' || p === 'DF' || p === 'GK' || p === 'CO') return p;
  return null;
}

function posLabel(userId, pos) {
  if (pos === 'FW') return t(userId, 'pos_fw');
  if (pos === 'MF') return t(userId, 'pos_mf');
  if (pos === 'DF') return t(userId, 'pos_df');
  if (pos === 'GK') return t(userId, 'pos_gk');
  if (pos === 'CO') return t(userId, 'pos_co');
  return pos || '?';
}

function canPlaySlot(cardPosition, slotKey, slots) {
  const pos = normalizePos(cardPosition);
  if (!pos || pos === 'CO') return false;

  const key = String(slotKey || '').toUpperCase();
  const slot = (slots || []).find(s => s.key === key);
  if (!slot) return false;

  const extra = SLOT_EXTRA[key];
  if (extra && extra.includes(pos)) return true;

  const requiredLine = LINE_FOR_POSITION[pos];
  if (!requiredLine) return false;
  return slot.line === requiredLine;
}

function filterCardsForSlot(cards, slotKey, slots) {
  return (cards || []).filter(c => canPlaySlot(c.position, slotKey, slots));
}

function filterSlotsForCard(cardPosition, slots) {
  return (slots || []).filter(s => canPlaySlot(cardPosition, s.key, slots));
}

/**
 * @param {object} card
 * @param {string} slotKey
 * @param {Array} slots
 * @param {string} [userId] locale owner
 */
function positionMismatchMessage(card, slotKey, slots, userId) {
  const uid = userId || '0';
  const pos = normalizePos(card?.position);
  const label = posLabel(uid, pos);
  const allowed = filterSlotsForCard(pos, slots).map(s => s.key);
  const allowStr = allowed.length ? allowed.join(', ') : '—';
  return t(uid, 'pos_mismatch', {
    name: card?.name || '?',
    label,
    slot: slotKey,
    allowed: allowStr
  });
}

module.exports = {
  LINE_FOR_POSITION,
  SLOT_EXTRA,
  normalizePos,
  canPlaySlot,
  filterCardsForSlot,
  filterSlotsForCard,
  positionMismatchMessage,
  posLabel
};

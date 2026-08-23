const DataService = require('../services/DataService.js');
const { resolveSlots } = require('../services/FieldRenderer.js');
const { getCoachId, getFormationForCoach } = require('../services/coachStore.js');
const {
  canPlaySlot,
  filterCardsForSlot,
  positionMismatchMessage
} = require('../services/positionEligibility.js');
const { purgeInvalidSeats } = require('../services/team/teamQoL.js');
const { t } = require('../utils/i18n.js');

function formationSlotsForUser(userId) {
  const coachId = getCoachId(userId);
  const formation = getFormationForCoach(coachId);
  return { coachId, formation, slots: resolveSlots(formation.id) };
}

function getEligibleOwnedCards(userId, slotKey) {
  const cardsById = new Map(DataService.loadCards().map(c => [c.id, c]));
  const { slots } = formationSlotsForUser(userId);
  let ownedCards = DataService.getUserCards(userId)
    .filter(uc => cardsById.has(uc.id))
    .map(uc => ({ ...cardsById.get(uc.id), level: uc.level }))
    .filter(c => c.position !== 'CO');
  return filterCardsForSlot(ownedCards, slotKey, slots);
}

function trySeatCard(userId, slotKey, cardId) {
  const cards = DataService.loadCards();
  const card = cards.find(c => c.id === Number(cardId) || c.id === cardId);
  const owns = card && DataService.userHasCard(userId, card.id);
  if (!card || !owns) return { ok: false, notice: t(userId, 'team_seat_fail') };
  if (card.position === 'CO') return { ok: false, notice: t(userId, 'team_seat_master') };
  const { formation, slots } = formationSlotsForUser(userId);
  const key = String(slotKey || '').toUpperCase();
  if (!slots.some(s => s.key === key)) {
    return { ok: false, notice: t(userId, 'team_seat_bad_slot', { slot: key, shape: formation.label }) };
  }
  if (!canPlaySlot(card.position, key, slots)) {
    return { ok: false, notice: positionMismatchMessage(card, key, slots, userId) };
  }
  DataService.setTeamSlot(userId, key, card.id, card.name);
  const seated = DataService.getTeam(userId).some(
    r => r.slot === key && Number(r.cardId) === Number(card.id)
  );
  if (!seated) {
    return { ok: false, notice: positionMismatchMessage(card, key, slots, userId) };
  }
  return { ok: true, notice: t(userId, 'team_seat_ok', { name: card.name, slot: key }), card };
}

module.exports = {
  formationSlotsForUser,
  getEligibleOwnedCards,
  trySeatCard,
  purgeInvalidSeats,
  canPlaySlot,
  positionMismatchMessage
};

/**
 * Formations + coach mapping for /team.
 *
 * Default (no coach): 4-3-3
 * Ego: 4-2-3-1
 * Noa: 4-4-2
 * Lavinho: 4-3-3
 * Snuffy: 3-5-2
 */

const FORMATIONS = {
  '4-3-3': {
    id: '4-3-3',
    label: '4-3-3',
    slots: [
      { key: 'LW', label: 'LW', line: 'ATT', xRatio: -0.308, yBias: 14 },
      { key: 'ST', label: 'ST', line: 'ATT', xRatio: 0, yBias: -16 },
      { key: 'RW', label: 'RW', line: 'ATT', xRatio: 0.308, yBias: 14 },
      { key: 'LM', label: 'LM', line: 'MID', xRatio: -0.288, yBias: 0 },
      { key: 'CM', label: 'CM', line: 'MID', xRatio: 0, yBias: 20 },
      { key: 'RM', label: 'RM', line: 'MID', xRatio: 0.288, yBias: 0 },
      { key: 'LB', label: 'LB', line: 'DEF', xRatio: -0.348, yBias: 0 },
      { key: 'CB1', label: 'CB', line: 'DEF', xRatio: -0.138, yBias: 18 },
      { key: 'CB2', label: 'CB', line: 'DEF', xRatio: 0.138, yBias: 18 },
      { key: 'RB', label: 'RB', line: 'DEF', xRatio: 0.348, yBias: 0 },
      { key: 'GK', label: 'GK', line: 'GK', xRatio: 0, yBias: 0 }
    ]
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    label: '4-2-3-1',
    slots: [
      // ST alone high; LW–CAM–RW band lower (centers ≥110px apart vs HEAD 96)
      { key: 'ST', label: 'ST', line: 'ATT', xRatio: 0, yBias: -70 },
      { key: 'LW', label: 'LW', line: 'ATT', xRatio: -0.32, yBias: 48 },
      { key: 'CAM', label: 'CAM', line: 'ATT', xRatio: 0, yBias: 55 },
      { key: 'RW', label: 'RW', line: 'ATT', xRatio: 0.32, yBias: 48 },
      { key: 'CDM1', label: 'CDM', line: 'MID', xRatio: -0.18, yBias: 4 },
      { key: 'CDM2', label: 'CDM', line: 'MID', xRatio: 0.18, yBias: 4 },
      { key: 'LB', label: 'LB', line: 'DEF', xRatio: -0.348, yBias: 0 },
      { key: 'CB1', label: 'CB', line: 'DEF', xRatio: -0.138, yBias: 18 },
      { key: 'CB2', label: 'CB', line: 'DEF', xRatio: 0.138, yBias: 18 },
      { key: 'RB', label: 'RB', line: 'DEF', xRatio: 0.348, yBias: 0 },
      { key: 'GK', label: 'GK', line: 'GK', xRatio: 0, yBias: 0 }
    ]
  },
  '4-4-2': {
    id: '4-4-2',
    label: '4-4-2',
    slots: [
      { key: 'ST1', label: 'ST', line: 'ATT', xRatio: -0.16, yBias: -8 },
      { key: 'ST2', label: 'ST', line: 'ATT', xRatio: 0.16, yBias: -8 },
      { key: 'LM', label: 'LM', line: 'MID', xRatio: -0.32, yBias: 0 },
      { key: 'CM1', label: 'CM', line: 'MID', xRatio: -0.11, yBias: 18 },
      { key: 'CM2', label: 'CM', line: 'MID', xRatio: 0.11, yBias: 18 },
      { key: 'RM', label: 'RM', line: 'MID', xRatio: 0.32, yBias: 0 },
      { key: 'LB', label: 'LB', line: 'DEF', xRatio: -0.348, yBias: 0 },
      { key: 'CB1', label: 'CB', line: 'DEF', xRatio: -0.138, yBias: 18 },
      { key: 'CB2', label: 'CB', line: 'DEF', xRatio: 0.138, yBias: 18 },
      { key: 'RB', label: 'RB', line: 'DEF', xRatio: 0.348, yBias: 0 },
      { key: 'GK', label: 'GK', line: 'GK', xRatio: 0, yBias: 0 }
    ]
  },
  '3-5-2': {
    id: '3-5-2',
    label: '3-5-2',
    slots: [
      { key: 'ST1', label: 'ST', line: 'ATT', xRatio: -0.16, yBias: -8 },
      { key: 'ST2', label: 'ST', line: 'ATT', xRatio: 0.16, yBias: -8 },
      { key: 'LWB', label: 'LWB', line: 'MID', xRatio: -0.36, yBias: -6 },
      { key: 'CM1', label: 'CM', line: 'MID', xRatio: -0.14, yBias: 22 },
      { key: 'CM2', label: 'CM', line: 'MID', xRatio: 0, yBias: 8 },
      { key: 'CM3', label: 'CM', line: 'MID', xRatio: 0.14, yBias: 22 },
      { key: 'RWB', label: 'RWB', line: 'MID', xRatio: 0.36, yBias: -6 },
      { key: 'CB1', label: 'CB', line: 'DEF', xRatio: -0.22, yBias: 18 },
      { key: 'CB2', label: 'CB', line: 'DEF', xRatio: 0, yBias: 28 },
      { key: 'CB3', label: 'CB', line: 'DEF', xRatio: 0.22, yBias: 18 },
      { key: 'GK', label: 'GK', line: 'GK', xRatio: 0, yBias: 0 }
    ]
  }
};

/** Coach card id → formation id. null coach = 4-3-3 */
const COACH_FORMATION = {
  14: '4-2-3-1', // Ego
  15: '4-4-2', // Noa
  16: '4-3-3', // Lavinho
  17: '3-5-2' // Snuffy
};

const COACH_IDS = [14, 15, 16, 17];

function getFormationForCoach(coachCardId) {
  if (coachCardId == null) return FORMATIONS['4-3-3'];
  const fid = COACH_FORMATION[coachCardId] || '4-3-3';
  return FORMATIONS[fid];
}

function getFormationSlots(coachCardId) {
  return getFormationForCoach(coachCardId).slots;
}

const SLOT_COMPAT = {
  ST: ['ST', 'ST1'],
  ST1: ['ST1', 'ST'],
  ST2: ['ST2', 'ST'],
  LW: ['LW', 'LM', 'LWB'],
  RW: ['RW', 'RM', 'RWB'],
  CAM: ['CAM', 'CM', 'CM1', 'ST'],
  LM: ['LM', 'LWB', 'LW'],
  RM: ['RM', 'RWB', 'RW'],
  CM: ['CM', 'CM1', 'CM2', 'CAM', 'CDM1'],
  CM1: ['CM1', 'CM', 'CDM1'],
  CM2: ['CM2', 'CM', 'CM3', 'CDM2'],
  CM3: ['CM3', 'CM2'],
  CDM1: ['CDM1', 'CM', 'CM1'],
  CDM2: ['CDM2', 'CM', 'CM2'],
  LWB: ['LWB', 'LM', 'LB', 'LW'],
  RWB: ['RWB', 'RM', 'RB', 'RW'],
  LB: ['LB', 'LWB'],
  RB: ['RB', 'RWB'],
  CB1: ['CB1'],
  CB2: ['CB2', 'CB3'],
  CB3: ['CB3', 'CB2'],
  GK: ['GK']
};

function remapTeamSlots(teamRows, newSlots) {
  const bySlot = new Map(teamRows.map(r => [r.slot, r]));
  const usedCards = new Set();
  const result = [];

  for (const slot of newSlots) {
    const exact = bySlot.get(slot.key);
    if (exact && !usedCards.has(exact.cardId)) {
      result.push({ ...exact, slot: slot.key });
      usedCards.add(exact.cardId);
      bySlot.delete(slot.key);
    }
  }

  for (const slot of newSlots) {
    if (result.some(r => r.slot === slot.key)) continue;
    const candidates = SLOT_COMPAT[slot.key] || [slot.key];
    for (const oldKey of candidates) {
      const row = bySlot.get(oldKey);
      if (row && !usedCards.has(row.cardId)) {
        result.push({ ...row, slot: slot.key });
        usedCards.add(row.cardId);
        bySlot.delete(oldKey);
        break;
      }
    }
  }

  return result;
}

module.exports = {
  FORMATIONS,
  COACH_FORMATION,
  COACH_IDS,
  getFormationForCoach,
  getFormationSlots,
  remapTeamSlots
};

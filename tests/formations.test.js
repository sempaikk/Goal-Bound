const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FORMATIONS,
  COACH_FORMATION,
  getFormationForCoach,
  remapTeamSlots
} = require('../src/services/formations.js');

describe('formations', () => {
  it('every formation has exactly 11 slots', () => {
    for (const [id, f] of Object.entries(FORMATIONS)) {
      assert.equal(f.slots.length, 11, `${id} should have 11 slots`);
      assert.equal(f.id, id);
      assert.ok(f.label);
    }
  });

  it('slot keys are unique within a formation', () => {
    for (const [id, f] of Object.entries(FORMATIONS)) {
      const keys = f.slots.map(s => s.key);
      assert.equal(new Set(keys).size, keys.length, `${id} has duplicate keys`);
    }
  });

  it('default coach mapping is 4-3-3', () => {
    assert.equal(getFormationForCoach(null).id, '4-3-3');
    assert.equal(getFormationForCoach(undefined).id, '4-3-3');
  });

  it('known coaches map to expected formations', () => {
    assert.equal(getFormationForCoach(14).id, '4-2-3-1'); // Ego
    assert.equal(getFormationForCoach(14).id, COACH_FORMATION[14]);
    assert.equal(getFormationForCoach(15).id, '4-4-2'); // Noa
    assert.equal(getFormationForCoach(16).id, '4-3-3'); // Lavinho
    assert.equal(getFormationForCoach(17).id, '3-5-2'); // Snuffy
  });

  it('remapTeamSlots keeps ST into ST1 when switching 4-3-3 → 4-4-2', () => {
    const team = [
      { slot: 'ST', cardId: 1, cardName: 'Isagi', level: 10 },
      { slot: 'GK', cardId: 2, cardName: 'Gagamaru', level: 5 }
    ];
    const next = FORMATIONS['4-4-2'].slots;
    const remapped = remapTeamSlots(team, next);
    const slots = remapped.map(r => r.slot);
    assert.ok(slots.includes('ST1') || slots.includes('ST2'), 'ST should map');
    assert.ok(slots.includes('GK'));
    assert.equal(remapped.find(r => r.cardId === 1).cardName, 'Isagi');
  });

  it('remapTeamSlots never duplicates the same cardId', () => {
    const team = [
      { slot: 'LW', cardId: 9, cardName: 'Bachira', level: 1 },
      { slot: 'LM', cardId: 9, cardName: 'Bachira', level: 1 }
    ];
    const remapped = remapTeamSlots(team, FORMATIONS['4-3-3'].slots);
    const ids = remapped.map(r => r.cardId);
    assert.equal(new Set(ids).size, ids.length);
  });
});

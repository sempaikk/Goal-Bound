const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  RARITIES,
  RARITY_ORDER,
  TOTAL_WEIGHT,
  rollRarity,
  percentageFor
} = require('../src/services/gacha/rarities.js');

describe('rarities', () => {
  it('weights sum to TOTAL_WEIGHT', () => {
    const sum = RARITY_ORDER.reduce((s, k) => s + RARITIES[k].weight, 0);
    assert.equal(sum, TOTAL_WEIGHT);
  });

  it('percentages sum ~100', () => {
    const pct = RARITY_ORDER.reduce((s, k) => s + percentageFor(k), 0);
    assert.ok(Math.abs(pct - 100) < 0.01);
  });

  it('rollRarity only returns known keys', () => {
    for (let i = 0; i < 200; i++) {
      const key = rollRarity();
      assert.ok(RARITY_ORDER.includes(key), `unexpected ${key}`);
    }
  });

  it('LOCKED is the most common in a large sample', () => {
    const counts = { LOCKED: 0, EGOISTA: 0, NEW_GEN: 0 };
    const N = 5000;
    for (let i = 0; i < N; i++) counts[rollRarity()]++;
    assert.ok(counts.LOCKED > counts.EGOISTA);
    assert.ok(counts.EGOISTA > counts.NEW_GEN);
  });
});

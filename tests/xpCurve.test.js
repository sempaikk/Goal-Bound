const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LEVEL_MIN,
  LEVEL_MAX,
  TOTAL_XP_TO_MAX,
  xpCostForLevel,
  totalXpForLevel,
  getProgressForXp,
  applyXpGain
} = require('../src/services/xpCurve.js');

describe('xpCurve', () => {
  it('level bounds', () => {
    assert.equal(LEVEL_MIN, 0);
    assert.equal(LEVEL_MAX, 100);
    assert.ok(TOTAL_XP_TO_MAX > 0);
  });

  it('xpCostForLevel(0) is 0 and costs increase overall', () => {
    assert.equal(xpCostForLevel(0), 0);
    assert.ok(xpCostForLevel(1) > 0);
    assert.ok(xpCostForLevel(50) > xpCostForLevel(10));
    assert.ok(xpCostForLevel(100) > xpCostForLevel(50));
  });

  it('totalXpForLevel is monotonic', () => {
    assert.equal(totalXpForLevel(0), 0);
    assert.equal(totalXpForLevel(LEVEL_MAX), TOTAL_XP_TO_MAX);
    for (let i = 1; i <= LEVEL_MAX; i++) {
      assert.ok(totalXpForLevel(i) >= totalXpForLevel(i - 1));
    }
  });

  it('getProgressForXp at 0 starts at level 0', () => {
    const p = getProgressForXp(0);
    assert.equal(p.level, 0);
    assert.equal(p.isMaxLevel, false);
  });

  it('getProgressForXp at TOTAL_XP_TO_MAX is max', () => {
    const p = getProgressForXp(TOTAL_XP_TO_MAX);
    assert.equal(p.level, LEVEL_MAX);
    assert.equal(p.isMaxLevel, true);
  });

  it('applyXpGain detects level up', () => {
    const cost1 = xpCostForLevel(1);
    const r = applyXpGain(0, cost1);
    assert.equal(r.previousLevel, 0);
    assert.equal(r.newLevel, 1);
    assert.equal(r.leveledUp, true);
    assert.equal(r.levelsGained, 1);
  });

  it('applyXpGain does not exceed TOTAL_XP_TO_MAX', () => {
    const r = applyXpGain(TOTAL_XP_TO_MAX - 10, 10_000);
    assert.equal(r.newTotalXp, TOTAL_XP_TO_MAX);
    assert.equal(r.newLevel, LEVEL_MAX);
  });
});

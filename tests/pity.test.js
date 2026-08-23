const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PITY_SOFT } = require('../src/services/gacha/pityRoll.js');

describe('pity', () => {
  it('PITY_SOFT is a positive number', () => {
    assert.equal(typeof PITY_SOFT, 'number');
    assert.ok(PITY_SOFT > 0);
    assert.ok(PITY_SOFT <= 200);
  });
});

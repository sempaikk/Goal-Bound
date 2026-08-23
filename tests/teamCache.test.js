const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { teamFingerprint } = require('../src/services/teamRenderCache.js');

describe('teamRenderCache fingerprint', () => {
  it('same team same hash', () => {
    const rows = [
      { slot: 'ST', cardId: 1, level: 10 },
      { slot: 'GK', cardId: 2, level: 5 }
    ];
    assert.equal(teamFingerprint(rows, '4-3-3'), teamFingerprint(rows, '4-3-3'));
  });

  it('order of rows does not matter', () => {
    const a = [
      { slot: 'ST', cardId: 1, level: 1 },
      { slot: 'GK', cardId: 2, level: 1 }
    ];
    const b = [
      { slot: 'GK', cardId: 2, level: 1 },
      { slot: 'ST', cardId: 1, level: 1 }
    ];
    assert.equal(teamFingerprint(a, '4-3-3'), teamFingerprint(b, '4-3-3'));
  });

  it('level or formation change alters hash', () => {
    const rows = [{ slot: 'ST', cardId: 1, level: 1 }];
    assert.notEqual(
      teamFingerprint(rows, '4-3-3'),
      teamFingerprint([{ slot: 'ST', cardId: 1, level: 2 }], '4-3-3')
    );
    assert.notEqual(teamFingerprint(rows, '4-3-3'), teamFingerprint(rows, '4-4-2'));
  });
});

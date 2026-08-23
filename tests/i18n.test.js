const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { STR, t, localeOf } = require('../src/utils/i18n.js');

describe('i18n', () => {
  it('en and pt have the same keys', () => {
    const enKeys = Object.keys(STR.en).sort();
    const ptKeys = Object.keys(STR.pt).sort();
    assert.deepEqual(ptKeys, enKeys, 'PT missing or extra keys vs EN');
  });

  it('no empty string values in en/pt', () => {
    for (const loc of ['en', 'pt']) {
      for (const [k, v] of Object.entries(STR[loc])) {
        assert.ok(typeof v === 'string' && v.length > 0, `${loc}.${k} empty`);
      }
    }
  });

  it('t() interpolates vars', () => {
    const s = t('0', 'ban_multi_title', { n: 5 });
    assert.ok(s.includes('5'));
  });

  it('t() falls back to key if missing', () => {
    assert.equal(t('0', '__missing_key_xyz__'), '__missing_key_xyz__');
  });

  it('localeOf defaults to en without stored preference', () => {
    assert.equal(localeOf('__no_such_user_xyz__'), 'en');
  });
});

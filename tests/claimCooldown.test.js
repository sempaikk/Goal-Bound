const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

function openTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-cd-'));
  const db = new Database(path.join(dir, 't.db'));
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_summon_at TEXT
    );
  `);
  const insert = db.prepare('INSERT INTO users (id, name, last_summon_at) VALUES (?, ?, ?)');
  const claim = db.prepare(
    `UPDATE users SET last_summon_at = ?
     WHERE id = ? AND (last_summon_at IS NULL OR last_summon_at <= ?)`
  );
  const get = db.prepare('SELECT last_summon_at as last FROM users WHERE id = ?');
  return {
    db,
    dir,
    seed(id, last) {
      insert.run(id, 't', last);
    },
    tryClaim(id, cooldownMs) {
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const cutoff = new Date(now - cooldownMs).toISOString();
      const r = claim.run(nowIso, id, cutoff);
      return r.changes > 0;
    },
    last(id) {
      return get.get(id)?.last;
    },
    close() {
      db.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* */ }
    }
  };
}

describe('atomic summon claim (SQL)', () => {
  const CD = 30 * 60 * 1000;
  let t;

  before(() => {
    t = openTemp();
    t.seed('u1', null);
  });

  after(() => t.close());

  it('first claim succeeds', () => {
    assert.equal(t.tryClaim('u1', CD), true);
    assert.ok(t.last('u1'));
  });

  it('second claim inside window fails', () => {
    assert.equal(t.tryClaim('u1', CD), false);
  });

  it('claim succeeds after cooldown window', () => {
    t.seed('u2', new Date(Date.now() - CD - 1000).toISOString());
    assert.equal(t.tryClaim('u2', CD), true);
  });
});

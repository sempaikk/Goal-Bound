const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

/**
 * Mirrors DataService.trySpendIene semantics without loading the bot singleton.
 */
function openTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-iene-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      iene INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insert = db.prepare('INSERT INTO users (id, name, iene) VALUES (?, ?, ?)');
  const spend = db.prepare('UPDATE users SET iene = iene - ? WHERE id = ? AND iene >= ?');
  const get = db.prepare('SELECT iene FROM users WHERE id = ?');
  return {
    db,
    dir,
    dbPath,
    seed(id, iene) {
      insert.run(id, 'tester', iene);
    },
    trySpend(id, amount) {
      const cost = Math.max(0, Math.round(Number(amount) || 0));
      if (cost === 0) return { ok: true, balance: get.get(id).iene };
      const result = spend.run(cost, id, cost);
      return { ok: result.changes > 0, balance: get.get(id).iene };
    },
    balance(id) {
      return get.get(id).iene;
    },
    close() {
      db.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  };
}

describe('atomic iene spend (SQL)', () => {
  let t;

  before(() => {
    t = openTempDb();
    t.seed('u1', 10);
  });

  after(() => t.close());

  it('spends when balance is enough', () => {
    const r = t.trySpend('u1', 3);
    assert.equal(r.ok, true);
    assert.equal(r.balance, 7);
  });

  it('rejects when balance is insufficient', () => {
    const r = t.trySpend('u1', 100);
    assert.equal(r.ok, false);
    assert.equal(r.balance, 7);
  });

  it('cost 0 is always ok', () => {
    const r = t.trySpend('u1', 0);
    assert.equal(r.ok, true);
    assert.equal(r.balance, 7);
  });

  it('parallel-style double spend cannot both succeed', () => {
    t.seed('u2', 5);
    const a = t.trySpend('u2', 5);
    const b = t.trySpend('u2', 5);
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.equal(t.balance('u2'), 0);
  });
});

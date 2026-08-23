const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { rollRarity } = require('./rarities.js');
const { TOTAL_XP_TO_MAX } = require('./xpCurve.js');
const { applyDuplicateXp } = require('./duplicateXp.js');

const LEVEL_START = 0;
const LEVEL_MAX = 100;
const LEVEL_MIN = 0;

function clampLevel(level) {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(level)));
}

function clampXp(xp) {
  return Math.min(TOTAL_XP_TO_MAX, Math.max(0, Math.round(xp)));
}

class DataService {
  constructor() {
    this.cardsPath = config.PATHS.CARDS;
    this.dbPath = config.PATHS.DB;
    this._cardsCache = null;

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this._initSchema();

    this._stmts = {
      ensureUser: this.db.prepare(
        `INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)`
      ),
      touchUsername: this.db.prepare(
        `UPDATE users SET name = ? WHERE id = ? AND name != ?`
      ),
      getLastSummonAt: this.db.prepare(
        `SELECT last_summon_at as lastSummonAt FROM users WHERE id = ?`
      ),
      setLastSummonAt: this.db.prepare(
        `UPDATE users SET last_summon_at = ? WHERE id = ?`
      ),
      tryClaimSummon: this.db.prepare(
        `UPDATE users SET last_summon_at = ?
         WHERE id = ?
           AND (last_summon_at IS NULL OR last_summon_at <= ?)`
      ),
      getIene: this.db.prepare(`SELECT iene FROM users WHERE id = ?`),
      setIene: this.db.prepare(`UPDATE users SET iene = ? WHERE id = ?`),
      addIene: this.db.prepare(
        `UPDATE users SET iene = MAX(0, iene + ?) WHERE id = ?`
      ),
      trySpendIene: this.db.prepare(
        `UPDATE users SET iene = iene - ? WHERE id = ? AND iene >= ?`
      ),
      hasCard: this.db.prepare(
        `SELECT 1 FROM user_cards WHERE user_id = ? AND card_id = ? LIMIT 1`
      ),
      addCard: this.db.prepare(
        `INSERT OR IGNORE INTO user_cards (user_id, card_id, card_name, obtained_at, level, xp) VALUES (?, ?, ?, ?, ?, ?)`
      ),
      getUserCards: this.db.prepare(
        `SELECT card_id as id, card_name as name, obtained_at as obtainedAt, level, xp
         FROM user_cards WHERE user_id = ? ORDER BY obtained_at ASC`
      ),
      getCardLevel: this.db.prepare(
        `SELECT level FROM user_cards WHERE user_id = ? AND card_id = ?`
      ),
      setCardLevel: this.db.prepare(
        `UPDATE user_cards SET level = ? WHERE user_id = ? AND card_id = ?`
      ),
      getCardXp: this.db.prepare(
        `SELECT xp FROM user_cards WHERE user_id = ? AND card_id = ?`
      ),
      setCardXp: this.db.prepare(
        `UPDATE user_cards SET xp = ? WHERE user_id = ? AND card_id = ?`
      ),
      getMessageCount: this.db.prepare(
        `SELECT message_count as messageCount FROM users WHERE id = ?`
      ),
      setMessageCount: this.db.prepare(
        `UPDATE users SET message_count = ? WHERE id = ?`
      ),
      incrementMessageCount: this.db.prepare(
        `UPDATE users SET message_count = message_count + ? WHERE id = ? RETURNING message_count as messageCount`
      ),
      countUserCards: this.db.prepare(
        `SELECT COUNT(*) as total FROM user_cards WHERE user_id = ?`
      ),
      setTeamSlot: this.db.prepare(
        `INSERT INTO user_team (user_id, slot, card_id, card_name) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, slot) DO UPDATE SET card_id = excluded.card_id, card_name = excluded.card_name`
      ),
      clearTeamSlot: this.db.prepare(
        `DELETE FROM user_team WHERE user_id = ? AND slot = ?`
      ),
      clearCardFromOtherSlots: this.db.prepare(
        `DELETE FROM user_team WHERE user_id = ? AND card_id = ? AND slot != ?`
      ),
      clearAllTeamSlots: this.db.prepare(
        `DELETE FROM user_team WHERE user_id = ?`
      ),
      getTeam: this.db.prepare(
        `SELECT ut.slot, ut.card_id as cardId, ut.card_name as cardName, uc.level as level
         FROM user_team ut
         JOIN user_cards uc ON uc.user_id = ut.user_id AND uc.card_id = ut.card_id
         WHERE ut.user_id = ?`
      ),
      removeCard: this.db.prepare(
        `DELETE FROM user_cards WHERE user_id = ? AND card_id = ?`
      ),
      clearCardFromTeam: this.db.prepare(
        `DELETE FROM user_team WHERE user_id = ? AND card_id = ?`
      ),
      clearAllCards: this.db.prepare(
        `DELETE FROM user_cards WHERE user_id = ?`
      )
    };

    this._setTeamSlotExclusive = this.db.transaction((userId, slot, cardId, cardName) => {
      this._stmts.clearCardFromOtherSlots.run(userId, cardId, slot);
      this._stmts.setTeamSlot.run(userId, slot, cardId, cardName);
    });

    this._removeCardTx = this.db.transaction((userId, cardId) => {
      const cardResult = this._stmts.removeCard.run(userId, cardId);
      const teamResult = this._stmts.clearCardFromTeam.run(userId, cardId);
      return {
        removed: cardResult.changes > 0,
        clearedSlots: teamResult.changes
      };
    });

    this._clearAllCardsTx = this.db.transaction(userId => {
      const cardsResult = this._stmts.clearAllCards.run(userId);
      const teamResult = this._stmts.clearAllTeamSlots.run(userId);
      return {
        cardsRemoved: cardsResult.changes,
        slotsCleared: teamResult.changes
      };
    });

    logger.success(`SQLite database ready at ${this.dbPath}`);
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        card_id INTEGER NOT NULL,
        card_name TEXT NOT NULL,
        obtained_at TEXT NOT NULL,
        UNIQUE(user_id, card_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id);

      CREATE TABLE IF NOT EXISTS user_team (
        user_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        card_id INTEGER NOT NULL,
        card_name TEXT NOT NULL,
        PRIMARY KEY (user_id, slot)
      );
    `);

    this._migrateAddColumnIfMissing('users', 'last_summon_at', 'TEXT');
    this._migrateAddColumnIfMissing('users', 'iene', 'INTEGER NOT NULL DEFAULT 0');
    this._migrateAddColumnIfMissing('user_cards', 'level', `INTEGER NOT NULL DEFAULT ${LEVEL_START}`);
    this._migrateXpSystem();
    this._migrateAddColumnIfMissing('users', 'message_count', 'INTEGER NOT NULL DEFAULT 0');
  }

  _migrateXpSystem() {
    const columns = this.db.prepare(`PRAGMA table_info(user_cards)`).all();
    const hasXp = columns.some(c => c.name === 'xp');

    if (!hasXp) {
      this.db.exec(`ALTER TABLE user_cards ADD COLUMN xp INTEGER NOT NULL DEFAULT 0`);
      const resetResult = this.db.prepare(`UPDATE user_cards SET level = 0`).run();
      logger.info(
        `Database migrated: added column "xp" to "user_cards" and reset ${resetResult.changes} existing card level(s) to 0`
      );
    }
  }

  _migrateAddColumnIfMissing(table, column, sqlType) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some(c => c.name === column);

    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
      logger.info(`Database migrated: added column "${column}" to "${table}"`);
    }
  }

  loadCards() {
    if (this._cardsCache) return this._cardsCache;
    try {
      const data = fs.readFileSync(this.cardsPath, 'utf8');
      this._cardsCache = JSON.parse(data);
      return this._cardsCache;
    } catch (error) {
      logger.error('Error loading cards', error.message);
      return [];
    }
  }

  getRandomCard(cards) {
    return cards[Math.floor(Math.random() * cards.length)];
  }

  getWeightedRandomCard(cards) {
    const rarity = rollRarity();
    const pool = cards.filter(c => c.rarity === rarity);
    if (pool.length === 0) return { card: null, rarity };
    const card = pool[Math.floor(Math.random() * pool.length)];
    return { card, rarity };
  }

  ensureUser(userId, username) {
    this._stmts.ensureUser.run(userId, username, new Date().toISOString());
    this._stmts.touchUsername.run(username, userId, username);
  }

  userHasCard(userId, cardId) {
    return !!this._stmts.hasCard.get(userId, cardId);
  }

  addCard(userId, cardId, cardName) {
    const result = this._stmts.addCard.run(
      userId,
      cardId,
      cardName,
      new Date().toISOString(),
      LEVEL_START,
      0
    );

    if (result.changes === 0) {
      const cards = this.loadCards() || [];
      const card = cards.find(c => Number(c.id) === Number(cardId)) || {
        id: cardId,
        name: cardName
      };
      if (card.rarity) {
        applyDuplicateXp(userId, card, card.rarity);
      }
    }
  }

  addCardFromPull(userId, card, rarity) {
    if (!card || card.id == null) {
      return {
        isNew: false,
        xpGained: 0,
        leveledUp: false,
        previousLevel: null,
        newLevel: null,
        maxed: false
      };
    }

    const result = this._stmts.addCard.run(
      userId,
      card.id,
      card.name,
      new Date().toISOString(),
      LEVEL_START,
      0
    );

    if (result.changes > 0) {
      return {
        isNew: true,
        xpGained: 0,
        leveledUp: false,
        previousLevel: null,
        newLevel: null,
        maxed: false
      };
    }

    const xp = applyDuplicateXp(userId, card, rarity);
    return {
      isNew: false,
      xpGained: xp.xpGained || 0,
      leveledUp: Boolean(xp.leveledUp),
      previousLevel: xp.previousLevel,
      newLevel: xp.newLevel,
      maxed: Boolean(xp.maxed)
    };
  }

  removeCard(userId, cardId) {
    return this._removeCardTx(String(userId), Number(cardId));
  }

  clearAllCards(userId) {
    return this._clearAllCardsTx(String(userId));
  }

  getUserCards(userId) {
    return this._stmts.getUserCards.all(userId);
  }

  listCardsNamedLikeEgoAtId(cardId) {
    return this.db
      .prepare(
        `SELECT user_id, card_name FROM user_cards
         WHERE card_id = ?
           AND (
             lower(card_name) LIKE '%ego%'
             OR lower(card_name) LIKE '%jinpachi%'
           )`
      )
      .all(cardId);
  }

  renameCard(userId, cardId, newName) {
    const result = this.db
      .prepare(`UPDATE user_cards SET card_name = ? WHERE user_id = ? AND card_id = ?`)
      .run(newName, String(userId), cardId);
    return result.changes > 0;
  }

  reassignCardId(userId, fromId, toId, newName) {
    const uid = String(userId);
    if (this.userHasCard(uid, toId)) return false;
    return this.db.transaction(() => {
      const upd = this.db
        .prepare(
          `UPDATE user_cards SET card_id = ?, card_name = ? WHERE user_id = ? AND card_id = ?`
        )
        .run(toId, newName, uid, fromId);
      if (upd.changes === 0) return false;
      this.db
        .prepare(
          `UPDATE user_team SET card_id = ?, card_name = ? WHERE user_id = ? AND card_id = ?`
        )
        .run(toId, newName, uid, fromId);
      return true;
    })();
  }

  getCardLevel(userId, cardId) {
    const row = this._stmts.getCardLevel.get(userId, cardId);
    return row ? row.level : null;
  }

  setCardLevel(userId, cardId, level) {
    const clamped = clampLevel(level);
    this._stmts.setCardLevel.run(clamped, userId, cardId);
    return clamped;
  }

  addCardLevel(userId, cardId, delta) {
    const current = this.getCardLevel(userId, cardId);
    if (current === null) return null;
    return this.setCardLevel(userId, cardId, current + delta);
  }

  getCardXp(userId, cardId) {
    const row = this._stmts.getCardXp.get(userId, cardId);
    return row ? row.xp : null;
  }

  setCardXp(userId, cardId, xp) {
    const clamped = clampXp(xp);
    this._stmts.setCardXp.run(clamped, userId, cardId);
    return clamped;
  }

  getMessageCount(userId) {
    const row = this._stmts.getMessageCount.get(userId);
    return row ? row.messageCount : 0;
  }

  setMessageCount(userId, count) {
    this._stmts.setMessageCount.run(Math.max(0, Math.round(count)), userId);
  }

  incrementMessageCount(userId, amount = 1) {
    const row = this._stmts.incrementMessageCount.get(Math.max(0, Math.round(amount)), userId);
    return row ? row.messageCount : 0;
  }

  getValidUserCards(userId, cards) {
    const validCardIds = new Set(cards.map(c => c.id));
    return this.getUserCards(userId).filter(uc => validCardIds.has(uc.id));
  }

  getUserCardCount(userId) {
    return this._stmts.countUserCards.get(userId).total;
  }

  getSummonCooldownRemaining(userId, cooldownMs) {
    const row = this._stmts.getLastSummonAt.get(userId);
    if (!row || !row.lastSummonAt) return 0;
    const elapsed = Date.now() - new Date(row.lastSummonAt).getTime();
    return Math.max(0, cooldownMs - elapsed);
  }

  touchSummonCooldown(userId) {
    this._stmts.setLastSummonAt.run(new Date().toISOString(), userId);
  }

  tryClaimSummonCooldown(userId, cooldownMs) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const cutoffIso = new Date(now - cooldownMs).toISOString();
    const result = this._stmts.tryClaimSummon.run(nowIso, String(userId), cutoffIso);
    if (result.changes > 0) {
      return { ok: true, remainingMs: 0 };
    }
    return {
      ok: false,
      remainingMs: this.getSummonCooldownRemaining(userId, cooldownMs)
    };
  }

  getIene(userId) {
    const row = this._stmts.getIene.get(userId);
    return row ? row.iene : 0;
  }

  setIene(userId, amount) {
    const clamped = Math.max(0, Math.round(Number(amount) || 0));
    this._stmts.setIene.run(clamped, userId);
    return clamped;
  }

  addIene(userId, delta) {
    const d = Math.round(Number(delta) || 0);
    if (d === 0) return this.getIene(userId);
    this._stmts.addIene.run(d, userId);
    return this.getIene(userId);
  }

  trySpendIene(userId, amount) {
    const cost = Math.max(0, Math.round(Number(amount) || 0));
    if (cost === 0) return { ok: true, balance: this.getIene(userId) };
    const result = this._stmts.trySpendIene.run(cost, String(userId), cost);
    return {
      ok: result.changes > 0,
      balance: this.getIene(userId)
    };
  }

  /**
   * Seat a card. Rejects when card line does not match slot (FW/MF/DF/GK).
   * @param {{ skipPositionCheck?: boolean }} [opts] skip for internal remap only
   * @returns {string|null} previous slot of this card, or null if rejected / no previous
   */
  setTeamSlot(userId, slot, cardId, cardName, opts = {}) {
    if (!opts.skipPositionCheck) {
      try {
        const { getCoachId, getFormationForCoach } = require('./coachStore.js');
        const { canPlaySlot } = require('./positionEligibility.js');
        const cards = this.loadCards() || [];
        const card = cards.find(c => Number(c.id) === Number(cardId));
        if (card) {
          if (card.position === 'CO') {
            logger.warn(`Rejected master on pitch: ${card.name}`);
            return null;
          }
          const formation = getFormationForCoach(getCoachId(userId));
          const slots = formation.slots || [];
          if (!canPlaySlot(card.position, slot, slots)) {
            logger.warn(`Rejected ${card.name} (${card.position}) at ${slot}`);
            return null;
          }
        }
      } catch (err) {
        logger.warn('Position check skipped', err.message);
      }
    }

    const previousSlotForThisCard = this._stmts.getTeam
      .all(userId)
      .find(row => row.cardId === cardId && row.slot !== slot);

    this._setTeamSlotExclusive(userId, slot, cardId, cardName);
    return previousSlotForThisCard ? previousSlotForThisCard.slot : null;
  }

  clearTeamSlot(userId, slot) {
    this._stmts.clearTeamSlot.run(userId, slot);
  }

  clearAllTeamSlots(userId) {
    const result = this._stmts.clearAllTeamSlots.run(userId);
    return result.changes;
  }

  getTeam(userId) {
    return this._stmts.getTeam.all(userId);
  }

  close() {
    try {
      this.db.close();
      logger.success('Database connection closed');
    } catch (error) {
      logger.error('Error closing database', error.message);
    }
  }
}

module.exports = new DataService();
module.exports.LEVEL_START = LEVEL_START;
module.exports.LEVEL_MAX = LEVEL_MAX;
module.exports.LEVEL_MIN = LEVEL_MIN;

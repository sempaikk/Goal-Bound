const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');

const MAPPING_PATH = path.join(config.PERSIST_DIR, 'character-emojis.json');
const LEGACY_MAPPING_PATH = path.join(__dirname, '..', '..', 'data', 'character-emojis.json');

let _cache = null;

function loadMapping() {
  if (_cache) return _cache;

  for (const p of [MAPPING_PATH, LEGACY_MAPPING_PATH]) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      _cache = JSON.parse(raw);
      return _cache;
    } catch (error) {
      logger.warn('Could not load character-emojis.json from ' + p, error.message);
    }
  }

  _cache = {};
  return _cache;
}

/**
 * @param {number} cardId
 * @returns {{id: string, name: string}|null}
 */
function getEmojiForCard(cardId) {
  const mapping = loadMapping();
  const entry = mapping[String(cardId)];
  if (!entry || !entry.id || !entry.name) return null;
  const id = String(entry.id);
  if (!/^\d{17,20}$/.test(id)) return null;
  return { id, name: String(entry.name) };
}

function invalidateEmojiCache() {
  _cache = null;
}

module.exports = { getEmojiForCard, invalidateEmojiCache };

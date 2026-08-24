const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');

// Onde o tools/upload-character-emojis.js / emojiSync salva o resultado
// (card id -> {id, name} do Application Emoji criado no Discord).
const MAPPING_PATH = path.join(__dirname, '..', '..', 'data', 'character-emojis.json');

// Cacheado em memória depois da primeira leitura.
let _cache = null;

/**
 * Carrega o mapeamento de emojis, se existir. Projetado pra NUNCA
 * lançar erro - se o arquivo ainda não existe ou está corrompido,
 * retorna um objeto vazio e o bot continua sem ícones nos menus.
 * @returns {Object<string, {id: string, name: string}>} card id (string) -> emoji
 */
function loadMapping() {
  if (_cache) return _cache;

  try {
    if (!fs.existsSync(MAPPING_PATH)) {
      _cache = {};
      return _cache;
    }
    const raw = fs.readFileSync(MAPPING_PATH, 'utf8');
    _cache = JSON.parse(raw);
    return _cache;
  } catch (error) {
    logger.warn('Could not load character-emojis.json - falling back to no icons in menus', error.message);
    _cache = {};
    return _cache;
  }
}

/** Call after emojiSync writes a new mapping so the next lookup is fresh. */
function invalidateEmojiCache() {
  _cache = null;
}

/**
 * Retorna o emoji customizado de uma carta específica, no formato que
 * o discord.js espera em `.setEmoji(...)` / campo `emoji` de opção de
 * menu, ou null se essa carta ainda não tem emoji cadastrado.
 *
 * IMPORTANTE: retorna sempre um objeto NOVO com só {id, name} - nunca
 * o registro cru do character-emojis.json (que também guarda "hash").
 * O discord.js valida o campo emoji de forma estrita - qualquer
 * propriedade a mais que {id, name, animated} faz a validação falhar.
 * @param {number} cardId
 * @returns {{id: string, name: string}|null}
 */
function getEmojiForCard(cardId) {
  const mapping = loadMapping();
  const entry = mapping[String(cardId)];
  if (!entry || !entry.id || !entry.name) return null;
  const id = String(entry.id);
  // Reject non-snowflake so we never emit :name: or break select menus
  if (!/^\d{17,20}$/.test(id)) return null;
  return { id, name: String(entry.name) };
}

module.exports = { getEmojiForCard, invalidateEmojiCache };

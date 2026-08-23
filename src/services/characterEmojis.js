const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');

// Onde o tools/upload-character-emojis.js salva o resultado do upload
// (card id -> {id, name} do Application Emoji criado no Discord).
const MAPPING_PATH = path.join(__dirname, '..', '..', 'data', 'character-emojis.json');

// Cacheado em memória depois da primeira leitura, igual o cards.json
// no DataService - esse arquivo não muda durante a execução do bot
// (só muda quando o tools/upload-character-emojis.js roda de novo).
let _cache = null;

/**
 * Carrega o mapeamento de emojis, se existir. Projetado pra NUNCA
 * lançar erro - se o arquivo ainda não existe (script de upload nunca
 * rodou) ou está corrompido, retorna um objeto vazio e o bot continua
 * funcionando normalmente, só sem os ícones nos menus (fallback pro
 * comportamento antigo, sem emoji nenhum).
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

/**
 * Retorna o emoji customizado de uma carta específica, no formato que
 * o discord.js espera em `.setEmoji(...)` / campo `emoji` de opção de
 * menu, ou null se essa carta ainda não tem emoji cadastrado (o menu
 * cai de volta pro comportamento sem ícone, sem quebrar nada).
 *
 * IMPORTANTE: retorna sempre um objeto NOVO com só {id, name} - nunca
 * o registro cru do character-emojis.json. Esse arquivo também guarda
 * um campo "hash" (usado só internamente pelo emojiSync.js pra saber
 * se o ícone mudou). O discord.js valida o campo emoji de forma
 * estrita - qualquer propriedade a mais que {id, name, animated} faz a
 * validação inteira falhar com "Received one or more errors", mesmo
 * id/name estando certos. Isso já causou esse exato bug no /team antes
 * (o menu de cartas quebrava ao selecionar uma posição) - é fácil
 * reintroduzir se algum dia adicionarmos mais campos ao JSON, então a
 * extração fica centralizada aqui, não em cada lugar que chama.
 * @param {number} cardId
 * @returns {{id: string, name: string}|null}
 */
function getEmojiForCard(cardId) {
  const mapping = loadMapping();
  const entry = mapping[String(cardId)];
  if (!entry || !entry.id || !entry.name) return null;
  return { id: entry.id, name: entry.name };
}

module.exports = { getEmojiForCard };

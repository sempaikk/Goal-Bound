/**
 * Sincroniza Application Emojis com data/icons/ no boot.
 *
 * Mapping fica em PERSIST_DIR (volume no Railway) — NÃO no repo.
 * Se ficasse em data/, todo deploy recolocava IDs velhos e o Discord
 * renderizava <:name:id> como texto :name:.
 *
 * Hash do ícone: só reenvia se o PNG mudou OU se o ID sumiu da application.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { invalidateEmojiCache } = require('./characterEmojis.js');

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const MAPPING_PATH = path.join(config.PERSIST_DIR, 'character-emojis.json');
const LEGACY_MAPPING_PATH = path.join(__dirname, '..', '..', 'data', 'character-emojis.json');

const EMOJI_SIZE = 128;
const MAX_EMOJI_BYTES = 256 * 1024;

function toEmojiName(cardName) {
  const slug = cardName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.slice(0, 32).padEnd(2, '_');
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function resizeForEmoji(iconPath) {
  const buffer = await sharp(iconPath)
    .resize(EMOJI_SIZE, EMOJI_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (buffer.length > MAX_EMOJI_BYTES) {
    throw new Error(
      `Icon still too large after resize: ${(buffer.length / 1024).toFixed(0)}KB ` +
      `(limit: ${MAX_EMOJI_BYTES / 1024}KB) - ${iconPath}`
    );
  }

  return buffer;
}

function loadMapping() {
  for (const p of [MAPPING_PATH, LEGACY_MAPPING_PATH]) {
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data && typeof data === 'object') return data;
    } catch {
      /* try next */
    }
  }
  return {};
}

function saveMapping(mapping) {
  try {
    if (!fs.existsSync(config.PERSIST_DIR)) {
      fs.mkdirSync(config.PERSIST_DIR, { recursive: true });
    }
  } catch {
    /* ignore */
  }
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadLiveEmojiIds(client) {
  try {
    const emojis = await client.application.emojis.fetch();
    return new Set([...emojis.keys()].map(String));
  } catch (error) {
    logger.warn('emojiSync: não consegui listar application emojis', error.message);
    return null;
  }
}

/**
 * @param {import('discord.js').Client} client
 */
async function syncCharacterEmojis(client) {
  if (!fs.existsSync(config.PATHS.CARDS) || !fs.existsSync(ICONS_DIR)) {
    return;
  }

  let cards;
  try {
    cards = JSON.parse(fs.readFileSync(config.PATHS.CARDS, 'utf8'));
  } catch (error) {
    logger.warn('emojiSync: não consegui ler cards.json, pulando sincronização de emojis', error.message);
    return;
  }

  const mapping = loadMapping();
  const liveIds = await loadLiveEmojiIds(client);

  const pending = [];
  let staleCount = 0;

  for (const card of cards) {
    if (!card.icon) continue;

    const iconPath = path.join(ICONS_DIR, card.icon);
    if (!fs.existsSync(iconPath)) {
      logger.warn(`emojiSync: ícone não encontrado para ${card.name} (${iconPath}), pulando.`);
      continue;
    }

    const hash = hashFile(iconPath);
    const existing = mapping[String(card.id)];

    const idMissing =
      liveIds != null &&
      existing?.id &&
      !liveIds.has(String(existing.id));

    // Primeira vez no volume: mapping legado do repo com IDs de outro app
    const forceFromLegacy =
      liveIds == null &&
      existing?.id &&
      !fs.existsSync(MAPPING_PATH);

    if (existing && existing.hash === hash && !idMissing && !forceFromLegacy) {
      continue;
    }

    if (idMissing || forceFromLegacy) staleCount++;
    pending.push({
      card,
      iconPath,
      hash,
      existing,
      idMissing: Boolean(idMissing || forceFromLegacy)
    });
  }

  if (pending.length === 0) {
    logger.info('emojiSync: todos os ícones de emoji já estão sincronizados.');
    if (!fs.existsSync(MAPPING_PATH) && Object.keys(mapping).length > 0) {
      saveMapping(mapping);
    }
    try {
      invalidateEmojiCache();
    } catch {
      /* ignore */
    }
    return;
  }

  logger.info(
    `emojiSync: ${pending.length} ícone(s) a sincronizar` +
      (staleCount ? ` (${staleCount} stale / :name:)` : '') +
      '…'
  );

  let synced = 0;
  let failed = 0;

  for (const { card, iconPath, hash, existing, idMissing } of pending) {
    try {
      if (existing?.id && !idMissing) {
        try {
          await client.application.emojis.delete(existing.id);
        } catch (error) {
          logger.warn(
            `emojiSync: não consegui apagar emoji antigo de ${card.name} (${existing.id})`,
            error.message
          );
        }
        await sleep(1200);
      }

      const resizedBuffer = await resizeForEmoji(iconPath);
      const emojiName = toEmojiName(card.name);

      const created = await client.application.emojis.create({
        attachment: resizedBuffer,
        name: emojiName
      });

      mapping[String(card.id)] = { id: created.id, name: created.name, hash };
      saveMapping(mapping);

      logger.success(
        `emojiSync: ${card.name} -> "${created.name}" (${(resizedBuffer.length / 1024).toFixed(1)}KB)` +
          (idMissing ? ' [stale fixed]' : '')
      );
      synced++;

      await sleep(1200);
    } catch (error) {
      const detail = error.rawError?.message || error.message;
      logger.error(`emojiSync: falha ao sincronizar ${card.name} - ${detail}`);
      failed++;
    }
  }

  try {
    invalidateEmojiCache();
  } catch {
    /* ignore */
  }

  logger.info(`emojiSync: concluído - ${synced} sincronizado(s), ${failed} falha(s).`);
}

module.exports = { syncCharacterEmojis, MAPPING_PATH };

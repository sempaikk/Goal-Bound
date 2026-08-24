/**
 * Sincroniza Application Emojis com data/icons/ no boot.
 *
 * Mapping em PERSIST_DIR (volume Railway).
 * Upload usa data URI PNG explícito — buffer cru virava data:image/jpg e
 * o Discord respondia "Invalid Form Body".
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
  const name = slug.slice(0, 32).replace(/^_+|_+$/g, '');
  return name.length >= 2 ? name : (name + '__').slice(0, 2);
}

function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function resizeForEmoji(iconPath) {
  // Discord exige ~128x128 e ≤256KB. PNG explícito (não deixa o d.js marcar como jpg).
  const buffer = await sharp(iconPath, { animated: false })
    .ensureAlpha()
    .resize(EMOJI_SIZE, EMOJI_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, force: true })
    .toBuffer();

  if (buffer.length > MAX_EMOJI_BYTES) {
    // Segunda tentativa mais agressiva
    const smaller = await sharp(buffer)
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, force: true, quality: 80 })
      .toBuffer();
    if (smaller.length > MAX_EMOJI_BYTES) {
      throw new Error(
        `Icon still too large: ${(smaller.length / 1024).toFixed(0)}KB (limit 256KB) - ${iconPath}`
      );
    }
    return smaller;
  }

  return buffer;
}

/** Discord API expects image as data URI. Explicit PNG avoids jpg mislabel. */
function toPngDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
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

function formatApiError(error) {
  const raw = error.rawError || error;
  const msg = raw.message || error.message || 'unknown';
  let extra = '';
  try {
    if (raw.errors) extra = ' ' + JSON.stringify(raw.errors);
  } catch {
    /* ignore */
  }
  return msg + extra;
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

    const forceFromLegacy =
      liveIds == null &&
      existing?.id &&
      !fs.existsSync(MAPPING_PATH);

    // Mapping vazio no volume + arquivo legado {} → todos precisam upload
    const noEntry = !existing || !existing.id;

    if (existing && existing.hash === hash && !idMissing && !forceFromLegacy && !noEntry) {
      continue;
    }

    if (idMissing || forceFromLegacy || noEntry) staleCount++;
    pending.push({
      card,
      iconPath,
      hash,
      existing,
      idMissing: Boolean(idMissing || forceFromLegacy || noEntry)
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
      (staleCount ? ` (${staleCount} novos/stale)` : '') +
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
      const dataUri = toPngDataUri(resizedBuffer);

      const created = await client.application.emojis.create({
        attachment: dataUri,
        name: emojiName
      });

      mapping[String(card.id)] = { id: String(created.id), name: created.name, hash };
      saveMapping(mapping);

      logger.success(
        `emojiSync: ${card.name} -> "${created.name}" (${(resizedBuffer.length / 1024).toFixed(1)}KB)` +
          (idMissing ? ' [new/stale fixed]' : '')
      );
      synced++;

      await sleep(1200);
    } catch (error) {
      logger.error(`emojiSync: falha ao sincronizar ${card.name} - ${formatApiError(error)}`);
      failed++;
      await sleep(800);
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

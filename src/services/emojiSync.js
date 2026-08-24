/**
 * Sincroniza automaticamente os Application Emojis do bot com os
 * ícones de data/icons/ toda vez que o bot inicia (chamado a partir
 * do evento ready).
 *
 * Por que baseado em hash, e não "sempre reenviar": a API do Discord
 * não deixa trocar só a imagem de um emoji já existente - só apagar e
 * criar de novo (o que gera um ID novo). Se isso rodasse sem
 * critério a cada restart, todo boot criaria emojis novos à toa (o
 * bot reinicia com frequência: deploy, PM2, queda de conexão), e
 * ainda arriscaria rate limit da API sem necessidade nenhuma.
 *
 * Em vez disso: cada entrada de data/character-emojis.json guarda,
 * além do id/name do emoji, um hash SHA-256 do arquivo do ícone no
 * momento em que ele foi enviado. No boot, comparamos esse hash com o
 * hash atual do arquivo em data/icons/ - só ícones cujo hash mudou
 * (ou que nunca foram enviados) disparam uma chamada à API.
 *
 * EXTRA: se o ID guardado no JSON não existir mais na application
 * (bot recriado, token trocado, emoji apagado manualmente), o mapping
 * é invalidado e o ícone é reenviado. Sem isso o bot emite <:name:id>
 * que o Discord renderiza como texto :name:.
 *
 * Nunca lança erro pra fora - uma falha aqui (rate limit, rede
 * instável, etc) é logada e o bot continua subindo normalmente.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { invalidateEmojiCache } = require('./characterEmojis.js');

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const MAPPING_PATH = path.join(__dirname, '..', '..', 'data', 'character-emojis.json');

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
  if (!fs.existsSync(MAPPING_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveMapping(mapping) {
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch current application emoji IDs (string set).
 * Returns null on failure so we skip the verify pass.
 */
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
 * Roda a sincronização. Chamado a partir do evento ready, com o
 * client já logado (client.application disponível).
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

    // ID no JSON que não existe mais na application → força reupload
    const idMissing =
      liveIds &&
      existing?.id &&
      !liveIds.has(String(existing.id));

    if (existing && existing.hash === hash && !idMissing) {
      continue;
    }

    if (idMissing) staleCount++;
    pending.push({ card, iconPath, hash, existing, idMissing: Boolean(idMissing) });
  }

  if (pending.length === 0) {
    logger.info('emojiSync: todos os ícones de emoji já estão sincronizados, nenhuma chamada à API necessária.');
    return;
  }

  logger.info(
    `emojiSync: ${pending.length} ícone(s) a sincronizar` +
      (staleCount ? ` (${staleCount} ID(s) stale / :name:)` : '') +
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
            `emojiSync: não consegui apagar o emoji antigo de ${card.name} (${existing.id}), tentando enviar mesmo assim`,
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
        `emojiSync: ${card.name} -> emoji "${created.name}" atualizado (${(resizedBuffer.length / 1024).toFixed(1)}KB)` +
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

module.exports = { syncCharacterEmojis };

/**
 * Script de uso único (ou toda vez que os personagens mudarem): pega
 * os ícones de data/icons/, redimensiona pra um tamanho adequado a
 * emoji, e sobe cada um como um Application Emoji do próprio bot
 * (funciona em qualquer servidor onde ele estiver, sem gastar slot de
 * emoji de nenhum servidor específico).
 *
 * PRECISA DE REDE REAL E DO TOKEN REAL DO BOT (.env) - não roda em
 * sandbox de teste. Rode com:
 *
 *   node tools/upload-character-emojis.js
 *
 * É seguro rodar de novo no futuro (ex: depois de adicionar um
 * personagem novo) - cartas que já têm emoji cadastrado no
 * data/character-emojis.json são puladas automaticamente, só as
 * novas são enviadas.
 *
 * FORÇAR ATUALIZAÇÃO de um emoji que já existe (ex: a arte do ícone
 * mudou, como o caso do Shidou): a API do Discord não deixa trocar só
 * a imagem de um emoji já criado, então a única forma é apagar o
 * antigo e subir de novo (o que gera um ID novo, atualizado
 * automaticamente no character-emojis.json). Use a flag --force com
 * os IDs das cartas (separados por vírgula), ou --force=all pra
 * forçar todo mundo:
 *
 *   node tools/upload-character-emojis.js --force=4
 *   node tools/upload-character-emojis.js --force=4,6,11
 *   node tools/upload-character-emojis.js --force=all
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { REST, Routes } = require('discord.js');
const config = require('../src/config/config.js');

const ICONS_DIR = path.join(__dirname, '..', 'data', 'icons');
const MAPPING_PATH = path.join(__dirname, '..', 'data', 'character-emojis.json');

// Discord: emoji de aplicação precisa ser <= 256KB. Redimensionamos
// pra 128x128 (bem acima do tamanho que qualquer cliente Discord
// realmente exibe um emoji) - a essa resolução, um PNG com fundo
// transparente fica bem abaixo do limite, mesmo pra desenhos com
// bastante detalhe/textura.
const EMOJI_SIZE = 128;
const MAX_EMOJI_BYTES = 256 * 1024;

// Discord só aceita [a-zA-Z0-9_] no nome do emoji, entre 2 e 32
// caracteres. Convertemos "Isagi Yoichi" -> "isagi_yoichi".
function toEmojiName(cardName) {
  const slug = cardName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acento, se houver
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug.slice(0, 32).padEnd(2, '_');
}

/**
 * Redimensiona um ícone pra um buffer PNG pequeno o suficiente pra
 * virar emoji, mantendo a transparência (fundo já removido) e o
 * aspecto (contain, sem esticar/distorcer o personagem).
 * @param {string} iconPath
 * @returns {Promise<Buffer>}
 */
async function resizeForEmoji(iconPath) {
  const buffer = await sharp(iconPath)
    .resize(EMOJI_SIZE, EMOJI_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (buffer.length > MAX_EMOJI_BYTES) {
    // Não deveria acontecer em 128x128, mas por segurança: se algum
    // ícone específico ainda estourar o limite, avisa claramente em
    // vez de deixar o upload falhar com um erro genérico da API.
    throw new Error(
      `Icon still too large after resize: ${(buffer.length / 1024).toFixed(0)}KB ` +
      `(limit: ${MAX_EMOJI_BYTES / 1024}KB) - ${iconPath}`
    );
  }

  return buffer;
}

function loadExistingMapping() {
  if (!fs.existsSync(MAPPING_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Hash SHA-256 do conteúdo do arquivo do ícone. Salvo junto no
 * mapeamento pra que o bot (src/services/emojiSync.js), ao iniciar,
 * saiba se um ícone já enviado por este script mudou ou não - sem
 * isso, um upload manual feito por aqui seria "invisível" pro
 * detector de mudanças automático, e o próximo boot do bot reenviaria
 * o mesmo ícone de novo à toa.
 * @param {string} filePath
 * @returns {string}
 */
function hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Lê a flag --force da linha de comando e devolve um Set com os IDs
 * (como string) das cartas que devem ser reenviadas mesmo já tendo
 * emoji cadastrado. Também aceita --force=all pra forçar todas.
 * Sem a flag, devolve um Set vazio (comportamento normal: só as
 * cartas sem emoji ainda são enviadas).
 * @returns {{ forceAll: boolean, forceIds: Set<string> }}
 */
function parseForceFlag() {
  const arg = process.argv.find(a => a.startsWith('--force'));
  if (!arg) return { forceAll: false, forceIds: new Set() };

  const value = arg.includes('=') ? arg.split('=')[1] : '';
  if (value.trim().toLowerCase() === 'all') {
    return { forceAll: true, forceIds: new Set() };
  }

  const ids = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    console.error('❌ --force precisa de um valor: --force=<id,id,...> ou --force=all');
    process.exit(1);
  }

  return { forceAll: false, forceIds: new Set(ids) };
}

async function main() {
  if (!config.TOKEN) {
    console.error('❌ DISCORD_TOKEN não encontrado no .env - não dá pra continuar sem ele.');
    process.exit(1);
  }

  const { forceAll, forceIds } = parseForceFlag();

  const cards = JSON.parse(fs.readFileSync(config.PATHS.CARDS, 'utf8'));
  const mapping = loadExistingMapping();

  const rest = new REST({ version: '10' }).setToken(config.TOKEN);

  console.log('🔍 Buscando informações da aplicação (bot)...');
  const application = await rest.get(Routes.currentApplication());
  console.log(`✅ Aplicação encontrada: ${application.name} (${application.id})`);

  if (forceAll) {
    console.log('⚠️  --force=all: TODOS os emojis já cadastrados serão apagados e reenviados.\n');
  } else if (forceIds.size > 0) {
    console.log(`⚠️  --force: cartas ${[...forceIds].join(', ')} serão apagadas e reenviadas mesmo já tendo emoji.\n`);
  }

  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of cards) {
    if (!card.icon) {
      console.log(`⚠️  ${card.name}: sem campo "icon" no cards.json, pulando.`);
      continue;
    }

    const existing = mapping[String(card.id)];
    const isForced = forceAll || forceIds.has(String(card.id));

    if (existing && !isForced) {
      console.log(`⏭️  ${card.name}: já tem emoji cadastrado (${existing.id}), pulando.`);
      skipped++;
      continue;
    }

    if (existing && isForced) {
      // A API do Discord não permite trocar a imagem de um emoji já
      // existente - só dá pra apagar e criar de novo (o novo emoji
      // sempre vem com um ID diferente do antigo).
      try {
        console.log(`🗑️  ${card.name}: apagando emoji antigo (${existing.id}) pra poder reenviar a imagem nova...`);
        await rest.delete(Routes.applicationEmoji(application.id, existing.id));
        delete mapping[String(card.id)];
        await sleep(1200);
      } catch (error) {
        const detail = error.rawError?.message || error.message;
        console.error(`❌ ${card.name}: falha ao apagar emoji antigo - ${detail}`);
        failed++;
        continue;
      }
    }

    const iconPath = path.join(ICONS_DIR, card.icon);
    if (!fs.existsSync(iconPath)) {
      console.error(`❌ ${card.name}: arquivo de ícone não encontrado em ${iconPath}, pulando.`);
      failed++;
      continue;
    }

    try {
      const resizedBuffer = await resizeForEmoji(iconPath);
      const emojiName = toEmojiName(card.name);
      const dataUri = `data:image/png;base64,${resizedBuffer.toString('base64')}`;

      console.log(`⬆️  Enviando "${card.name}" como emoji "${emojiName}" (${(resizedBuffer.length / 1024).toFixed(1)}KB)...`);

      const created = await rest.post(Routes.applicationEmojis(application.id), {
        body: { name: emojiName, image: dataUri }
      });

      mapping[String(card.id)] = { id: created.id, name: created.name, hash: hashFile(iconPath) };
      if (existing && isForced) {
        updated++;
      } else {
        uploaded++;
      }

      // Salva o progresso a cada emoji enviado (não só no final) - se
      // o script for interrompido no meio (ex: rate limit, queda de
      // rede), o que já subiu não se perde e não precisa ser reenviado
      // na próxima tentativa.
      fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2));

      // Pequena pausa entre uploads pra não estourar rate limit da API
      // do Discord (não é estritamente necessário pra só 13 emojis,
      // mas é um hábito seguro caso o roster cresça no futuro).
      await sleep(1200);
    } catch (error) {
      const detail = error.rawError?.message || error.message;
      console.error(`❌ ${card.name}: falha ao enviar - ${detail}`);
      failed++;
    }
  }

  console.log('\n📊 Resumo:');
  console.log(`   ✅ Enviados agora (novos): ${uploaded}`);
  console.log(`   🔄 Atualizados (apagados e reenviados): ${updated}`);
  console.log(`   ⏭️  Já existiam (pulados): ${skipped}`);
  console.log(`   ❌ Falharam: ${failed}`);
  console.log(`\n💾 Mapeamento salvo em: ${MAPPING_PATH}`);

  if (failed > 0) {
    console.log('\n⚠️  Alguns personagens falharam - rode o script de novo depois de corrigir (ele pula os que já deram certo).');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Erro inesperado:', error);
  process.exit(1);
});

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { RARITIES, RARITY_ORDER } = require('../services/rarities.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { emojiTag, safeTruncate } = require('../utils/format.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const { getSquadLines } = require('../utils/squadLines.js');
const { getCoachId } = require('../services/coachStore.js');
const { getFormationForCoach } = require('../services/formations.js');
const { formatPassiveShort } = require('../services/coachPassives.js');
const { getStaffTitles } = require('../services/staff.js');
const { getPlayerRank } = require('../services/playerRank.js');
const { openDestination } = require('../utils/nav.js');
const { whoNeedsXpLines, recentPullsLines } = require('../utils/qolText.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');

/**
 * /profile — padrão discord-bot-ui (clareza · densidade · fluxo)
 *
 * Zonas (como dashboards de bots top):
 * 1. Identidade   — quem é
 * 2. Números      — o que importa agora (1 bloco)
 * 3. Atalhos      — coleção / time com CTA colado
 * 4. Apoio        — raridades (compacto)
 * 5. Mídia        — até 3 cartas
 * 6. Ações        — sempre no mesmo lugar
 *
 * Detalhes (2ª tela) = campo + XP + pulls (não polui a principal)
 * UI 100% PT-BR
 */

const PREFIX = 'profile';
const ICONS = path.join(__dirname, '..', '..', 'data', 'icons');

const RANK_PT = {
  ROOKIE: 'Novato',
  PROSPECT: 'Promessa',
  REGULAR: 'Regular',
  ELITE: 'Elite',
  ACE: 'Ás',
  LEGEND: 'Lenda'
};

const RARITY_PT = {
  LOCKED: 'Locked',
  EGOISTA: 'Egoísta',
  NEW_GEN: 'New Gen'
};

function accent() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function bar(cur, max, len = 10) {
  if (max <= 0) return '░'.repeat(len);
  const f = Math.round(Math.max(0, Math.min(1, cur / max)) * len);
  return '█'.repeat(f) + '░'.repeat(len - f);
}

function btn(id, label, style, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function sep() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function text(s) {
  return new TextDisplayBuilder().setContent(String(s ?? ''));
}

/* ── dados ──────────────────────────────────────────────── */
function loadData(targetUser, viewerId) {
  const userId = targetUser.id;
  const username = targetUser.username;
  const displayName = targetUser.globalName || targetUser.displayName || username;
  const isSelf = userId === viewerId;
  const avatarURL = targetUser.displayAvatarURL({ size: 256, extension: 'png' });

  DataService.ensureUser(userId, username);

  const cards = DataService.loadCards();
  const userCards = DataService.getValidUserCards(userId, cards);
  const iene = DataService.getIene(userId);
  const teamRows = DataService.getTeam(userId);
  const lines = getSquadLines(userId);
  const coachId = getCoachId(userId);
  const formation = getFormationForCoach(coachId);
  const coachCard = coachId != null ? cards.find(c => c.id === coachId) : null;
  const masterPassive = formatPassiveShort(userId);

  const poolSize = cards.length;
  const owned = userCards.length;
  const remaining = Math.max(0, poolSize - owned);
  const binderPct = poolSize > 0 ? Math.round((owned / poolSize) * 100) : 0;
  const fullBinder = poolSize > 0 && owned === poolSize;
  const fullTeam = teamRows.length === 11;

  let avgLevel = 0;
  if (teamRows.length > 0) {
    avgLevel = Math.round(teamRows.reduce((s, r) => s + (r.level || 0), 0) / teamRows.length);
  }

  const staffTitles = getStaffTitles(userId);
  const playerRank = getPlayerRank({
    owned,
    poolSize,
    teamAvgLevel: avgLevel,
    teamSize: teamRows.length
  });

  return {
    userId,
    username,
    displayName,
    isSelf,
    avatarURL,
    cards,
    userCards,
    iene,
    teamRows,
    lines,
    coachCard,
    formation,
    masterPassive,
    poolSize,
    owned,
    remaining,
    binderPct,
    fullBinder,
    fullTeam,
    avgLevel,
    staffTitles,
    playerRank,
    rankName: RANK_PT[playerRank.key] || playerRank.key,
    nextRankName: playerRank.next ? (RANK_PT[playerRank.next.key] || playerRank.next.key) : null
  };
}

function cardOf(uc, cards) {
  return cards.find(c => c.id === uc.id) || null;
}

function tierLines(d) {
  const lines = RARITY_ORDER.map(key => {
    const total = d.cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (!total) return null;
    const have = d.userCards.filter(uc => {
      const c = cardOf(uc, d.cards);
      return c && c.position !== 'CO' && c.rarity === key;
    }).length;
    const em = RARITIES[key]?.emoji || '·';
    return `${em} **${RARITY_PT[key] || key}**  ${bar(have, total, 8)}  \`${have}/${total}\``;
  }).filter(Boolean);

  const coachTotal = d.cards.filter(c => c.position === 'CO').length;
  if (coachTotal) {
    const have = d.userCards.filter(uc => cardOf(uc, d.cards)?.position === 'CO').length;
    lines.push(`🎩 **Masters**  ${bar(have, coachTotal, 8)}  \`${have}/${coachTotal}\``);
  }
  return lines;
}

function buildGallery(d) {
  const picks = [];
  const seen = new Set();
  for (const row of d.teamRows) {
    const card = d.cards.find(c => c.id === row.cardId);
    if (!card?.icon || seen.has(card.id)) continue;
    picks.push(card);
    seen.add(card.id);
    if (picks.length >= 3) break;
  }
  if (picks.length < 3) {
    for (const uc of d.userCards) {
      const card = cardOf(uc, d.cards);
      if (!card?.icon || seen.has(card.id)) continue;
      picks.push(card);
      seen.add(card.id);
      if (picks.length >= 3) break;
    }
  }

  const files = [];
  const gallery = new MediaGalleryBuilder();
  for (const card of picks) {
    const full = path.join(ICONS, card.icon);
    if (!fs.existsSync(full)) continue;
    const name = `perfil_${card.id}.png`;
    files.push(new AttachmentBuilder(full, { name }));
    gallery.addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription(card.name)
    );
  }
  return { gallery: files.length ? gallery : null, files };
}

/* ── zonas de UI ────────────────────────────────────────── */

/** 1. Identidade */
function zoneIdentity(d) {
  const badges = [];
  for (const s of d.staffTitles) badges.push(`${s.emoji} ${s.label}`);
  badges.push(`${d.playerRank.emoji} **${d.rankName}**`);
  if (d.fullBinder) badges.push('Binder completo');
  if (d.fullTeam) badges.push('Onze pronto');

  const sub = d.isSelf
    ? `-# @${d.username} · seu perfil`
    : `-# @${d.username} · perfil consultado`;

  return new SectionBuilder()
    .addTextDisplayComponents(
      text(`# ${d.displayName}`),
      text(sub),
      text(safeTruncate(badges.join(' · '), 700))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(d.avatarURL).setDescription(d.displayName)
    );
}

/** 2. Números — um bloco só, escaneável */
function zoneNumbers(d) {
  const iene = Number(d.iene || 0).toLocaleString('pt-BR');
  const rankLine = d.nextRankName
    ? `**${d.rankName}** → **${d.nextRankName}**  ·  \`${d.playerRank.progressToNext}%\`\n${bar(d.playerRank.progressToNext, 100, 12)}`
    : `**${d.rankName}**  ·  rank máximo`;

  return [
    `## Resumo`,
    rankLine,
    '',
    `💰 \`${iene}\` Iene    ·    👕 \`${d.teamRows.length}/11\`    ·    📊 \`Lv.${d.avgLevel || 0}\``,
    `📔 \`${d.owned}/${d.poolSize}\` binder \`(${d.binderPct}%)\`` +
      (d.remaining > 0 ? `  ·  faltam \`${d.remaining}\`` : '  ·  **completo**'),
    `📐 **${d.formation.label}**  ·  Master: ${d.coachCard ? `**${d.coachCard.name}**` : '*nenhum*'}`
  ].join('\n');
}

/** 3. Atalhos com CTA colado no dado */
function zoneCollection(d, viewerId) {
  const body = d.owned === 0
    ? '_Binder vazio._\n-# Recrute no Banner para começar.'
    : `**${d.owned}/${d.poolSize}**  ${bar(d.owned, d.poolSize, 10)}\n-# ${d.remaining > 0 ? `Faltam **${d.remaining}**` : 'Coleção fechada.'}`;

  return new SectionBuilder()
    .addTextDisplayComponents(
      text('### Coleção'),
      text(body)
    )
    .setButtonAccessory(
      btn(`${PREFIX}:${viewerId}:goto:collection`, 'Binder', ButtonStyle.Primary)
    );
}

function zoneTeam(d, viewerId) {
  let body;
  if (d.teamRows.length === 0) {
    body = '_Campo vazio._\n-# Monte o onze para ganhar XP.';
  } else {
    body =
      `**${d.teamRows.length}/11**  ·  média **Lv.${d.avgLevel || 0}**\n` +
      `**${d.formation.label}**` +
      (d.coachCard ? `  ·  **${d.coachCard.name}**` : '') +
      (d.masterPassive ? `\n-# ${d.masterPassive}` : '');
  }

  return new SectionBuilder()
    .addTextDisplayComponents(
      text('### Time'),
      text(body)
    )
    .setButtonAccessory(
      btn(`${PREFIX}:${viewerId}:goto:team`, 'Time', ButtonStyle.Primary)
    );
}

/** 4. Raridades — compacto */
function zoneTiers(d) {
  const lines = tierLines(d);
  if (!lines.length) return '### Progressão\n—';
  return `### Progressão\n${lines.join('\n')}`;
}

/* ── montagem ───────────────────────────────────────────── */

function buildMain(d, viewerId) {
  const { gallery, files } = buildGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.fullBinder ? 0x57f287 : accent())
    .addSectionComponents(zoneIdentity(d))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(safeTruncate(zoneNumbers(d), 1600)))
    .addSeparatorComponents(sep())
    .addSectionComponents(zoneCollection(d, viewerId), zoneTeam(d, viewerId))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(safeTruncate(zoneTiers(d), 1200)));

  if (gallery) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(text('### Destaques'))
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text('-# Goal Bound'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...[
          btn(`${PREFIX}:${viewerId}:details`, 'Detalhes', ButtonStyle.Secondary),
          btn(`${PREFIX}:${viewerId}:goto:banners`, 'Banner', ButtonStyle.Secondary),
          btn(`${PREFIX}:${viewerId}:goto:daily`, 'Daily', ButtonStyle.Secondary),
          d.isSelf ? btn(`${PREFIX}:${viewerId}:share`, 'Compartilhar', ButtonStyle.Success) : null
        ].filter(Boolean).slice(0, 5)
      )
    );

  return { container, files };
}

function buildDetails(d, viewerId) {
  const bySlot = new Map(d.teamRows.map(r => [r.slot, r]));
  const pitch = d.teamRows.length
    ? d.lines.map(line => {
        const cells = line.slots.map(slot => {
          const e = bySlot.get(slot);
          return e ? `${emojiTag(getEmojiForCard(e.cardId)) || '•'} \`${e.level}\`` : '⬜';
        }).join(' ');
        return `**${line.name}**  ${cells}`;
      }).join('\n')
    : '_Ninguém em campo._ Use **Time** para escalar.';

  const xp = whoNeedsXpLines(d.userId, d.teamRows, 5) || 'Ninguém no onze precisa de XP agora.';
  const pulls = recentPullsLines(d.userId, 5) || 'Nenhum pull recente.';
  const { gallery, files } = buildGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.fullBinder ? 0x57f287 : accent())
    .addSectionComponents(zoneIdentity(d))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(`## Campo\n${safeTruncate(pitch, 1400)}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(text(safeTruncate(zoneTiers(d).replace('###', '##'), 1200)))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`## Quem precisa de XP\n${safeTruncate(xp, 900)}`),
      text(`## Últimos pulls\n${safeTruncate(pulls, 900)}`)
    );

  if (gallery) {
    container
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(text('## Cartas do onze'))
      .addMediaGalleryComponents(gallery);
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      btn(`${PREFIX}:${viewerId}:main`, 'Voltar', ButtonStyle.Primary),
      btn(`${PREFIX}:${viewerId}:goto:collection`, 'Binder', ButtonStyle.Secondary),
      btn(`${PREFIX}:${viewerId}:goto:team`, 'Time', ButtonStyle.Secondary)
    )
  );

  return { container, files };
}

function buildProfilePayload(targetUser, viewerId, view = 'main') {
  const d = loadData(targetUser, viewerId);
  return view === 'details' ? buildDetails(d, viewerId) : buildMain(d, viewerId);
}

async function sendBuilt(interaction, built, edit = false) {
  const payload = {
    components: [built.container],
    flags: MessageFlags.IsComponentsV2,
    files: built.files || []
  };
  if (edit || interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function openProfilePanel(interaction, userId, targetUser) {
  const built = buildProfilePayload(targetUser, userId, 'main');
  try {
    await sendBuilt(interaction, built, true);
  } catch (error) {
    logger.error('Erro ao abrir perfil', error.message);
    await interaction.followUp({
      components: [built.container],
      flags: MessageFlags.IsComponentsV2 | 64,
      files: built.files || []
    });
  }
}

module.exports = {
  buildProfilePayload,
  openProfilePanel,

  data: withPtBr(
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Mostra seu perfil — rank, iene, time, binder e progressao')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('Ver o perfil de outra pessoa').setRequired(false),
          'Ver o perfil de outra pessoa'
        )
      ),
    'Mostra seu perfil — rank, iene, time, binder e progressao'
  ),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Conta automática', 'Escolha uma pessoa para ver o perfil.')],
          flags: 64
        });
        return;
      }
      await sendBuilt(interaction, buildProfilePayload(target, interaction.user.id, 'main'));
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Erro no /profile', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', 'Não deu pra carregar o perfil.')],
            flags: 64
          });
        }
      } catch { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', 'Não é seu painel', 'Abra o seu com **/profile**.')],
        flags: 64
      });
      return;
    }

    if (action === 'details' || action === 'main') {
      await interaction.deferUpdate();
      await sendBuilt(
        interaction,
        buildProfilePayload(interaction.user, ownerId, action === 'details' ? 'details' : 'main'),
        true
      );
      return;
    }

    if (action === 'share') {
      await interaction.deferUpdate();
      const built = buildProfilePayload(interaction.user, ownerId, 'main');
      try {
        if (interaction.channel?.send) {
          await interaction.channel.send({
            components: [built.container],
            flags: MessageFlags.IsComponentsV2,
            files: built.files || [],
            allowedMentions: { parse: [] }
          });
        } else {
          await interaction.followUp({
            components: [built.container],
            flags: MessageFlags.IsComponentsV2,
            files: built.files || []
          });
        }
      } catch (error) {
        logger.error('Erro ao compartilhar perfil', error.message);
        try {
          await interaction.followUp({
            embeds: [buildStatusEmbed('ERROR', 'Não deu pra compartilhar neste canal.')],
            flags: 64
          });
        } catch { /* ignore */ }
      }
      return;
    }

    if (action === 'goto') {
      await openDestination(interaction, dest, ownerId);
    }
  }
};

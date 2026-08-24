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
const { progressBar, emojiTag, safeTruncate } = require('../utils/format.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const { getSquadLines } = require('../utils/squadLines.js');
const { getCoachId } = require('../services/coachStore.js');
const { getFormationForCoach } = require('../services/formations.js');
const { formatPassiveShort } = require('../services/coachPassives.js');
const { getStaffTitles } = require('../services/staff.js');
const { getPlayerRank } = require('../services/playerRank.js');
const { openDestination } = require('../utils/nav.js');
const { rankLabel, rarityLabel } = require('../utils/i18n.js');
const { whoNeedsXpLines, recentPullsLines } = require('../utils/qolText.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');

const CUSTOM_ID_PREFIX = 'profile';
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');

function accentInt() {
  const hex = String((config.COLORS && config.COLORS.PRIMARY) || '#1687FF').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0x1687ff;
}

function miniBar(current, total, length = 8) {
  if (total <= 0) return '░'.repeat(length);
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function loadProfileData(targetUser, viewerId) {
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
  const coachEmoji = coachCard ? emojiTag(getEmojiForCard(coachCard.id)) : '';
  const masterPassive = formatPassiveShort(userId);

  const poolSize = cards.length;
  const owned = userCards.length;
  const remaining = Math.max(0, poolSize - owned);
  const binderPct = poolSize > 0 ? Math.round((owned / poolSize) * 100) : 0;
  const isCollectionComplete = poolSize > 0 && owned === poolSize;
  const isTeamComplete = teamRows.length === 11;

  let avgLevel = 0;
  if (teamRows.length > 0) {
    avgLevel = Math.round(teamRows.reduce((sum, row) => sum + (row.level || 0), 0) / teamRows.length);
  }

  const staffTitles = getStaffTitles(userId);
  const playerRank = getPlayerRank({
    owned,
    poolSize,
    teamAvgLevel: avgLevel,
    teamSize: teamRows.length
  });
  const rankName = rankLabel(viewerId, playerRank.key);
  const nextRankName = playerRank.next ? rankLabel(viewerId, playerRank.next.key) : null;

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
    coachId,
    formation,
    coachCard,
    coachEmoji,
    masterPassive,
    poolSize,
    owned,
    remaining,
    binderPct,
    isCollectionComplete,
    isTeamComplete,
    avgLevel,
    staffTitles,
    playerRank,
    rankName,
    nextRankName
  };
}

function button(id, label, style, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function cardFromUserCard(userCard, cards) {
  return cards.find(card => card.id === userCard.id) || null;
}

function buildCardGallery(d) {
  const candidates = [];
  const used = new Set();

  for (const row of d.teamRows) {
    const card = d.cards.find(c => c.id === row.cardId);
    if (!card || !card.icon || used.has(card.id)) continue;
    candidates.push(card);
    used.add(card.id);
    if (candidates.length >= 3) break;
  }

  if (candidates.length < 3) {
    for (const userCard of d.userCards) {
      const card = cardFromUserCard(userCard, d.cards);
      if (!card || !card.icon || used.has(card.id)) continue;
      candidates.push(card);
      used.add(card.id);
      if (candidates.length >= 3) break;
    }
  }

  const files = [];
  const gallery = new MediaGalleryBuilder();

  for (const card of candidates) {
    const fullPath = path.join(ICONS_DIR, card.icon);
    if (!fs.existsSync(fullPath)) continue;

    const filename = `profile_card_${card.id}.png`;
    files.push(new AttachmentBuilder(fullPath, { name: filename }));
    gallery.addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${filename}`)
        .setDescription(`${card.name} · ${rarityLabel(d.userId, card.rarity || 'LOCKED')}`)
    );
  }

  return { gallery: files.length ? gallery : null, files };
}

function buildHeaderSection(d) {
  const badges = [];
  for (const title of d.staffTitles) badges.push(`${title.emoji} **${title.label}**`);
  badges.push(`${d.playerRank.emoji} **${d.rankName}**`);
  if (d.isCollectionComplete) badges.push('🏁 **Coleção completa**');
  if (d.isTeamComplete) badges.push('✅ **Onze completo**');

  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${d.displayName}`),
      new TextDisplayBuilder().setContent(`-# @${d.username}${d.isSelf ? ' · seu perfil' : ' · perfil consultado'}`),
      new TextDisplayBuilder().setContent(safeTruncate(badges.join('  ·  '), 900))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(d.avatarURL)
        .setDescription(`Avatar de ${d.displayName}`)
    );
}

function buildMainView(d, viewerId) {
  const overview = [
    '## VISÃO GERAL',
    `**Rank:** ${d.rankName}${d.playerRank.next ? ` · próximo **${d.nextRankName}** · \`${d.playerRank.progressToNext}%\`` : ' · **máximo alcançado**'}`,
    `**Iene:** \`${d.iene.toLocaleString('pt-BR')}\`  ·  **Onze:** **${d.teamRows.length}/11**  ·  **Média:** **${d.avgLevel || 0}**`,
    `**Binder:** **${d.owned}/${d.poolSize}** · \`${d.binderPct}%\` ${d.remaining > 0 ? `· faltam \`${d.remaining}\`` : '· **completo**'}`,
    `**Formação:** **${d.formation.label}**  ·  **Master:** ${d.coachCard ? `**${d.coachCard.name}**` : '*não definido*'}`
  ].join('\n');

  const rankSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### RANK & PROGRESSO'),
      new TextDisplayBuilder().setContent(
        `**${d.rankName}**\n${d.playerRank.next ? `Próximo: **${d.nextRankName}** · \`${d.playerRank.progressToNext}%\`` : 'Você atingiu o limite atual de rank.'}\n\n${miniBar(d.playerRank.progressToNext, 100, 12)}`
      )
    )
    .setSecondaryButtonAccessory(
      button(`${CUSTOM_ID_PREFIX}:${viewerId}:details`, 'Detalhes', ButtonStyle.Secondary)
    );

  const collectionSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### COLEÇÃO'),
      new TextDisplayBuilder().setContent(
        `**${d.owned}/${d.poolSize}** cartas · **${d.binderPct}%**\n${miniBar(d.owned, d.poolSize, 12)}\n-# ${d.remaining > 0 ? `Faltam **${d.remaining}** para fechar o binder.` : 'Binder completo.'}`
      )
    )
    .setPrimaryButtonAccessory(
      button(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:collection`, 'Abrir coleção', ButtonStyle.Primary)
    );

  const teamSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### ONZE DA ARENA'),
      new TextDisplayBuilder().setContent(
        `**${d.teamRows.length}/11** jogadores · média **${d.avgLevel || 0}**\n**Formação:** ${d.formation.label}\n**Master:** ${d.coachCard ? d.coachCard.name : 'não definido'}${d.masterPassive ? `\n-# ${d.masterPassive}` : ''}`
      )
    )
    .setPrimaryButtonAccessory(
      button(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:team`, 'Abrir onze', ButtonStyle.Primary)
    );

  const { gallery, files } = buildCardGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.isCollectionComplete ? 0x57f287 : accentInt())
    .addSectionComponents(buildHeaderSection(d))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(overview, 1800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(rankSection, collectionSection, teamSection);

  if (gallery) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### CARTAS EM DESTAQUE'))
      .addMediaGalleryComponents(gallery);
  }

  const recent = recentPullsLines(d.userId, 3) || 'Nenhum pull recente registrado.';
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ÚLTIMAS AÇÕES\n${safeTruncate(recent, 900)}`),
      new TextDisplayBuilder().setContent('-# Atalhos: `/collection` · `/team` · `/banners` · `/daily`')
    );

  if (d.isSelf) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('**COMPARTILHAR PERFIL**'),
          new TextDisplayBuilder().setContent('-# Gere uma cópia visual deste painel para mostrar no servidor.')
        )
        .setSuccessButtonAccessory(
          button(`${CUSTOM_ID_PREFIX}:${viewerId}:share`, 'Compartilhar', ButtonStyle.Success)
        )
    );
  }

  return { container, files };
}

function buildDetailsView(d, viewerId) {
  const teamBySlot = new Map(d.teamRows.map(row => [row.slot, row]));
  const pitch = d.teamRows.length
    ? d.lines.map(line => {
        const cells = line.slots.map(slot => {
          const entry = teamBySlot.get(slot);
          return entry ? `${emojiTag(getEmojiForCard(entry.cardId)) || '👤'} \`${entry.level}\`` : '⬜';
        }).join(' ');
        return `**${line.name}** ${cells}`;
      }).join('\n')
    : '*A escalação ainda está vazia.*';

  const tierLines = RARITY_ORDER.map(key => {
    const total = d.cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (!total) return null;
    const owned = d.userCards.filter(uc => {
      const card = cardFromUserCard(uc, d.cards);
      return card && card.position !== 'CO' && card.rarity === key;
    }).length;
    return `**${rarityLabel(viewerId, key)}** · ${miniBar(owned, total, 8)} **${owned}/${total}**`;
  }).filter(Boolean);

  const coachTotal = d.cards.filter(c => c.position === 'CO').length;
  if (coachTotal) {
    const coachOwned = d.userCards.filter(uc => cardFromUserCard(uc, d.cards)?.position === 'CO').length;
    tierLines.push(`**Masters** · ${miniBar(coachOwned, coachTotal, 8)} **${coachOwned}/${coachTotal}**`);
  }

  const xp = whoNeedsXpLines(d.userId, d.teamRows, 4) || 'Nenhum jogador precisa de XP no momento.';
  const recent = recentPullsLines(d.userId, 5) || 'Nenhum pull recente registrado.';
  const { gallery, files } = buildCardGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.isCollectionComplete ? 0x57f287 : accentInt())
    .addSectionComponents(buildHeaderSection(d))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## CAMPO\n${safeTruncate(pitch, 1500)}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## PROGRESSÃO\n${tierLines.join('\n') || '—'}\n\n**Binder:** ${progressBar(d.owned, d.poolSize, 12)} **${d.binderPct}%**`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## SUBIR DE NÍVEL\n${safeTruncate(xp, 1100)}`));

  if (gallery) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## CARTAS DO ONZE'))
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ÚLTIMOS PULLS\n${safeTruncate(recent, 1200)}`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button(`${CUSTOM_ID_PREFIX}:${viewerId}:main`, 'Voltar', ButtonStyle.Primary),
        button(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:collection`, 'Coleção', ButtonStyle.Secondary),
        button(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:team`, 'Onze', ButtonStyle.Secondary)
      )
    );

  return { container, files };
}

function buildProfilePayload(targetUser, viewerId, view = 'main') {
  const d = loadProfileData(targetUser, viewerId);
  return view === 'details' ? buildDetailsView(d, viewerId) : buildMainView(d, viewerId);
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
    logger.error('Erro ao abrir painel de perfil', error.message);
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
      .setDescription('Exibe o perfil completo do jogador com rank, iene, onze, coleção e progressão.')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('Escolha a pessoa cujo perfil deseja consultar.').setRequired(false),
          'Escolha a pessoa cujo perfil deseja consultar.'
        )
      ),
    'Exibe o perfil completo do jogador com rank, iene, onze, coleção e progressão.'
  ),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Contas automáticas não jogam', 'Escolha uma pessoa para consultar o perfil.')],
          flags: 64
        });
        return;
      }
      const built = buildProfilePayload(target, interaction.user.id, 'main');
      await sendBuilt(interaction, built);
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Erro no comando /profile', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', 'Não foi possível carregar o perfil.')],
            flags: 64
          });
        }
      } catch {}
    }
  },

  async handleComponent(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', 'Painel de outra pessoa', 'Abra o seu perfil com **/profile**.')],
        flags: 64
      });
      return;
    }

    if (action === 'details' || action === 'main') {
      await interaction.deferUpdate();
      const built = buildProfilePayload(interaction.user, ownerId, action === 'details' ? 'details' : 'main');
      await sendBuilt(interaction, built, true);
      return;
    }

    if (action === 'share') {
      const built = buildProfilePayload(interaction.user, ownerId, 'main');
      await sendBuilt(interaction, built);
      return;
    }

    if (action === 'goto') {
      await openDestination(interaction, dest, ownerId);
    }
  }
};

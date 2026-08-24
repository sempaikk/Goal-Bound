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
  ThumbnailBuilder
} = require('discord.js');
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
const { t, rankLabel, rarityLabel } = require('../utils/i18n.js');
const {
  binderByBannerLines,
  almostCompleteLines,
  whoNeedsXpLines,
  recentPullsLines
} = require('../utils/qolText.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');

const CUSTOM_ID_PREFIX = 'profile';
const TICK = '`';

function accentInt() {
  const hex = String((config.COLORS && config.COLORS.PRIMARY) || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function miniBar(current, total, length) {
  if (length == null) length = 6;
  if (total <= 0) return '▱'.repeat(length);
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

function loadProfileData(targetUser, viewerId) {
  const userId = targetUser.id;
  const username = targetUser.username;
  const displayName = targetUser.globalName || targetUser.displayName || username;
  const isSelf = userId === viewerId;
  const avatarURL = targetUser.displayAvatarURL({ size: 256, extension: 'png' });
  const L = (key, vars) => t(viewerId, key, vars);

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
    avgLevel = Math.round(
      teamRows.reduce((sum, row) => sum + (row.level || 0), 0) / teamRows.length
    );
  }

  const staffTitles = getStaffTitles(userId);
  const playerRank = getPlayerRank({
    owned: owned,
    poolSize: poolSize,
    teamAvgLevel: avgLevel,
    teamSize: teamRows.length
  });
  const rankName = rankLabel(viewerId, playerRank.key);
  const nextRankName = playerRank.next ? rankLabel(viewerId, playerRank.next.key) : null;

  return {
    userId: userId,
    username: username,
    displayName: displayName,
    isSelf: isSelf,
    avatarURL: avatarURL,
    L: L,
    cards: cards,
    userCards: userCards,
    iene: iene,
    teamRows: teamRows,
    lines: lines,
    coachId: coachId,
    formation: formation,
    coachCard: coachCard,
    coachEmoji: coachEmoji,
    masterPassive: masterPassive,
    poolSize: poolSize,
    owned: owned,
    remaining: remaining,
    binderPct: binderPct,
    isCollectionComplete: isCollectionComplete,
    isTeamComplete: isTeamComplete,
    avgLevel: avgLevel,
    staffTitles: staffTitles,
    playerRank: playerRank,
    rankName: rankName,
    nextRankName: nextRankName
  };
}

function buildMainView(d, viewerId) {
  const badgeParts = [];
  for (const st of d.staffTitles) badgeParts.push(st.emoji + ' **' + st.label + '**');
  badgeParts.push(d.playerRank.emoji + ' **' + d.rankName + '**');
  if (d.isCollectionComplete) badgeParts.push('🏁 **' + d.L('profile_full_binder') + '**');
  if (d.isTeamComplete) badgeParts.push('✅ **' + d.L('profile_eleven_ready') + '**');

  let header =
    '# ' + (d.isCollectionComplete ? '🏁' : '🧬') + ' ' + d.displayName;
  if (d.displayName !== d.username) header += '\n' + TICK + '@' + d.username + TICK;
  if (!d.isSelf) header += '\n-# ' + d.L('profile_viewing');
  if (badgeParts.length) header += '\n' + badgeParts.join(' · ');

  const elevenBit = d.teamRows.length === 0
    ? d.L('profile_vacant')
    : '**' + d.teamRows.length + '/11**' + (d.avgLevel > 0 ? ' · média **' + d.avgLevel + '**' : '');

  const rankBit = d.playerRank.next
    ? d.rankName + ' · próximo **' + d.nextRankName + '** `' + d.playerRank.progressToNext + '%`'
    : d.rankName + ' · ' + d.L('profile_max_rank');

  const masterBit = d.coachCard
    ? (d.coachEmoji || '🎩') + ' **' + d.coachCard.name + '**'
    : d.L('profile_no_master');

  const body =
    d.playerRank.emoji + ' **Rank** · ' + rankBit + '\n' +
    '💰 **Iene** · `' + d.iene.toLocaleString('pt-BR') + '`  ·  📋 **Onze** · ' + elevenBit + '\n' +
    '📔 **Binder** · **' + d.owned + '/' + d.poolSize + '** (`' + d.binderPct + '%`)' +
    (d.remaining > 0 ? ' · faltam `' + d.remaining + '`' : ' · completo') + '\n' +
    '🏷️ **Formação** · **' + d.formation.label + '** · ' + masterBit;

  const container = new ContainerBuilder()
    .setAccentColor(d.isCollectionComplete ? 0x57f287 : accentInt());

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(header, 900)))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(d.avatarURL).setDescription(d.displayName)
      )
  );

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(body, 1200)));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':details')
      .setLabel('Detalhes')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':goto:collection')
      .setLabel(d.L('profile_btn_binder'))
      .setEmoji('📔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':goto:team')
      .setLabel(d.L('profile_btn_eleven'))
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':goto:banners')
      .setLabel(d.L('profile_btn_banner'))
      .setEmoji('🎴')
      .setStyle(ButtonStyle.Secondary)
  );

  if (d.isSelf) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':share')
        .setLabel(d.L('profile_btn_share'))
        .setEmoji('📣')
        .setStyle(ButtonStyle.Success)
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(row1);

  return container;
}

function buildDetailsView(d, viewerId) {
  let pitch;
  if (d.teamRows.length > 0) {
    const teamBySlot = new Map(d.teamRows.map(row => [row.slot, row]));
    const squadPreview = d.lines.map(line => {
      const cells = line.slots.map(slotKey => {
        const entry = teamBySlot.get(slotKey);
        if (!entry) return '⬜';
        const head = emojiTag(getEmojiForCard(entry.cardId)) || '👤';
        return head + TICK + entry.level + TICK;
      }).join(' ');
      return '**' + line.name + '** ' + cells;
    }).join('\n');
    const xp = whoNeedsXpLines(d.userId, d.teamRows, 3) || '—';
    pitch = '### ⚽ Campo\n' + safeTruncate(squadPreview, 600) + '\n\n### 📈 Subir nível\n' + xp;
  } else {
    pitch = '### ⚽ Campo\n_' + (d.isSelf ? d.L('profile_empty_pitch') : d.L('profile_no_shape')) + '_';
  }

  const tierLines = RARITY_ORDER.map(key => {
    const totalInTier = d.cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (totalInTier === 0) return null;
    const ownedInTier = d.userCards.filter(uc => {
      const card = d.cards.find(c => c.id === uc.id);
      return card && card.position !== 'CO' && card.rarity === key;
    }).length;
    return RARITIES[key].emoji + ' **' + rarityLabel(viewerId, key) + '** ' +
      miniBar(ownedInTier, totalInTier, 6) + ' **' + ownedInTier + '**/' + totalInTier;
  }).filter(Boolean);

  const coachTotal = d.cards.filter(c => c.position === 'CO').length;
  if (coachTotal > 0) {
    const coachOwned = d.userCards.filter(uc => {
      const card = d.cards.find(c => c.id === uc.id);
      return card && card.position === 'CO';
    }).length;
    tierLines.push('🎩 **' + d.L('profile_masters') + '** ' + miniBar(coachOwned, coachTotal, 6) +
      ' **' + coachOwned + '**/' + coachTotal);
  }

  const recent = recentPullsLines(d.userId, 5);
  const binderBar = progressBar(d.owned, d.poolSize, 12);

  const body =
    pitch + '\n\n' +
    '### 📔 Binder\n' + binderBar + ' **' + d.owned + '/' + d.poolSize + '**\n\n' +
    '### 🏷️ Tiers\n' + (tierLines.join('\n') || '—') + '\n\n' +
    '### 📜 Últimos pulls\n' + recent;

  const container = new ContainerBuilder()
    .setAccentColor(d.isCollectionComplete ? 0x57f287 : accentInt());

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        safeTruncate('# Detalhes · ' + d.displayName, 200)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(body, 3500)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':main')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':goto:collection')
          .setLabel(d.L('profile_btn_binder'))
          .setEmoji('📔')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CUSTOM_ID_PREFIX + ':' + viewerId + ':goto:team')
          .setLabel(d.L('profile_btn_eleven'))
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return container;
}

function buildProfilePayload(targetUser, viewerId, view) {
  if (view == null) view = 'main';
  const d = loadProfileData(targetUser, viewerId);
  const container = view === 'details' ? buildDetailsView(d, viewerId) : buildMainView(d, viewerId);
  return { container: container, isSelf: d.isSelf, view: view };
}

async function openProfilePanel(interaction, userId, targetUser) {
  const built = buildProfilePayload(targetUser, userId, 'main');
  try {
    await interaction.editReply({ components: [built.container], flags: MessageFlags.IsComponentsV2 });
  } catch (e) {
    await interaction.followUp({
      components: [built.container],
      flags: MessageFlags.IsComponentsV2 | 64
    });
  }
}

module.exports = {
  buildProfilePayload: buildProfilePayload,
  openProfilePanel: openProfilePanel,
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Card do jogador — rank, iene, onze, binder e formacao')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('De quem ver o card (padrao: voce)').setRequired(false),
          'De quem ver o card (padrao: voce)'
        )
      ),
    'Card do jogador — rank, iene, onze, binder e formacao'
  ),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Contas automaticas nao jogam', config.MESSAGES.BOTS_DONT_PLAY || 'Escolha uma pessoa.')],
          flags: 64
        });
        return;
      }
      const built = buildProfilePayload(target, interaction.user.id, 'main');
      await interaction.reply({ components: [built.container], flags: MessageFlags.IsComponentsV2 });
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /profile command', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)], flags: 64 });
        }
      } catch (e) {}
    }
  },

  async handleComponent(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', 'Painel de outra pessoa', 'Abra o seu com **/profile**.')],
        flags: 64
      });
      return;
    }

    if (action === 'details' || action === 'main') {
      await interaction.deferUpdate();
      try {
        const built = buildProfilePayload(interaction.user, ownerId, action === 'details' ? 'details' : 'main');
        await interaction.editReply({ components: [built.container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        logger.error('Error toggling profile view', error.message);
      }
      return;
    }

    if (action === 'share') {
      const built = buildProfilePayload(interaction.user, ownerId, 'main');
      try {
        await interaction.reply({
          components: [built.container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (e) {
        await interaction.followUp({
          components: [built.container],
          flags: MessageFlags.IsComponentsV2
        });
      }
      return;
    }

    if (action === 'goto') {
      await openDestination(interaction, dest, ownerId);
      return;
    }

    if (action === 'nav') {
      await openDestination(interaction, interaction.values && interaction.values[0], ownerId);
    }
  }
};

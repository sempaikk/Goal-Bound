const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
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
const { t, rankLabel, rarityLabel, localeOf } = require('../utils/i18n.js');
const { toggleLocale } = require('../services/qolStore.js');
const {
  binderByBannerLines,
  almostCompleteLines,
  whoNeedsXpLines,
  recentPullsLines
} = require('../utils/qolText.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');

const CUSTOM_ID_PREFIX = 'profile';

function accentInt() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function miniBar(current, total, length = 8) {
  if (total <= 0) return '▱'.repeat(length);
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

function buildProfilePayload(targetUser, viewerId) {
  const userId = targetUser.id;
  const username = targetUser.username;
  const displayName = targetUser.globalName || targetUser.displayName || username;
  const isSelf = userId === viewerId;
  const avatarURL = targetUser.displayAvatarURL({ size: 256, extension: 'png' });
  const L = (key, vars) => t(viewerId, key, vars);
  const loc = localeOf(viewerId);

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
    owned, poolSize, teamAvgLevel: avgLevel, teamSize: teamRows.length
  });
  const rankName = rankLabel(viewerId, playerRank.key);
  const nextRankName = playerRank.next ? rankLabel(viewerId, playerRank.next.key) : null;

  const badges = [];
  for (const st of staffTitles) badges.push(`${st.emoji} **${st.label}**`);
  badges.push(`${playerRank.emoji} **${rankName}**`);
  if (isCollectionComplete) badges.push(`🏁 ${L('profile_full_binder')}`);
  if (isTeamComplete) badges.push(`✅ ${L('profile_eleven_ready')}`);
  if (coachCard) badges.push(`${coachEmoji || '🎩'} ${coachCard.name}`);
  if (!isSelf) badges.push(`${L('profile_viewing')} **${displayName}**`);

  const titleBlock =
    `# ${isCollectionComplete ? '🏁' : '🧬'} ${displayName}\n` +
    (displayName !== username ? `\`@${username}\`\n` : '') +
    badges.join(' · ');

  const rankNextLine = playerRank.next
    ? `${L('profile_next')} **${playerRank.next.emoji} ${nextRankName}** · ${playerRank.progressToNext}%`
    : L('profile_max_rank');

  const elevenLabel = teamRows.length === 0
    ? (isSelf ? `${L('profile_vacant')} · \`/team\`` : L('profile_vacant'))
    : `**${teamRows.length}/11**${isTeamComplete ? ` ${L('profile_ready')}` : ''}` +
      (avgLevel > 0 ? ` · ${L('profile_avg')} **${avgLevel}**` : '');

  const bannerBinder = binderByBannerLines(userId, cards, userCards);
  const almost = almostCompleteLines(userId, cards, userCards);

  let shapeLine =
    `🏷️ **${L('profile_shape')}** · **${formation.label}**` +
    (coachCard ? ` · ${coachEmoji || '🎩'} ${coachCard.name}` : ` · ${L('profile_no_master')}`);
  if (masterPassive) shapeLine += `\n_${masterPassive}_`;

  const numLoc = loc === 'pt' ? 'pt-BR' : 'en-US';
  const statsBlock =
    `### 📊 ${L('profile_overview')}\n` +
    `${playerRank.emoji} **${L('profile_rank')}** · **${rankName}** · ${L('profile_score')} **${playerRank.score}**\n` +
    `_${rankNextLine}_\n` +
    `💰 **${L('profile_iene')}** · **${iene.toLocaleString(numLoc)}**\n` +
    `📋 **${L('profile_eleven')}** · ${elevenLabel}\n` +
    `📔 **${L('profile_binder')}** · **${owned}/${poolSize}** (${binderPct}%)${remaining > 0 ? ` · ${remaining} ${L('profile_left')}` : ` · ${L('profile_done')}`}\n` +
    `${bannerBinder}` +
    (almost ? `\n\n${almost}` : '') +
    `\n${shapeLine}`;

  let pitchBlock;
  if (teamRows.length > 0) {
    const teamBySlot = new Map(teamRows.map(row => [row.slot, row]));
    const squadPreview = lines.map(line => {
      const cells = line.slots.map(slotKey => {
        const entry = teamBySlot.get(slotKey);
        if (!entry) return '⬜';
        const head = emojiTag(getEmojiForCard(entry.cardId)) || '👤';
        return `${head}\`${entry.level}\``;
      }).join('   ');
      return `**${line.name}**\n${cells}`;
    }).join('\n\n');
    const rankBlock = whoNeedsXpLines(userId, teamRows, 3) || '—';
    pitchBlock =
      `### ⚽ ${L('profile_pitch')}\n${safeTruncate(squadPreview, 1200)}\n\n` +
      `### 📈 ${L('profile_who_xp')}\n${rankBlock}`;
  } else {
    pitchBlock =
      `### ⚽ ${L('profile_pitch')}\n` +
      (isSelf ? `_${L('profile_empty_pitch')}_` : `_${L('profile_no_shape')}_`);
  }

  const binderBar = progressBar(owned, poolSize, 14);
  const tierLines = RARITY_ORDER.map(key => {
    const totalInTier = cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (totalInTier === 0) return null;
    const ownedInTier = userCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position !== 'CO' && card.rarity === key;
    }).length;
    const pct = Math.round((ownedInTier / totalInTier) * 100);
    return `${RARITIES[key].emoji} **${rarityLabel(viewerId, key)}**  ${miniBar(ownedInTier, totalInTier, 8)}  **${ownedInTier}**/${totalInTier} (${pct}%)`;
  }).filter(Boolean);

  const coachTotal = cards.filter(c => c.position === 'CO').length;
  if (coachTotal > 0) {
    const coachOwned = userCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position === 'CO';
    }).length;
    const pct = Math.round((coachOwned / coachTotal) * 100);
    tierLines.push(
      `🎩 **${L('profile_masters')}**  ${miniBar(coachOwned, coachTotal, 8)}  **${coachOwned}**/${coachTotal} (${pct}%)`
    );
  }

  const recent = recentPullsLines(userId, 5);
  const binderBlock =
    `### 📔 ${L('profile_binder')}\n` +
    (isCollectionComplete
      ? `🏁 **${L('profile_full_set')}**\n${binderBar}`
      : `${binderBar}`) +
    `\n\n### 🏷️ ${L('profile_tiers')}\n` + (tierLines.join('\n') || '—') +
    `\n\n### 📜 ${L('profile_last_pulls')}\n${recent}`;

  const footerNote = isSelf
    ? `_${L('profile_footer_self')}_`
    : `_${L('profile_footer_other')}_`;

  const container = new ContainerBuilder()
    .setAccentColor(isCollectionComplete ? 0x57f287 : accentInt());

  try {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(titleBlock, 1800)))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL))
    );
  } catch {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(titleBlock, 1800)));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(statsBlock, 2200)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(pitchBlock, 2800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(`${binderBlock}\n\n${footerNote}`, 3200)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:pickuser`)
          .setPlaceholder(L('profile_compare'))
          .setMinValues(1)
          .setMaxValues(1)
      )
    );

  if (isSelf) {
    const langLabel = loc === 'pt' ? '🇧🇷 PT' : '🇬🇧 EN';
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:collection`)
          .setLabel(L('profile_btn_binder'))
          .setEmoji('📔')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:team`)
          .setLabel(L('profile_btn_eleven'))
          .setEmoji('📋')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:goto:banners`)
          .setLabel(L('profile_btn_banner'))
          .setEmoji('🎴')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:share`)
          .setLabel(L('profile_btn_share'))
          .setEmoji('📣')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${CUSTOM_ID_PREFIX}:${viewerId}:lang`)
          .setLabel(langLabel)
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return { container, isSelf };
}

async function openProfilePanel(interaction, userId, targetUser) {
  const { container } = buildProfilePayload(targetUser, userId);
  try {
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch {
    await interaction.followUp({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | 64
    });
  }
}

module.exports = {
  buildProfilePayload,
  openProfilePanel,
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('🧬 Player card — rank, Iene, eleven, binder & shape')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('Whose card to view (default: you)').setRequired(false),
          'De quem ver o card (padrão: você)'
        )
      ),
    '🧬 Card do jogador — rank, Iene, onze, binder e formação'
  ),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', '🤖 Automated accounts stay on the bench', config.MESSAGES.BOTS_DONT_PLAY || 'Pick a human.')],
          flags: 64
        });
        return;
      }
      const { container } = buildProfilePayload(target, interaction.user.id);
      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /profile command', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)], flags: 64 });
        }
      } catch (_) {}
    }
  },

  async handleComponent(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', '🚫 Not your panel', 'Open **`/profile`** yourself.')],
        flags: 64
      });
      return;
    }

    if (action === 'lang') {
      const next = toggleLocale(ownerId);
      const msg = next === 'pt' ? t(ownerId, 'lang_set_pt') : t(ownerId, 'lang_set_en');
      await interaction.reply({
        embeds: [buildStatusEmbed('SUCCESS', next === 'pt' ? '🇧🇷' : '🇬🇧', msg)],
        flags: 64
      });
      try {
        const { container } = buildProfilePayload(interaction.user, ownerId);
        await interaction.message.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch {
        /* ignore if message not editable */
      }
      return;
    }

    if (action === 'share') {
      const { container } = buildProfilePayload(interaction.user, ownerId);
      try {
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch {
        await interaction.followUp({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }
      return;
    }

    if (action === 'pickuser') {
      await interaction.deferUpdate();
      try {
        const selected =
          interaction.users?.first?.() ||
          (interaction.values?.[0]
            ? await interaction.client.users.fetch(interaction.values[0]).catch(() => null)
            : null);
        if (!selected || selected.bot) {
          await interaction.followUp({
            embeds: [buildStatusEmbed('WARNING', '🤖 Pick a human', config.MESSAGES.BOTS_DONT_PLAY)],
            flags: 64
          });
          return;
        }
        const { container } = buildProfilePayload(selected, ownerId);
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        logger.error('Error handling profile user select', error.message);
      }
      return;
    }

    if (action === 'goto') {
      await openDestination(interaction, dest, ownerId);
      return;
    }

    if (action === 'nav') {
      await openDestination(interaction, interaction.values?.[0], ownerId);
    }
  }
};

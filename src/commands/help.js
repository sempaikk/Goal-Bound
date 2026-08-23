const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { RARITIES, RARITY_ORDER, percentageFor } = require('../services/rarities.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { DAILY_IENE, PITY_SOFT } = require('../services/qolStore.js');
const { t, rarityLabel } = require('../utils/i18n.js');
const { withPtBr } = require('../utils/slashLocale.js');

const CUSTOM_ID_PREFIX = 'help';
const ACCENT = 0xff4d8d;

function accentInt() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : ACCENT;
}

function buildModeRow(userId, mode) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:${userId}:short`)
      .setLabel(t(userId, 'help_quick'))
      .setStyle(mode === 'short' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(mode === 'short'),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID_PREFIX}:${userId}:full`)
      .setLabel(t(userId, 'help_full'))
      .setStyle(mode === 'full' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(mode === 'full')
  );
}

function buildShortContainer(userId, totalCards) {
  return new ContainerBuilder()
    .setAccentColor(accentInt())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🔸 ${config.BRAND.NAME}\n` +
          `**${config.BRAND.TAGLINE}**\n` +
          t(userId, 'help_recruit', { n: totalCards })
      ),
      new TextDisplayBuilder().setContent(
        t(userId, 'help_quick_body', { daily: DAILY_IENE })
      ),
      new TextDisplayBuilder().setContent(t(userId, 'help_commands'))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(buildModeRow(userId, 'short'));
}

function buildFullContainer(userId, totalCards, cards) {
  const rarityLine = RARITY_ORDER.map(key => {
    const r = RARITIES[key];
    const count = cards.filter(c => c.rarity === key && (!c.banner || c.banner === 'padrao')).length;
    const label = rarityLabel(userId, key);
    return `${r.emoji} **${label}** ${percentageFor(key).toFixed(2)}%` +
      (count > 0
        ? ` · ${t(userId, 'help_cards_count', { n: count })}`
        : ` · ${t(userId, 'help_empty_tier')}`);
  }).join('\n');

  return new ContainerBuilder()
    .setAccentColor(accentInt())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 📖 ${config.BRAND.NAME} — ${t(userId, 'help_guide')}\n` +
          `**${config.BRAND.TAGLINE}**\n` +
          t(userId, 'help_chars', { n: totalCards })
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t(userId, 'help_daily', { daily: DAILY_IENE })),
      new TextDisplayBuilder().setContent(t(userId, 'help_banners', { pity: PITY_SOFT })),
      new TextDisplayBuilder().setContent(`${t(userId, 'help_rates')}\n${rarityLine}`),
      new TextDisplayBuilder().setContent(t(userId, 'help_team'))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t(userId, 'help_xp', { daily: DAILY_IENE })),
      new TextDisplayBuilder().setContent(t(userId, 'help_other'))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(buildModeRow(userId, 'full'));
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('📖 Quick start and full guide for Goal Bound'),
    '📖 Início rápido e guia completo do Goal Bound'
  ),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      const cards = DataService.loadCards();
      const container = buildShortContainer(userId, cards.length);
      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Error in /help command', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
            flags: 64
          });
        }
      } catch (_) { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const parts = interaction.customId.split(':');
    let mode = 'short';
    if (parts.length >= 3) {
      mode = parts[2] === 'full' ? 'full' : 'short';
    } else {
      mode = parts[1] === 'full' ? 'full' : 'short';
    }
    const userId = interaction.user.id;
    await interaction.deferUpdate();
    try {
      const cards = DataService.loadCards();
      const container =
        mode === 'full'
          ? buildFullContainer(userId, cards.length, cards)
          : buildShortContainer(userId, cards.length);
      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      logger.error('Error handling /help button', error.message);
    }
  }
};

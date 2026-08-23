const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const DataService = require('../../services/DataService.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const { claimDaily, getDailyStatus, DAILY_IENE } = require('../../services/qolStore.js');
const { getDailyAmount } = require('../../services/coachPassives.js');
const { t, localeOf } = require('../../utils/i18n.js');
const { withPtBr } = require('../../utils/slashLocale.js');
const { openDestination } = require('../../utils/nav.js');

/** Next UTC midnight as unix seconds (daily resets on UTC day key). */
function nextUtcMidnightUnix() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.floor(next / 1000);
}

function accentSuccess() {
  const hex = String(config.COLORS?.SUCCESS || '#3DDC97').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0x3ddc97;
}

function accentWarning() {
  const hex = String(config.COLORS?.WARNING || '#FFB020').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xffb020;
}

function buildAlreadyContainer(userId, bal, resetUnix) {
  const loc = localeOf(userId);
  const num = (n) => n.toLocaleString(loc === 'pt' ? 'pt-BR' : 'en-US');
  const cta =
    bal >= 1
      ? `\n\n_${t(userId, 'daily_cta_spend')}_`
      : '';

  const body =
    `${t(userId, 'daily_already_body', { bal: num(bal) })}\n\n` +
    `⏱️ ${t(userId, 'daily_next')} <t:${resetUnix}:R> · <t:${resetUnix}:t>` +
    cta;

  return new ContainerBuilder()
    .setAccentColor(accentWarning())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📅 ${t(userId, 'daily_already')}`),
      new TextDisplayBuilder().setContent(body)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
}

function buildClaimedContainer(userId, amount, balance, resetUnix, bonusNote) {
  const loc = localeOf(userId);
  const num = (n) => n.toLocaleString(loc === 'pt' ? 'pt-BR' : 'en-US');

  let body =
    `${t(userId, 'daily_claimed_body', {
      amount,
      bal: num(balance)
    })}\n\n`;
  if (bonusNote) body += `${bonusNote}\n\n`;
  body +=
    `⏱️ ${t(userId, 'daily_next')} <t:${resetUnix}:R>\n\n` +
    `_${t(userId, 'daily_cta_recruit')}_`;

  const footer = `_${t(userId, 'daily_footer')}_`;

  const container = new ContainerBuilder()
    .setAccentColor(accentSuccess())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 💰 ${t(userId, 'daily_claimed')}`),
      new TextDisplayBuilder().setContent(body),
      new TextDisplayBuilder().setContent(footer)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`daily:${userId}:goto:banners`)
          .setLabel(t(userId, 'daily_btn_banners'))
          .setEmoji('🎴')
          .setStyle(ButtonStyle.Primary)
      )
    );

  return container;
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('daily')
      .setDescription(`💰 Claim ${DAILY_IENE}+ Iene once per day (Ego master: +2)`),
    `💰 Resgate ${DAILY_IENE}+ Iene uma vez por dia (master Ego: +2)`
  ),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);
      const resetUnix = nextUtcMidnightUnix();

      const status = getDailyStatus(userId);
      if (status.claimed) {
        const bal = DataService.getIene(userId);
        const container = buildAlreadyContainer(userId, bal, resetUnix);
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
      }

      const result = claimDaily(userId);
      if (!result.ok) {
        const bal = DataService.getIene(userId);
        const container = buildAlreadyContainer(userId, bal, resetUnix);
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        return;
      }

      const { amount, bonus, passive } = getDailyAmount(userId);
      const balance = DataService.addIene(userId, amount);
      const bonusNote =
        bonus > 0 && passive
          ? `🧭 **${passive.name}** · +${bonus} Iene master bonus`
          : null;
      const container = buildClaimedContainer(userId, amount, balance, resetUnix, bonusNote);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
      logger.info(
        `Daily claimed by ${interaction.user.username}`,
        `+${amount}${bonus ? ` (base ${DAILY_IENE}+${bonus})` : ''} → ${balance}`
      );
    } catch (error) {
      logger.error('Error in /daily', error.message);
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
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', '🚫', t(ownerId, 'team_open_self'))],
        flags: 64
      });
      return;
    }

    if (action === 'goto' && dest) {
      await openDestination(interaction, dest, ownerId);
    }
  }
};

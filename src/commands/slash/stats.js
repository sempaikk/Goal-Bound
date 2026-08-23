const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const DataService = require('../../services/DataService.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const { emojiTag, safeTruncate } = require('../../utils/format.js');
const { getEmojiForCard } = require('../../services/characterEmojis.js');
const {
  getGlobalPullCounts,
  getGlobalPullCountsLastDays,
  getPullLogTotalLastDays
} = require('../../services/qolStore.js');
const { cardsForBanner } = require('../../services/banners.js');
const { RARITIES } = require('../../services/rarities.js');
const { missingByTierLines } = require('../../utils/qolText.js');
const { withPtBr } = require('../../utils/slashLocale.js');
const { t, localeOf } = require('../../utils/i18n.js');

function accentInt() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function rankLines(counts, byId, emptyMsg, numFmt) {
  const ranked = Object.entries(counts)
    .map(([id, n]) => ({ id: Number(id), n: Number(n) || 0, card: byId.get(Number(id)) }))
    .filter(x => x.card && x.n > 0)
    .sort((a, b) => b.n - a.n || a.card.name.localeCompare(b.card.name))
    .slice(0, 10);

  if (ranked.length === 0) return emptyMsg;

  return ranked
    .map((row, i) => {
      const icon = emojiTag(getEmojiForCard(row.id)) || '•';
      const rar = row.card.position === 'CO'
        ? '🎩'
        : (RARITIES[row.card.rarity]?.emoji || '');
      return `**${i + 1}.** ${icon} **${row.card.name}** ${rar} · **${numFmt(row.n)}**`;
    })
    .join('\n');
}

function buildStatsContainer(userId) {
  const loc = localeOf(userId);
  const num = (n) => n.toLocaleString(loc === 'pt' ? 'pt-BR' : 'en-US');

  const cards = DataService.loadCards();
  const byId = new Map(cards.map(c => [c.id, c]));
  const allTime = getGlobalPullCounts();
  const last7 = getGlobalPullCountsLastDays(7);
  const totalAll = Object.values(allTime).reduce((s, n) => s + (Number(n) || 0), 0);
  const total7 = getPullLogTotalLastDays(7);

  const standardPool = cardsForBanner(cards, 'padrao');
  const coachPool = cardsForBanner(cards, 'treinadores');

  const topAll = rankLines(allTime, byId, t(userId, 'stats_no_pulls'), num);
  const top7 = rankLines(last7, byId, t(userId, 'stats_no_pulls_7d'), num);

  const userCards = DataService.getValidUserCards(userId, cards);
  const missing = missingByTierLines(userId, cards, userCards, userId);

  const summary =
    `**${t(userId, 'stats_total')}:** **${num(totalAll)}**\n` +
    `**${t(userId, 'stats_7d')}:** **${num(total7)}**\n` +
    t(userId, 'stats_pools', { std: standardPool.length, coach: coachPool.length });

  const topBlock =
    `### ${t(userId, 'stats_top_all')}\n${topAll}\n\n` +
    `### ${t(userId, 'stats_top_7d')}\n${top7}`;

  const gapsBlock = missing
    ? `### ${t(userId, 'stats_missing')}\n${missing}`
    : `### ${t(userId, 'stats_missing')}\n_${t(userId, 'stats_missing_none')}_`;

  const footer = `_${t(userId, 'stats_footer')}_`;

  return new ContainerBuilder()
    .setAccentColor(accentInt())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📊 ${t(userId, 'stats_title')}`),
      new TextDisplayBuilder().setContent(safeTruncate(summary, 1500))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeTruncate(topBlock, 3500))
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeTruncate(`${gapsBlock}\n\n${footer}`, 2000))
    );
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('📊 Server stats — most pulled cards & binder gaps'),
    '📊 Stats do servidor — mais puxadas e o que falta no binder'
  ),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);

      const container = buildStatsContainer(userId);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
      logger.info(`Stats viewed by ${interaction.user.username}`);
    } catch (error) {
      logger.error('Error in /stats', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
            flags: 64
          });
        }
      } catch (_) { /* ignore */ }
    }
  }
};

const {
  SlashCommandBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { getInfo } = require('../services/webServer.js');
const { computeSquadScore, formatScore } = require('../services/squadScore.js');
const { getLeaderboard } = require('../services/leaderboardService.js');
const { withPtBr } = require('../utils/slashLocale.js');
const { t } = require('../utils/i18n.js');

function accent() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

const HOOK_KEYS = [
  'lb_hook_1', 'lb_hook_2', 'lb_hook_3', 'lb_hook_4',
  'lb_hook_5', 'lb_hook_6', 'lb_hook_7', 'lb_hook_8'
];

function pickHook(userId) {
  const key = HOOK_KEYS[Math.floor(Math.random() * HOOK_KEYS.length)];
  return t(userId, key);
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('rank')
      .setDescription('🏆 Live top-100 board — open, climb, dominate'),
    '🏆 Placar ao vivo top 100 — abrir, subir, dominar'
  ),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);

      const web = getInfo();
      const base =
        web.url || 'https://goal-bound-production.up.railway.app/leaderboard';
      const url = `${base}?user=${encodeURIComponent(userId)}`;

      const hook = pickHook(userId);
      const sp = computeSquadScore(userId);

      let boardTotal = 0;
      let completeCount = 0;
      try {
        const board = getLeaderboard({ limit: 100, minFilled: 1 });
        boardTotal = board.total;
        completeCount = board.entries.filter(e => e.isComplete).length;
      } catch {
        /* ignore */
      }

      let squadBlock;
      if (sp.filled === 0) {
        squadBlock = t(userId, 'lb_squad_empty');
      } else {
        const master = sp.coachShort ? ` · **${sp.coachShort}**` : '';
        const ready = sp.isComplete ? t(userId, 'lb_ready') : '';
        squadBlock = t(userId, 'lb_squad_line', {
          score: formatScore(sp.score),
          filled: sp.filled,
          avg: sp.avgLevel,
          master,
          ready,
          formation: sp.formationLabel
        });
      }

      const boardLine =
        boardTotal > 0
          ? t(userId, 'lb_board_line', { total: boardTotal, complete: completeCount })
          : t(userId, 'lb_board_empty');

      const container = new ContainerBuilder()
        .setAccentColor(accent())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🏆 ${t(userId, 'lb_title')}\n\n` +
              `**${hook}**\n\n` +
              `${boardLine}`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(squadBlock))
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setURL(url)
              .setLabel(t(userId, 'lb_open').slice(0, 80))
              .setEmoji('⚽')
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`cta:${userId}:team`)
              .setLabel(t(userId, 'lb_btn_team').slice(0, 80))
              .setEmoji('📋')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`cta:${userId}:banners`)
              .setLabel(t(userId, 'lb_btn_banners').slice(0, 80))
              .setEmoji('🎴')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`cta:${userId}:daily`)
              .setLabel(t(userId, 'lb_btn_daily').slice(0, 80))
              .setEmoji('💰')
              .setStyle(ButtonStyle.Secondary)
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(t(userId, 'lb_footer'))
        );

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      logger.error('Error in /rank', error.message);
      try {
        const payload = {
          embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
          flags: 64
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch {
        /* ignore */
      }
    }
  }
};

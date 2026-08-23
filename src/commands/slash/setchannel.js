const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const {
  getAllowedChannelId,
  setAllowedChannelId,
  clearAllowedChannelId
} = require('../../services/guildSettings.js');
const { t } = require('../../utils/i18n.js');
const { withPtBr, optionPtBr } = require('../../utils/slashLocale.js');

function accentInt() {
  const hex = String(config.COLORS?.SUCCESS || '#3DDC97').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0x3ddc97;
}

function accentWarn() {
  const hex = String(config.COLORS?.WARNING || '#FFB020').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xffb020;
}

function canManage(interaction) {
  if (config.OWNER_ID && String(interaction.user.id) === String(config.OWNER_ID)) {
    return true;
  }
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

module.exports = {
  /** Always usable — required to unlock the bot on a guild. */
  bypassChannelLock: true,

  data: withPtBr(
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('🔒 Set the only channel where Goal Bound works (admin)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(opt =>
        optionPtBr(
          opt
            .setName('channel')
            .setDescription('Text channel for the bot (default: this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
          'Canal de texto do bot (padrão: este canal)'
        )
      )
      .addBooleanOption(opt =>
        optionPtBr(
          opt
            .setName('clear')
            .setDescription('Remove the allowed channel (bot pauses on this server)')
            .setRequired(false),
          'Remove o canal autorizado (bot pausa neste servidor)'
        )
      ),
    '🔒 Define o único canal onde o Goal Bound funciona (admin)'
  ),

  async execute(interaction) {
    try {
      const userId = interaction.user.id;

      // Prefer guildId: interaction.guild can be null if the guild is not in cache
      // (e.g. brief desync) even when the command is used inside a server.
      const guildId = interaction.guildId || interaction.guild?.id || null;
      if (!guildId) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              `🔒 ${t(userId, 'setup_guild_only_title')}`,
              t(userId, 'setup_guild_only')
            )
          ],
          flags: 64
        });
        return;
      }

      if (!canManage(interaction)) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              `🔒 ${t(userId, 'setup_denied_title')}`,
              t(userId, 'setup_denied')
            )
          ],
          flags: 64
        });
        return;
      }

      const guildName =
        interaction.guild?.name ||
        interaction.client.guilds.cache.get(guildId)?.name ||
        guildId;

      const clear = interaction.options.getBoolean('clear') === true;

      if (clear) {
        const had = clearAllowedChannelId(guildId);
        const container = new ContainerBuilder()
          .setAccentColor(accentWarn())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 🔒 ${t(userId, 'setup_cleared_title')}`),
            new TextDisplayBuilder().setContent(
              had ? t(userId, 'setup_cleared') : t(userId, 'setup_cleared_none')
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          );
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        logger.info(
          `Guild ${guildName} (${guildId}): channel lock cleared by ${interaction.user.username}`
        );
        return;
      }

      const channel =
        interaction.options.getChannel('channel') || interaction.channel;

      const channelType = channel?.type;
      const isTextLike =
        channel &&
        (channelType === ChannelType.GuildText ||
          channelType === ChannelType.GuildAnnouncement ||
          // Discord sometimes returns partials without numeric type match
          channel.isTextBased?.() === true);

      if (!channel || !channel.id || (!isTextLike && channelType != null && channelType !== ChannelType.GuildText && channelType !== ChannelType.GuildAnnouncement)) {
        // If type is unknown but we have an id from a channel option, still accept
        if (!channel?.id) {
          await interaction.reply({
            embeds: [
              buildStatusEmbed(
                'WARNING',
                `🔒 ${t(userId, 'setup_bad_channel_title')}`,
                t(userId, 'setup_bad_channel')
              )
            ],
            flags: 64
          });
          return;
        }
      }

      if (
        channelType != null &&
        channelType !== ChannelType.GuildText &&
        channelType !== ChannelType.GuildAnnouncement
      ) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              `🔒 ${t(userId, 'setup_bad_channel_title')}`,
              t(userId, 'setup_bad_channel')
            )
          ],
          flags: 64
        });
        return;
      }

      setAllowedChannelId(guildId, channel.id, userId);

      const container = new ContainerBuilder()
        .setAccentColor(accentInt())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`# ✅ ${t(userId, 'setup_ok_title')}`),
          new TextDisplayBuilder().setContent(
            t(userId, 'setup_ok', { channel: `<#${channel.id}>` })
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
      logger.info(
        `Guild ${guildName} (${guildId}): allowed channel → #${channel.name || channel.id} (${channel.id}) by ${interaction.user.username}`
      );
    } catch (error) {
      logger.error('Error in /setchannel', error.message);
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

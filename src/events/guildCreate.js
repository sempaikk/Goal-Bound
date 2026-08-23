const {
  Events,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { isGuildConfigured } = require('../services/guildSettings.js');

function accentPrimary() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function canPost(channel, me) {
  if (!channel || !me) return false;
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return false;
  }
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.SendMessages)
  );
}

/** Prefer system channel, else first text channel the bot can post in. */
function findWelcomeChannel(guild) {
  const me = guild.members.me;
  if (guild.systemChannel && canPost(guild.systemChannel, me)) {
    return guild.systemChannel;
  }
  const sorted = [...guild.channels.cache.values()]
    .filter(ch => canPost(ch, me))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
  return sorted[0] || null;
}

function buildWelcomeContainer(guildName) {
  return new ContainerBuilder()
    .setAccentColor(accentPrimary())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# ⚽ Goal Bound is here'),
      new TextDisplayBuilder().setContent(
        `Thanks for adding **Goal Bound** to **${guildName}**.\n\n` +
          '### Activate the bot\n' +
          'An admin (or anyone with **Manage Server**) must run:\n' +
          '**`/setchannel`**\n' +
          '_in the channel where players should use commands._\n\n' +
          'Until then, commands and rewards stay **off** on this server.\n\n' +
          '### After setup\n' +
          '• **Commands** (`/daily` · `/banners` · `/team` · …) only work in that channel\n' +
          '• **XP & Iene** still count from chat and voice **anywhere** on the server\n\n' +
          '`/daily` · `/banners` · `/team` · `/collection` · `/profile` · `/help`\n\n' +
          '_Change or pause anytime: **`/setchannel`** again, or **`/setchannel clear:True`**._'
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
}

module.exports = {
  name: Events.GuildCreate,
  once: false,
  async execute(guild) {
    try {
      if (isGuildConfigured(guild.id)) {
        logger.info(`Joined ${guild.name} (${guild.id}) — channel already configured`);
        return;
      }

      logger.info(`Joined ${guild.name} (${guild.id}) — sending setup guide`);

      const channel = findWelcomeChannel(guild);
      if (!channel) {
        logger.warn(
          `No writable text channel in ${guild.name} — cannot post /setchannel guide`
        );
        return;
      }

      await channel.send({
        components: [buildWelcomeContainer(guild.name)],
        flags: MessageFlags.IsComponentsV2
      });
      logger.success(`Setup guide posted in #${channel.name} (${guild.name})`);
    } catch (error) {
      logger.error(`guildCreate onboarding failed for ${guild?.id}`, error.message);
    }
  }
};

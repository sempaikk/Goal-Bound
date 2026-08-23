/**
 * Blocks guild interactions outside the admin-approved channel.
 * /setchannel always passes (bypassChannelLock).
 */
const {
  isChannelAllowed,
  isGuildConfigured,
  getAllowedChannelId
} = require('../services/guildSettings.js');
const { buildStatusEmbed } = require('./statusEmbed.js');
const { t } = require('./i18n.js');

/** Commands that must work before the guild is configured. */
const ALWAYS_ALLOWED = new Set(['setchannel']);

function isBypassCommand(command) {
  if (!command) return false;
  if (command.bypassChannelLock) return true;
  const name = command.data?.name;
  return name && ALWAYS_ALLOWED.has(name);
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {object | null} command
 * @param {{ silent?: boolean }} [opts] silent=true skips embed reply (autocomplete)
 * @returns {Promise<boolean>} true if the interaction may proceed
 */
async function assertChannelAllowed(interaction, command, opts = {}) {
  // DMs — no guild lock
  if (!interaction.guildId) return true;

  if (isBypassCommand(command)) return true;

  // Bot owner can always operate (testing)
  const config = require('../config/config.js');
  if (config.OWNER_ID && String(interaction.user.id) === String(config.OWNER_ID)) {
    return true;
  }

  const channelId = interaction.channelId;
  const guildId = interaction.guildId;

  if (isChannelAllowed(guildId, channelId)) return true;

  if (opts.silent) return false;

  const userId = interaction.user.id;
  const configured = isGuildConfigured(guildId);
  const allowedId = getAllowedChannelId(guildId);

  let title;
  let body;
  if (!configured) {
    title = t(userId, 'gate_not_setup_title');
    body = t(userId, 'gate_not_setup');
  } else {
    title = t(userId, 'gate_wrong_channel_title');
    body = t(userId, 'gate_wrong_channel', { channel: `<#${allowedId}>` });
  }

  const payload = {
    embeds: [buildStatusEmbed('WARNING', `🔒 ${title}`, body)],
    flags: 64
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      try {
        await interaction.reply(payload);
      } catch {
        await interaction.followUp(payload);
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

module.exports = {
  assertChannelAllowed,
  isBypassCommand,
  ALWAYS_ALLOWED
};

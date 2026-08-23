const { Events } = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { openDestination } = require('../utils/nav.js');
const { allowInteraction } = require('../utils/componentRateLimit.js');
const { checkCommandRate } = require('../utils/commandRateLimit.js');
const { assertChannelAllowed } = require('../utils/channelGate.js');
const { recordBotUser } = require('../services/guildActivity.js');
const { formatDuration } = require('../utils/format.js');
const { t } = require('../utils/i18n.js');

function resolveCommandFromCustomId(customId) {
  const [commandName] = String(customId || '').split(':');
  return commandName;
}

function trackBotUse(interaction) {
  try {
    if (!interaction.guildId || !interaction.user?.id) return;
    if (interaction.commandName === 'setchannel') return;
    recordBotUser(interaction.guildId, interaction.user.id);
  } catch {
    /* ignore */
  }
}

async function safeErrorReply(interaction, message) {
  const uid = interaction.user?.id;
  const payload = {
    embeds: [
      buildStatusEmbed(
        'ERROR',
        message || (uid ? t(uid, 'err_loading') : config.MESSAGES.ERROR_LOADING)
      )
    ],
    flags: 64
  };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (replyError) {
    logger.error('Failed to send error reply', replyError.message);
  }
}

async function runCtaHandler(interaction) {
  const parts = String(interaction.customId || '').split(':');
  const ownerId = parts[1];
  const dest = parts[2];
  if (!ownerId || !dest) return;
  try {
    const ok = await assertChannelAllowed(interaction, null);
    if (!ok) return;
    await openDestination(interaction, dest, ownerId);
  } catch (error) {
    logger.error('Error handling CTA', error.message);
  }
}

async function runComponentHandler(interaction) {
  const uid = interaction.user?.id;
  if (!allowInteraction(uid)) {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              t(uid, 'rate_click_title'),
              t(uid, 'rate_click_body')
            )
          ],
          flags: 64
        });
      }
    } catch { /* ignore */ }
    return;
  }

  const commandName = resolveCommandFromCustomId(interaction.customId);

  if (commandName === 'cta') {
    await runCtaHandler(interaction);
    return;
  }

  const command = interaction.client.commands.get(commandName);

  if (!command || !command.handleComponent) {
    logger.warn(`No component handler for customId: ${interaction.customId}`);
    return;
  }

  const ok = await assertChannelAllowed(interaction, command);
  if (!ok) return;

  try {
    await command.handleComponent(interaction);
  } catch (error) {
    logger.error(`Error handling component for /${commandName}`, error.message);
    await safeErrorReply(interaction);
  }
}

async function runModalHandler(interaction) {
  const commandName = resolveCommandFromCustomId(interaction.customId);
  const command = interaction.client.commands.get(commandName);

  if (!command || !command.handleModal) {
    logger.warn(`No modal handler for customId: ${interaction.customId}`);
    return;
  }

  const ok = await assertChannelAllowed(interaction, command);
  if (!ok) return;

  try {
    await command.handleModal(interaction);
  } catch (error) {
    logger.error(`Error handling modal for /${commandName}`, error.message);
    await safeErrorReply(interaction);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;

      const ok = await assertChannelAllowed(interaction, command, { silent: true });
      if (!ok) {
        try {
          await interaction.respond([]);
        } catch { /* ignore */ }
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        logger.error(`Error in autocomplete for /${interaction.commandName}`, error.message);
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isUserSelectMenu() ||
      interaction.isRoleSelectMenu() ||
      interaction.isChannelSelectMenu() ||
      interaction.isMentionableSelectMenu()
    ) {
      await runComponentHandler(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await runModalHandler(interaction);
      return;
    }

    if (interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Context command not found: ${interaction.commandName}`);
        return;
      }

      const ok = await assertChannelAllowed(interaction, command);
      if (!ok) return;

      trackBotUse(interaction);

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(`Error in context ${interaction.commandName}`, error.message);
        await safeErrorReply(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const uid = interaction.user.id;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Command not found: ${interaction.commandName}`);
      await safeErrorReply(interaction, t(uid, 'err_cmd_missing'));
      return;
    }

    if (command.ownerOnly) {
      const ownerId = config.OWNER_ID != null ? String(config.OWNER_ID) : '';
      if (!ownerId || String(uid) !== ownerId) {
        logger.warn(
          `Blocked owner-only command /${interaction.commandName}`,
          `attempted by ${interaction.user.username} (${uid})`
        );
        try {
          await interaction.reply({
            embeds: [buildStatusEmbed('WARNING', t(uid, 'err_owner_only'))],
            flags: 64
          });
        } catch (err) {
          logger.error('Error replying to blocked owner-only command', err.message);
        }
        return;
      }
    }

    const ok = await assertChannelAllowed(interaction, command);
    if (!ok) return;

    const rate = checkCommandRate(uid, interaction.commandName);
    if (!rate.ok) {
      const wait = formatDuration(rate.remainingMs);
      try {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              t(uid, 'rate_cmd_title'),
              t(uid, 'rate_cmd_body', { cmd: interaction.commandName, wait })
            )
          ],
          flags: 64
        });
      } catch (err) {
        logger.error('Error replying to command rate limit', err.message);
      }
      return;
    }

    trackBotUse(interaction);

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}`, error.message);
      await safeErrorReply(interaction);
    }
  }
};

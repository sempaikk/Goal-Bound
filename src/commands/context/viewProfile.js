const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const { maybeSendDmHint } = require('../../services/dmNotifier.js');
const profile = require('../profile.js');
const DataService = require('../../services/DataService.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('View Profile')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    try {
      const target = interaction.targetUser;

      if (!target || target.bot) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              "🤖 Bots don't play",
              config.MESSAGES.BOTS_DONT_PLAY || 'Pick a human.'
            )
          ],
          flags: 64
        });
        return;
      }

      DataService.ensureUser(target.id, target.username);
      await interaction.deferReply();

      await profile.openProfilePanel(interaction, interaction.user.id, target);

      logger.info(
        `Context Profile by ${interaction.user.username}`,
        `target ${target.username}`
      );
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in context View Profile', error.message);
      try {
        const errEmbed = buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ embeds: [errEmbed], flags: 64 });
        } else {
          await interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      } catch (_) { /* ignore */ }
    }
  }
};

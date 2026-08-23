const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const { maybeSendDmHint } = require('../../services/dmNotifier.js');
const DataService = require('../../services/DataService.js');
const team = require('../team.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('View Team')
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    try {
      const target = interaction.targetUser;

      if (!target || target.bot) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              '🤖 Bots stay on the bench',
              config.MESSAGES.BOTS_DONT_PLAY || 'Pick a human.'
            )
          ],
          flags: 64
        });
        return;
      }

      DataService.ensureUser(target.id, target.username);
      await interaction.deferReply({ flags: target.id === interaction.user.id ? 0 : 64 });

      if (target.id !== interaction.user.id) {
        const { embed, attachment } = await team.buildFormationDisplay(
          target.id,
          target.username
        );
        embed.setFooter({ text: `View-only · ${target.username}'s eleven · Goal Bound` });
        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
          components: []
        });
      } else {
        await team.openTeamPanel(interaction, target.id, target.username);
      }

      logger.info(
        `Context Team by ${interaction.user.username}`,
        `target ${target.username}`
      );
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in context View Team', error.message);
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

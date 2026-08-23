const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config.js');
const logger = require('../logger/logger.js');
const {
  runBackup,
  listRecentBackups,
  DADOS_DIR,
  KEEP_DAYS,
  HOUR_BRT
} = require('../services/playerDataBackup.js');

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('🔒 [Owner] Snapshot player data into persist/dados now'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const result = runBackup();
      const recent = listRecentBackups(5);
      const mb =
        result.bytes != null
          ? `${(result.bytes / (1024 * 1024)).toFixed(2)} MB`
          : '—';

      if (!result.ok) {
        const embed = new EmbedBuilder()
          .setColor(config.COLORS.ERROR)
          .setTitle('Backup failed')
          .setDescription(result.error || 'Unknown error')
          .addFields({
            name: 'Folder',
            value: `\`${DADOS_DIR}\``,
            inline: false
          });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      logger.success(
        `Manual backup by ${interaction.user.username}`,
        `${result.files.length} file(s)`
      );

      const embed = new EmbedBuilder()
        .setColor(config.COLORS.SUCCESS)
        .setTitle('Backup OK')
        .setDescription(
          `Snapshot saved under \`dados/\`.\n` +
            `Auto backup: **every day ${HOUR_BRT}:00 BRT** · keeps **${KEEP_DAYS}** days.`
        )
        .addFields(
          {
            name: 'This run',
            value: result.files.map(f => `· \`${f}\``).join('\n').slice(0, 1000) || '—',
            inline: false
          },
          {
            name: 'Folder size',
            value: mb,
            inline: true
          },
          {
            name: 'Recent stamps',
            value: recent.length ? recent.map(s => `· \`${s}\``).join('\n') : '_none yet_',
            inline: false
          },
          {
            name: 'Path (Railway)',
            value: '`/app/persist/dados`',
            inline: false
          }
        )
        .setFooter({
          text: 'Download this folder to your PC before switching Railway accounts.'
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in /backup', error.message);
      const embed = new EmbedBuilder()
        .setColor(config.COLORS.ERROR)
        .setTitle('Backup failed')
        .setDescription(error.message || 'Unexpected error');
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

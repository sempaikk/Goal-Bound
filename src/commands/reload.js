const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const CommandLoader = require('../utils/CommandLoader.js');
const { registerCommands } = require('../utils/CommandRegistrar.js');

module.exports = {
  // ownerOnly: true faz esse comando ser registrado só no seu servidor
  // privado (OWNER_GUILD_ID no .env), em vez de globalmente. Ninguém
  // em nenhum outro servidor vê ou consegue chamar esse comando -
  // e mesmo dentro do seu servidor privado, só você (OWNER_ID) consegue
  // executar de fato (checado em interactionCreate.js).
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('🔒 [Owner] Reload all commands without restarting the bot'),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const commandsPath = path.join(__dirname, '..', '..', 'src', 'commands');

      // Limpa o cache do require pra pegar as mudanças mais recentes
      // dos arquivos de comando direto do disco
      Object.keys(require.cache).forEach(key => {
        if (key.startsWith(commandsPath)) {
          delete require.cache[key];
        }
      });

      interaction.client.commands = CommandLoader.loadCommands(commandsPath);

      // onlyOwner: true - o /reload é uma ferramenta de teste rápido,
      // então só reregistra os comandos ownerOnly (o que normalmente é
      // o que você está mexendo quando chama /reload). Isso evita
      // reenviar o registro GLOBAL toda vez, que pode tomar rate limit
      // da API do Discord se você usar /reload várias vezes seguidas.
      // Se você mudar um comando público (/summon, /collection),
      // reinicie o bot normalmente pra registrar essa mudança.
      await registerCommands(interaction.client, { onlyOwner: true });

      const commandList = [...interaction.client.commands.values()]
        .map(cmd => `${cmd.ownerOnly ? '🔒' : '▫️'} \`/${cmd.data.name}\``)
        .join('\n');

      logger.success(`Commands reloaded by ${interaction.user.username}`, `${interaction.client.commands.size} command(s)`);

      const embed = new EmbedBuilder()
        .setColor(config.COLORS.SUCCESS)
        .setTitle('🔄 Commands reloaded!')
        .setDescription(
          `Re-read every file in \`src/commands/\` from disk and re-registered ` +
          `owner-only command(s) in this server — all without restarting the bot ` +
          `or dropping the Discord connection.`
        )
        .addFields({
          name: `📦 ${interaction.client.commands.size} command(s) loaded`,
          value: commandList || 'None',
          inline: false
        })
        .setFooter({ text: 'Public commands (▫️) need a full restart to update globally — this only refreshes owner-only ones (🔒).' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in /reload command', error.message);
      const embed = new EmbedBuilder()
        .setColor(config.COLORS.ERROR)
        .setTitle('❌ Reload failed')
        .setDescription('Something went wrong while reloading commands. Check the console for the full error.');
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

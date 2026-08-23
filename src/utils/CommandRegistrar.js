const { REST, Routes } = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');

/**
 * Registra os slash commands no Discord.
 *
 * Comandos normais (ownerOnly !== true) são registrados GLOBALMENTE,
 * então aparecem em todos os servidores onde o bot está - é o
 * comportamento de sempre (ex: /summon, /collection).
 *
 * Comandos marcados com `ownerOnly: true` são registrados só no
 * OWNER_GUILD_ID (seu servidor privado/de testes, configurado no
 * .env). Isso significa que eles NÃO aparecem em nenhum outro
 * servidor - ninguém além de você nem sabe que existem. A checagem
 * de permissão (interactionCreate.js) é uma segunda camada de
 * proteção, caso alguém dentro do seu servidor privado tente usá-los.
 *
 * @param {import('discord.js').Client} client
 * @param {Object} [options]
 * @param {boolean} [options.onlyOwner=false] Se true, registra só os
 *   comandos ownerOnly, sem tocar no registro global. Usado pelo
 *   /reload: como o registro global é por PUT (Discord API) e sofre
 *   rate limit se chamado repetidamente, não faz sentido reenviar os
 *   comandos públicos toda vez que você só está testando um comando
 *   de dono. O registro global completo continua acontecendo
 *   normalmente no boot do bot (ready.js).
 */
async function registerCommands(client, options = {}) {
  const { onlyOwner = false } = options;
  const rest = new REST({ version: '10' }).setToken(config.TOKEN);

  const publicCommands = [];
  const ownerCommands = [];

  client.commands.forEach(cmd => {
    if (cmd.ownerOnly) {
      ownerCommands.push(cmd.data.toJSON());
    } else {
      publicCommands.push(cmd.data.toJSON());
    }
  });

  // Comandos públicos - registro global (demora até ~1h pra propagar
  // pra todos os servidores após qualquer mudança, isso é normal e é
  // limitação do próprio Discord, não do bot)
  if (!onlyOwner) {
    try {
      logger.info(`Registering ${publicCommands.length} public command(s) globally...`);

      const data = await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: publicCommands }
      );

      logger.success(`${data.length} public command(s) registered`);
      data.forEach(cmd => logger.debug(`  └─ /${cmd.name}`));
    } catch (error) {
      logger.error('Error registering public commands', error.message);
    }
  } else {
    logger.debug('Skipping global command registration (onlyOwner=true)');
  }

  // Comandos do dono - registro só no servidor privado configurado
  if (ownerCommands.length > 0) {
    if (!config.OWNER_GUILD_ID) {
      logger.warn(`${ownerCommands.length} owner-only command(s) found but OWNER_GUILD_ID is not set in .env - they won't be registered anywhere`);
    } else {
      try {
        logger.info(`Registering ${ownerCommands.length} owner-only command(s) in guild ${config.OWNER_GUILD_ID}...`);

        const data = await rest.put(
          Routes.applicationGuildCommands(client.user.id, config.OWNER_GUILD_ID),
          { body: ownerCommands }
        );

        logger.success(`${data.length} owner-only command(s) registered`);
        data.forEach(cmd => logger.debug(`  └─ /${cmd.name} (owner-only)`));
      } catch (error) {
        logger.error('Error registering owner-only commands', error.message);
      }
    }
  }
}

module.exports = { registerCommands };

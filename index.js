require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Options } = require('discord.js');

const logger = require('./src/logger/logger.js');
const config = require('./src/config/config.js');
const CommandLoader = require('./src/utils/CommandLoader.js');
const DataService = require('./src/services/DataService.js');
const voiceTracking = require('./src/services/voiceTracking.js');
const { stopWebServer } = require('./src/services/webServer.js');

if (!config.TOKEN) {
  logger.error('Discord token not configured');
  logger.error('Copy .env.example to .env and set DISCORD_TOKEN=your_token');
  process.exit(1);
}

// Lean intents + tight caches: we never need message content, reactions,
// or huge guild member maps. Smaller cache = less GC and faster event path.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
    GuildMessageManager: 0,
    ReactionManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    GuildInviteManager: 0,
    PresenceManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    AutoModerationRuleManager: 0,
    GuildBanManager: 0,
    GuildScheduledEventManager: 0
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 60 },
    users: { interval: 3600, filter: () => user => user.bot && user.id !== client.user?.id }
  },
  rest: {
    timeout: 12_000,
    retries: 2
  }
});

logger.info(`Initializing ${config.BRAND?.NAME || 'Goal Bound'} v${config.VERSION}...`);

const commandsPath = path.join(__dirname, 'src/commands');
client.commands = CommandLoader.loadCommands(commandsPath);

const eventsPath = path.join(__dirname, 'src/events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

logger.info(`Loading ${eventFiles.length} event(s)...`);
eventFiles.forEach(file => {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }

  logger.success(`Event loaded: ${event.name}`);
});

function shutdown(signal, exitCode = 0) {
  logger.info(`Received ${signal}, closing database and shutting down...`);
  voiceTracking.stopTicking();
  try {
    stopWebServer();
  } catch (error) {
    logger.error('Error stopping web server on shutdown', error.message);
  }
  try {
    DataService.close();
  } catch (error) {
    logger.error('Error closing database on shutdown', error.message);
  } finally {
    client.destroy();
    process.exit(exitCode);
  }
}

client.on('error', error => {
  logger.error('Discord client error', error.message);
});

process.on('unhandledRejection', error => {
  logger.error('Unhandled rejection - restarting process', error?.message || String(error));
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught exception - restarting process', error.message);
  shutdown('uncaughtException', 1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

logger.info('Connecting to Discord...');
client.login(config.TOKEN);

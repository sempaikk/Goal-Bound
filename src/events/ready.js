const fs = require('fs');
const path = require('path');
const { Events, ActivityType } = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { registerCommands } = require('../utils/CommandRegistrar.js');
const { syncCharacterEmojis } = require('../services/emojiSync.js');
const { runMediaPrep } = require('../services/mediaPrep.js');
const voiceTracking = require('../services/voiceTracking.js');
const { restoreGateTimers } = require('../services/gateNotify.js');
const { installAsDefault: installTeamRenderCache } = require('../services/teamRenderCache.js');
const DataService = require('../services/DataService.js');
const { countActiveGuilds } = require('../services/guildActivity.js');
const { repairLostEgo } = require('../services/repairEgo.js');
const { ensureServerStatsResetOnce } = require('../services/qolStore.js');
const { startScheduler: startPlayerDataBackup } = require('../services/playerDataBackup.js');
const { startWebServer } = require('../services/webServer.js');

const PRESENCE_ROTATE_MS = 5 * 60 * 1000;
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');
const BANNERS_DIR = path.join(IMAGES_DIR, 'banners');
const BANNER_FILES = ['standard.gif', 'coaches.gif', 'hub.gif'];
const BANNER_WARN_BYTES = 2 * 1024 * 1024;

function markAlreadyConnectedUsers(client) {
  let count = 0;

  for (const guild of client.guilds.cache.values()) {
    for (const voiceState of guild.voiceStates.cache.values()) {
      const member = voiceState.member;
      if (!voiceState.channelId || !member || member.user.bot) continue;
      voiceTracking.markConnected(member.id, member.user.username);
      count++;
    }
  }

  return count;
}

function auditCardMedia() {
  let cards = [];
  try {
    cards = DataService.loadCards() || [];
  } catch (error) {
    logger.warn('Card media audit skipped', error.message);
    return;
  }

  const missingIcons = [];
  const missingImages = [];

  for (const card of cards) {
    if (card.icon) {
      const p = path.join(ICONS_DIR, card.icon);
      if (!fs.existsSync(p)) missingIcons.push(`${card.name} (${card.icon})`);
    } else {
      missingIcons.push(`${card.name} (no icon field)`);
    }
    if (card.localImage) {
      const p = path.join(IMAGES_DIR, card.localImage);
      if (!fs.existsSync(p)) missingImages.push(`${card.name} (${card.localImage})`);
    }
  }

  if (missingIcons.length === 0 && missingImages.length === 0) {
    logger.info(`Card media audit: ${cards.length} cards · all icons/gifs present`);
    return;
  }

  if (missingIcons.length) {
    logger.warn(
      `Card media audit: ${missingIcons.length} missing icon(s) — /team will use initials placeholder`,
      missingIcons.slice(0, 12).join(' · ')
    );
  }
  if (missingImages.length) {
    logger.warn(
      `Card media audit: ${missingImages.length} missing localImage(s)`,
      missingImages.slice(0, 12).join(' · ')
    );
  }
}

function auditBannerArt() {
  const present = [];
  const missing = [];
  const heavy = [];

  for (const name of BANNER_FILES) {
    const full = path.join(BANNERS_DIR, name);
    if (!fs.existsSync(full)) {
      missing.push(name);
      continue;
    }
    const size = fs.statSync(full).size;
    const mb = (size / (1024 * 1024)).toFixed(2);
    present.push(`${name} ${mb}MB`);
    if (size > BANNER_WARN_BYTES) {
      heavy.push(`${name} (${mb}MB)`);
    }
  }

  if (present.length) {
    logger.info(`Banner art: ${present.join(' · ')}`);
  }
  if (missing.length) {
    logger.warn(
      `Banner art missing (panels still work without image): ${missing.join(', ')}`
    );
  }
  if (heavy.length) {
    logger.warn(
      `Banner art >2MB — Discord may lag on slow clients. Prefer ~400×225 under 1.5MB: ${heavy.join(', ')}`
    );
  }
}

function buildPresenceActivities(client) {
  let cardCount = 0;
  try {
    cardCount = DataService.loadCards()?.length || 0;
  } catch {
    /* ignore */
  }

  let activeServers = 0;
  try {
    activeServers = countActiveGuilds(client);
  } catch {
    activeServers = 0;
  }

  const serverLabel =
    activeServers === 1 ? '1 active server' : `${activeServers} active servers`;

  return [
    { name: '/banners', type: ActivityType.Playing },
    { name: '/team · build your eleven', type: ActivityType.Playing },
    { name: '/rank · squad leaderboard', type: ActivityType.Watching },
    {
      name: cardCount > 0 ? `${cardCount} egoists to collect` : 'Goal Bound',
      type: ActivityType.Watching
    },
    {
      name: serverLabel,
      type: ActivityType.Watching
    },
    { name: '/help', type: ActivityType.Listening }
  ];
}

function startPresenceRotation(client) {
  let index = 0;

  const apply = () => {
    const activities = buildPresenceActivities(client);
    const activity = activities[index % activities.length];
    index += 1;
    try {
      client.user.setPresence({
        activities: [activity],
        status: 'online'
      });
    } catch (error) {
      logger.warn('Presence update failed', error.message);
    }
  };

  apply();
  setInterval(apply, PRESENCE_ROTATE_MS);
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.success(`Bot logged in as ${client.user.tag}`);
    logger.info(`Goal Bound v${config.VERSION}`);
    logger.info(
      `Persist: ${config.PERSIST_DIR}` +
        (config.PERSIST_DIR === config.ASSETS_DIR
          ? ' (same as assets — local mode)'
          : ' (volume / PERSIST_DIR)')
    );
    logger.info(`Assets: ${config.ASSETS_DIR}`);
    logger.info(
      `Invite URL`,
      `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=0&scope=bot%20applications.commands`
    );

    try {
      const repair = repairLostEgo();
      if (repair.restored > 0 || repair.renamed > 0) {
        logger.info(
          `repairEgo: restored ${repair.restored} · renamed ${repair.renamed} · users ${repair.users.length}`
        );
      } else {
        logger.info('repairEgo: nothing to fix');
      }
    } catch (error) {
      logger.warn('repairEgo failed', error.message);
    }

    try {
      const { didReset } = ensureServerStatsResetOnce();
      if (didReset) {
        logger.info('Server pull stats reset (owner/tester farm cleared · players only from now on)');
      }
    } catch (error) {
      logger.warn('Server stats reset failed', error.message);
    }

    try {
      installTeamRenderCache();
      logger.info('Team render cache installed (TTL 90s, max 2 concurrent)');
    } catch (error) {
      logger.warn('Team render cache install failed', error.message);
    }

    await registerCommands(client);

    try {
      await runMediaPrep();
    } catch (error) {
      logger.error('mediaPrep: falha inesperada, bot continua subindo normalmente', error.message);
    }

    try {
      auditCardMedia();
    } catch (error) {
      logger.warn('Card media audit failed', error.message);
    }

    try {
      auditBannerArt();
    } catch (error) {
      logger.warn('Banner art audit failed', error.message);
    }

    try {
      await syncCharacterEmojis(client);
    } catch (error) {
      logger.error('emojiSync: falha inesperada ao sincronizar emojis, bot continua subindo normalmente', error.message);
    }

    const alreadyConnected = markAlreadyConnectedUsers(client);
    if (alreadyConnected > 0) {
      logger.info(
        `Voice XP tracking: ${alreadyConnected} pessoa(s) já em call recuperada(s) após restart`
      );
    }

    voiceTracking.startTicking(client);

    try {
      const restored = restoreGateTimers(client);
      if (restored > 0) {
        logger.info(`Gate DM: ${restored} timer(s) restaurado(s) após restart`);
      }
    } catch (error) {
      logger.warn('Gate DM restore failed', error.message);
    }

    try {
      startPlayerDataBackup();
    } catch (error) {
      logger.warn('Player data backup scheduler failed to start', error.message);
    }

    try {
      const info = startWebServer();
      if (info?.url) {
        logger.info(`Leaderboard public URL: ${info.url}`);
      }
    } catch (error) {
      logger.warn('Leaderboard web server failed to start', error.message);
    }

    startPresenceRotation(client);

    try {
      const active = countActiveGuilds(client);
      logger.info(
        `Presence filter: ${active} active server(s) of ${client.guilds.cache.size} total ` +
          `(need /setchannel + ≥10 members + (≥10 msgs today or ≥2 bot users in 7d))`
      );
    } catch {
      /* ignore */
    }

    logger.success('Bot ready!');
  }
};

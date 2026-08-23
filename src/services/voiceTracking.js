const logger = require('../logger/logger.js');
const DataService = require('./DataService.js');
const { applyXpGain } = require('./xpCurve.js');
const { notifyLevelUps } = require('./dmNotifier.js');
const { getVoiceTickRewards } = require('./coachPassives.js');

const VOICE_TICK_INTERVAL_MS = 60 * 1000;

const connectedUsers = new Map();

let intervalHandle = null;
let discordClient = null;

function markConnected(userId, username) {
  connectedUsers.set(userId, { username });
}

function markDisconnected(userId) {
  connectedUsers.delete(userId);
}

async function _tick() {
  for (const [userId, { username }] of connectedUsers) {
    try {
      DataService.ensureUser(userId, username);

      const { xp: xpPerTick, iene: ienePerTick } = getVoiceTickRewards(userId);
      DataService.addIene(userId, ienePerTick);

      const team = DataService.getTeam(userId);
      if (team.length === 0) continue;

      const levelUps = [];

      for (const entry of team) {
        const currentXp = DataService.getCardXp(userId, entry.cardId);
        if (currentXp === null) continue;

        const result = applyXpGain(currentXp, xpPerTick);
        DataService.setCardXp(userId, entry.cardId, result.newTotalXp);

        if (result.leveledUp) {
          DataService.setCardLevel(userId, entry.cardId, result.newLevel);
          levelUps.push({
            cardId: entry.cardId,
            cardName: entry.cardName,
            newLevel: result.newLevel
          });
        }
      }

      if (levelUps.length > 0 && discordClient) {
        logger.info(`Passive XP (voice): ${username}`, `${levelUps.length} level up`);
        try {
          const discordUser = await discordClient.users.fetch(userId);
          await notifyLevelUps(discordUser, levelUps);
        } catch (fetchError) {
          logger.warn(`Could not fetch user ${userId} to send level-up DM`, fetchError.message);
        }
      }
    } catch (error) {
      logger.error(`Error granting voice rewards to ${username} (${userId})`, error.message);
    }
  }
}

function startTicking(client) {
  if (intervalHandle) return;
  discordClient = client;
  intervalHandle = setInterval(_tick, VOICE_TICK_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
  logger.success(`Voice XP tracking started (tick a cada ${VOICE_TICK_INTERVAL_MS / 1000}s)`);
}

function stopTicking() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  markConnected,
  markDisconnected,
  startTicking,
  stopTicking,
  _tick,
  _connectedUsers: connectedUsers
};

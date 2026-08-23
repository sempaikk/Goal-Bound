const { Events } = require('discord.js');
const logger = require('../logger/logger.js');
const DataService = require('../services/DataService.js');
const { applyXpGain } = require('../services/xpCurve.js');
const { notifyLevelUps } = require('../services/dmNotifier.js');
const { isGuildConfigured } = require('../services/guildSettings.js');
const { recordHumanMessage } = require('../services/guildActivity.js');
const { getChatGrantRewards } = require('../services/coachPassives.js');

const MESSAGES_PER_XP_GRANT = 10;
const MIN_MS_BETWEEN_COUNTED_MESSAGES = 3000;
const ANTI_SPAM_TTL_MS = 60 * 60 * 1000;
const ANTI_SPAM_PRUNE_EVERY = 200;

const lastCountedMessageAt = new Map();
let antiSpamOps = 0;

function pruneAntiSpam(now) {
  for (const [id, at] of lastCountedMessageAt) {
    if (now - at > ANTI_SPAM_TTL_MS) lastCountedMessageAt.delete(id);
  }
}

module.exports = {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      if (!isGuildConfigured(message.guild.id)) return;

      try {
        recordHumanMessage(message.guild.id, message.author.id);
      } catch {
        /* ignore */
      }

      const now = Date.now();
      const lastAt = lastCountedMessageAt.get(message.author.id) || 0;
      if (now - lastAt < MIN_MS_BETWEEN_COUNTED_MESSAGES) return;
      lastCountedMessageAt.set(message.author.id, now);

      antiSpamOps += 1;
      if (antiSpamOps >= ANTI_SPAM_PRUNE_EVERY) {
        antiSpamOps = 0;
        pruneAntiSpam(now);
      }

      const userId = message.author.id;
      const username = message.author.username;

      DataService.ensureUser(userId, username);
      const newCount = DataService.incrementMessageCount(userId);

      if (newCount % MESSAGES_PER_XP_GRANT !== 0) return;

      const { xp: xpPerGrant, iene: ienePerGrant } = getChatGrantRewards(userId);
      DataService.addIene(userId, ienePerGrant);

      const team = DataService.getTeam(userId);
      if (team.length === 0) return;

      const levelUps = [];

      for (const entry of team) {
        const currentXp = DataService.getCardXp(userId, entry.cardId);
        if (currentXp === null) continue;

        const result = applyXpGain(currentXp, xpPerGrant);
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

      if (levelUps.length > 0) {
        logger.info(
          `Passive XP (messages): ${username}`,
          `${levelUps.length} level up`
        );
        await notifyLevelUps(message.author, levelUps);
      }
    } catch (error) {
      logger.error('Error in messageCreate (passive rewards tracking)', error.message);
    }
  }
};

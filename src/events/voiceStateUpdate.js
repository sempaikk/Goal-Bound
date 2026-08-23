const { Events } = require('discord.js');
const logger = require('../logger/logger.js');
const voiceTracking = require('../services/voiceTracking.js');
const { isGuildConfigured } = require('../services/guildSettings.js');

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const guildId = newState.guild?.id || oldState.guild?.id;
      // Server must be activated via /setchannel before voice XP runs
      if (!guildId || !isGuildConfigured(guildId)) {
        // If they leave call while unconfigured, still clear tracking
        const wasConnected = !!oldState.channelId;
        const isConnected = !!newState.channelId;
        if (wasConnected && !isConnected) {
          voiceTracking.markDisconnected(member.id);
        }
        return;
      }

      const userId = member.id;
      const username = member.user.username;
      const wasConnected = !!oldState.channelId;
      const isConnected = !!newState.channelId;

      if (!wasConnected && isConnected) {
        voiceTracking.markConnected(userId, username);
        logger.info(`Voice XP tracking: ${username} entrou em call`);
      } else if (wasConnected && !isConnected) {
        voiceTracking.markDisconnected(userId);
        logger.info(`Voice XP tracking: ${username} saiu da call`);
      }
    } catch (error) {
      logger.error('Error in voiceStateUpdate (voice XP tracking)', error.message);
    }
  }
};

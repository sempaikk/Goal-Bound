/**
 * Single pull resolution: add new card or convert duplicate → XP.
 * Locked +15 · Egoist +20 · New Gen +50 · Coach / max level → no XP.
 */
const DataService = require('./DataService.js');

/**
 * @param {string} userId
 * @param {{ id: number, name: string, position?: string }} card
 * @param {string|null} rarity
 * @returns {{
 *   isNew: boolean,
 *   xpGained: number,
 *   leveledUp: boolean,
 *   previousLevel: number|null,
 *   newLevel: number|null,
 *   maxed: boolean
 * }}
 */
function grantPullCard(userId, card, rarity) {
  return DataService.addCardFromPull(userId, card, rarity);
}

function formatDupTag(userId, grant, t) {
  if (!grant || grant.isNew) return ` · ${t(userId, 'ban_new_short')}`;
  if (grant.xpGained > 0 && grant.leveledUp) {
    return ` · ${t(userId, 'ban_dup_xp_up', {
      xp: grant.xpGained,
      from: grant.previousLevel,
      to: grant.newLevel
    })}`;
  }
  if (grant.xpGained > 0) {
    return ` · ${t(userId, 'ban_dup_xp', { xp: grant.xpGained })}`;
  }
  if (grant.maxed) return ` · ${t(userId, 'ban_dup_max')}`;
  return ` · ${t(userId, 'ban_dup_short')}`;
}

function formatDupStatusLine(userId, grant, t) {
  if (!grant || grant.isNew) return `🆕 **${t(userId, 'ban_new')}**`;
  if (grant.xpGained > 0 && grant.leveledUp) {
    return (
      `🔁 **${t(userId, 'ban_dup')}** · **+${grant.xpGained} XP** · ` +
      `Lv.**${grant.previousLevel}**→**${grant.newLevel}**`
    );
  }
  if (grant.xpGained > 0) {
    return `🔁 **${t(userId, 'ban_dup')}** · **+${grant.xpGained} XP**`;
  }
  if (grant.maxed) return `🔁 **${t(userId, 'ban_dup')}** · MAX`;
  return `🔁 **${t(userId, 'ban_dup')}**`;
}

module.exports = {
  grantPullCard,
  formatDupTag,
  formatDupStatusLine
};

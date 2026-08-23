const { getProgressForXp } = require('../services/xpCurve.js');
const { emojiTag, progressBar } = require('./format.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { cardsForBanner } = require('../services/banners.js');
const { getRecentPulls } = require('../services/qolStore.js');
const { RARITIES, RARITY_ORDER } = require('../services/rarities.js');
const DataService = require('../services/DataService.js');
const { rarityLabel, t } = require('./i18n.js');

const ALMOST_THRESHOLD = 3;

function binderByBannerLines(userId, allCards, userCards) {
  const ownedIds = new Set(userCards.map(uc => uc.id));
  const std = cardsForBanner(allCards, 'padrao');
  const coach = cardsForBanner(allCards, 'treinadores');
  const stdOwned = std.filter(c => ownedIds.has(c.id)).length;
  const coachOwned = coach.filter(c => ownedIds.has(c.id)).length;
  const stdPct = std.length ? Math.round((stdOwned / std.length) * 100) : 0;
  const coachPct = coach.length ? Math.round((coachOwned / coach.length) * 100) : 0;
  return (
    `🏟️ **Standard** · **${stdOwned}/${std.length}** (${stdPct}%)\n` +
    `🧠 **Coaches** · **${coachOwned}/${coach.length}** (${coachPct}%)`
  );
}

function almostCompleteLines(userId, allCards, userCards) {
  const ownedIds = new Set(userCards.map(uc => uc.id));
  const lines = [];

  const std = cardsForBanner(allCards, 'padrao');
  if (std.length > 0) {
    const left = std.filter(c => !ownedIds.has(c.id)).length;
    if (left > 0 && left <= ALMOST_THRESHOLD) {
      lines.push(t(userId, left === 1 ? 'qol_almost_std_one' : 'qol_almost_std', { n: left }));
    }
  }

  const coach = cardsForBanner(allCards, 'treinadores');
  if (coach.length > 0) {
    const left = coach.filter(c => !ownedIds.has(c.id)).length;
    if (left > 0 && left <= ALMOST_THRESHOLD) {
      lines.push(t(userId, left === 1 ? 'qol_almost_coach_one' : 'qol_almost_coach', { n: left }));
    }
  }

  return lines.length ? lines.join('\n') : null;
}

function missingByTierLines(userId, allCards, userCards, viewerId) {
  const vid = viewerId || userId;
  const ownedIds = new Set(userCards.map(uc => uc.id));
  const lines = [];

  for (const key of RARITY_ORDER) {
    const pool = allCards.filter(c => c.rarity === key && c.position !== 'CO');
    if (pool.length === 0) continue;
    const owned = pool.filter(c => ownedIds.has(c.id)).length;
    const left = pool.length - owned;
    if (left <= 0) continue;
    const label = rarityLabel(vid, key);
    const emoji = RARITIES[key]?.emoji || '•';
    lines.push(`${emoji} **${label}** · ${t(vid, 'missing_tier', { n: left, total: pool.length })}`);
  }

  const coaches = allCards.filter(c => c.position === 'CO');
  if (coaches.length > 0) {
    const owned = coaches.filter(c => ownedIds.has(c.id)).length;
    const left = coaches.length - owned;
    if (left > 0) {
      lines.push(`🎩 **${t(vid, 'profile_masters')}** · ${t(vid, 'missing_tier', { n: left, total: coaches.length })}`);
    }
  }

  return lines.length ? lines.join('\n') : null;
}

function whoNeedsXpLines(userId, teamRows, limit = 3) {
  if (!teamRows || teamRows.length === 0) return null;

  const candidates = teamRows
    .map(entry => ({
      entry,
      progress: getProgressForXp(DataService.getCardXp(userId, entry.cardId) ?? 0)
    }))
    .filter(({ progress }) => !progress.isMaxLevel)
    .map(c => ({
      ...c,
      ratio: c.progress.xpNeededForNextLevel > 0
        ? c.progress.xpIntoCurrentLevel / c.progress.xpNeededForNextLevel
        : 0
    }))
    .sort((a, b) => b.ratio - a.ratio);

  if (candidates.length === 0) return t(userId, 'qol_lineup_maxed');

  return candidates.slice(0, limit).map(({ entry, progress, ratio }) => {
    const pct = Math.round(ratio * 100);
    const icon = emojiTag(getEmojiForCard(entry.cardId)) || '📊';
    return (
      `${icon} **${entry.cardName}** · Lv.**${progress.level}** → **${progress.level + 1}** (${pct}%)\n` +
      `${progressBar(progress.xpIntoCurrentLevel, progress.xpNeededForNextLevel, 10)}`
    );
  }).join('\n');
}

function recentPullsLines(userId, limit = 5) {
  const list = getRecentPulls(userId, limit);
  if (!list.length) return t(userId, 'qol_no_pulls');
  return list.map((p, i) => {
    const icon = emojiTag(getEmojiForCard(p.cardId)) || '•';
    const pool = p.banner === 'treinadores' ? '🧠' : '🏟️';
    return `**${i + 1}.** ${icon} **${p.name}** ${pool}`;
  }).join('\n');
}

function poolCompleteHint(bannerId, userId, allCards) {
  const otherId = bannerId === 'treinadores' ? 'padrao' : 'treinadores';
  const other = cardsForBanner(allCards, otherId);
  const owned = new Set(DataService.getValidUserCards(userId, allCards).map(c => c.id));
  const otherOwned = other.filter(c => owned.has(c.id)).length;
  if (bannerId === 'padrao') {
    if (otherOwned >= other.length && other.length > 0) {
      return t(userId, 'qol_std_done_both');
    }
    return t(userId, 'qol_std_done', { owned: otherOwned, total: other.length });
  }
  if (otherOwned >= other.length && other.length > 0) {
    return t(userId, 'qol_coach_done_both');
  }
  return t(userId, 'qol_coach_done', { owned: otherOwned, total: other.length });
}

module.exports = {
  binderByBannerLines,
  almostCompleteLines,
  missingByTierLines,
  whoNeedsXpLines,
  recentPullsLines,
  poolCompleteHint,
  ALMOST_THRESHOLD
};

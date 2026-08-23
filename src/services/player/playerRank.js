/**
 * Earned player ranks (not staff titles).
 * Rookie → Prospect → Regular → Elite → Ace → Legend
 */

const RANKS = [
  { key: 'ROOKIE', label: 'Rookie', emoji: '🌱', minScore: 0 },
  { key: 'PROSPECT', label: 'Prospect', emoji: '📍', minScore: 15 },
  { key: 'REGULAR', label: 'Regular', emoji: '⚽', minScore: 35 },
  { key: 'ELITE', label: 'Elite', emoji: '🔥', minScore: 55 },
  { key: 'ACE', label: 'Ace', emoji: '⭐', minScore: 75 },
  { key: 'LEGEND', label: 'Legend', emoji: '🏆', minScore: 95 }
];

function getPlayerRank({ owned, poolSize, teamAvgLevel = 0, teamSize = 0 }) {
  const binderPct = poolSize > 0 ? (owned / poolSize) * 100 : 0;
  const teamBoost =
    teamSize > 0 ? Math.min(15, (Math.max(0, teamAvgLevel) / 100) * 15) : 0;
  const score = Math.min(100, binderPct + teamBoost);

  let rank = RANKS[0];
  for (const r of RANKS) {
    if (score >= r.minScore) rank = r;
  }

  const idx = RANKS.findIndex(r => r.key === rank.key);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  let progressToNext = 100;
  if (next) {
    const span = next.minScore - rank.minScore;
    progressToNext =
      span > 0
        ? Math.max(0, Math.min(100, Math.round(((score - rank.minScore) / span) * 100)))
        : 100;
  }

  return {
    key: rank.key,
    label: rank.label,
    emoji: rank.emoji,
    score: Math.round(score),
    next: next
      ? { key: next.key, label: next.label, emoji: next.emoji, minScore: next.minScore }
      : null,
    progressToNext
  };
}

module.exports = { RANKS, getPlayerRank };

/**
 * Global squad leaderboard — computed live from SQLite + coach store.
 */

const DataService = require('./DataService.js');
const { computeSquadScore } = require('./squadScore.js');
const { getWeeklyClimbers } = require('./leaderboardSnapshots.js');

/** Discord default avatar index (new username system). */
function avatarUrl(userId) {
  try {
    const idx = Number((BigInt(String(userId)) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

function listUsersWithTeam() {
  try {
    return DataService.db
      .prepare(
        `SELECT DISTINCT u.id as userId, u.name as username
         FROM users u
         INNER JOIN user_team t ON t.user_id = u.id`
      )
      .all()
      .map(r => ({
        userId: String(r.userId),
        username: String(r.username || 'Player')
      }));
  } catch {
    return [];
  }
}

/**
 * @param {{ limit?: number, minFilled?: number }} [opts]
 */
function getLeaderboard(opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 100));
  const minFilled = Math.max(0, Number(opts.minFilled) || 1);

  const users = listUsersWithTeam();
  const scored = [];

  for (const u of users) {
    const s = computeSquadScore(u.userId);
    if (s.filled < minFilled) continue;
    scored.push({
      userId: u.userId,
      username: u.username,
      avatar: avatarUrl(u.userId),
      score: s.score,
      filled: s.filled,
      isComplete: s.isComplete,
      avgLevel: s.avgLevel,
      coachShort: s.coachShort,
      formationLabel: s.formationLabel
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.filled !== a.filled) return b.filled - a.filled;
    if (b.avgLevel !== a.avgLevel) return b.avgLevel - a.avgLevel;
    return a.username.localeCompare(b.username);
  });

  const entries = scored.slice(0, limit).map((e, i) => ({
    rank: i + 1,
    ...e
  }));

  let weekly = { weekKey: '', frozenAt: '', climbers: [] };
  try {
    weekly = getWeeklyClimbers(entries, 5);
  } catch {
    /* ignore */
  }

  return {
    updatedAt: new Date().toISOString(),
    total: scored.length,
    entries,
    weekly
  };
}

function getUserRank(userId) {
  const uid = String(userId);
  const board = getLeaderboard({ limit: 100, minFilled: 1 });
  const entry = board.entries.find(e => e.userId === uid) || null;
  const score = computeSquadScore(uid);
  return {
    rank: entry ? entry.rank : null,
    total: board.total,
    entry,
    score
  };
}

module.exports = {
  getLeaderboard,
  getUserRank,
  listUsersWithTeam,
  avatarUrl
};

/**
 * Soft per-user cooldown for slash commands.
 * Keeps the bot responsive while limiting spam on a self-hosted machine.
 */

const lastUse = new Map();

/** @type {Record<string, number>} ms */
const COOLDOWN_MS = {
  profile: 3_000,
  collection: 3_000,
  team: 3_000,
  help: 3_000,
  banners: 3_000,
  daily: 3_000,
  stats: 5_000,
  setchannel: 5_000,
  leaderboard: 3_000
  // reload: owner-only — no limit
};

const DEFAULT_MS = 3_000;

function cooldownFor(commandName) {
  const name = String(commandName || '');
  if (!name) return DEFAULT_MS;
  if (Object.prototype.hasOwnProperty.call(COOLDOWN_MS, name)) {
    return COOLDOWN_MS[name];
  }
  return DEFAULT_MS;
}

/**
 * @returns {{ ok: true } | { ok: false, remainingMs: number }}
 */
function checkCommandRate(userId, commandName) {
  const id = String(userId || '');
  const name = String(commandName || '');
  if (!id || !name) return { ok: true };

  // Owner-only / admin tooling: skip
  if (name === 'reload') return { ok: true };

  const ms = cooldownFor(name);
  if (ms <= 0) return { ok: true };

  const key = `${id}:${name}`;
  const now = Date.now();
  const prev = lastUse.get(key) || 0;
  const elapsed = now - prev;

  if (elapsed < ms) {
    return { ok: false, remainingMs: ms - elapsed };
  }

  lastUse.set(key, now);

  // Bound memory
  if (lastUse.size > 8_000) {
    const cutoff = now - 60_000;
    for (const [k, t] of lastUse) {
      if (t < cutoff) lastUse.delete(k);
    }
  }

  return { ok: true };
}

module.exports = {
  checkCommandRate,
  COOLDOWN_MS,
  cooldownFor
};

/**
 * Opt-in DM when the banner gate opens again.
 * Due times are stored in qol-store so they survive bot restarts.
 */
const logger = require('../../logger/logger.js');
const {
  isGateNotify,
  setGateDue,
  clearGateDue,
  listGateDues
} = require('../qolStore.js');
const { t } = require('../../utils/i18n.js');

/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

async function sendGateOpenDm(client, userId) {
  clearGateDue(userId);
  if (!isGateNotify(userId)) return;
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content: t(userId, 'gate_dm_body') });
  } catch (err) {
    logger.warn(`Gate DM failed for ${userId}`, err.message);
  }
}

function scheduleGateOpenDm(client, userId, delayMs) {
  if (!client || !userId || delayMs <= 0) return;
  if (!isGateNotify(userId)) return;

  const openAt = Date.now() + delayMs;
  setGateDue(userId, openAt);

  const prev = timers.get(userId);
  if (prev) clearTimeout(prev);

  const handle = setTimeout(async () => {
    timers.delete(userId);
    await sendGateOpenDm(client, userId);
  }, delayMs);

  if (typeof handle.unref === 'function') handle.unref();
  timers.set(userId, handle);
}

function cancelGateOpenDm(userId) {
  const prev = timers.get(userId);
  if (prev) {
    clearTimeout(prev);
    timers.delete(userId);
  }
  clearGateDue(userId);
}

function restoreGateTimers(client) {
  if (!client) return 0;
  let n = 0;
  const now = Date.now();
  for (const { userId, openAt } of listGateDues()) {
    if (!isGateNotify(userId)) {
      clearGateDue(userId);
      continue;
    }
    const delay = openAt - now;
    if (delay <= 0) {
      setTimeout(() => {
        sendGateOpenDm(client, userId).catch(() => {});
      }, 2000 + n * 500);
      n += 1;
      continue;
    }
    const prev = timers.get(userId);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(async () => {
      timers.delete(userId);
      await sendGateOpenDm(client, userId);
    }, delay);
    if (typeof handle.unref === 'function') handle.unref();
    timers.set(userId, handle);
    n += 1;
  }
  return n;
}

module.exports = {
  scheduleGateOpenDm,
  cancelGateOpenDm,
  restoreGateTimers
};

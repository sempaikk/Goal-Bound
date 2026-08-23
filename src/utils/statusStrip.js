/**
 * Fixed visual order for banner economy lines:
 * 1) Cost / balance
 * 2) Gate
 * 3) Pity (Standard only)
 *
 * Must match banners.js SUMMON_COOLDOWN_MS (1 minute).
 */
const { formatDuration } = require('./format.js');
const { getPity, PITY_SOFT } = require('../services/qolStore.js');
const { isPrivileged } = require('../services/staff.js');
const DataService = require('../services/DataService.js');
const { t } = require('./i18n.js');

/** Keep in sync with src/commands/banners.js */
const SUMMON_COOLDOWN_MS = 60 * 1000;
const SUMMON_COST_IENE = 1;

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} [opts.bannerId]
 * @param {number} [opts.remainingMs]
 * @param {number} [opts.ieneBalance]
 * @param {number} [opts.cost]
 */
function buildStatusStrip(opts) {
  const userId = opts.userId;
  const bannerId = opts.bannerId || 'padrao';
  const privileged = isPrivileged(userId);
  const bal = opts.ieneBalance != null ? opts.ieneBalance : DataService.getIene(userId);
  const remainingMs =
    opts.remainingMs != null
      ? opts.remainingMs
      : privileged
        ? 0
        : DataService.getSummonCooldownRemaining(userId, SUMMON_COOLDOWN_MS);
  const cost = opts.cost != null ? opts.cost : SUMMON_COST_IENE;

  const costLine = privileged
    ? `💰 **${t(userId, 'strip_cost_free')}** · ${t(userId, 'balance')} **${bal.toLocaleString('en-US')}**`
    : `💰 **${cost}** Iene ${t(userId, 'cost_per_roll')} · ${t(userId, 'balance')} **${bal.toLocaleString('en-US')}**`;

  let gateLine;
  if (privileged) {
    gateLine = `⏱️ ${t(userId, 'gate_open')} · ${t(userId, 'strip_no_cd')}`;
  } else if (remainingMs > 0) {
    const readyUnix = Math.floor((Date.now() + remainingMs) / 1000);
    gateLine =
      `⏱️ ${t(userId, 'gate_closed')} · <t:${readyUnix}:R> (${formatDuration(remainingMs)})`;
  } else {
    gateLine = `⏱️ ${t(userId, 'gate_open')} · ${t(userId, 'strip_can_roll')}`;
  }

  const lines = [costLine, gateLine];

  if (bannerId === 'padrao') {
    const p = getPity(userId);
    lines.push(`🔥 **${t(userId, 'pity')}:** **${p}/${PITY_SOFT}** → New Gen`);
  }

  return lines.join('\n');
}

module.exports = {
  buildStatusStrip,
  SUMMON_COOLDOWN_MS,
  SUMMON_COST_IENE
};

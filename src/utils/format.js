/**
 * Text helpers shared across commands.
 */

const config = require('../config/config.js');

function safeTruncate(text, maxLength) {
  const str = text === null || text === undefined ? '' : String(text);
  if (str.length <= maxLength) return str;
  return str.slice(0, Math.max(0, maxLength - 1)) + '\u2026';
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function progressBar(current, total, length = 10) {
  if (total <= 0) {
    return `${'\u25B1'.repeat(length)} 0/0 (0%)`;
  }

  const clampedCurrent = Math.max(0, Math.min(current, total));
  const ratio = clampedCurrent / total;
  const filledCount = Math.round(ratio * length);
  const emptyCount = length - filledCount;
  const percent = Math.round(ratio * 100);

  return `${'\u25B0'.repeat(filledCount)}${'\u25B1'.repeat(emptyCount)} ${clampedCurrent}/${total} (${percent}%)`;
}

/** Discord snowflake: 17–20 digits. Stale/invalid IDs render as :name: in chat. */
function emojiTag(emoji) {
  if (!emoji || !emoji.id || !emoji.name) return '';
  const id = String(emoji.id);
  if (!/^\d{17,20}$/.test(id)) return '';
  const name = String(emoji.name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
  if (!name) return '';
  return `<:${name}:${id}>`;
}

/** One glyph per role family */
const POSITION_EMOJIS = {
  GK: '\uD83E\uDD4E',
  DF: '\uD83E\uDDF1',
  MF: '\uD83C\uDFB9',
  FW: '\uD83D\uDCA5',
  CO: '\uD83C\uDFA9'
};

function positionEmoji(position) {
  return POSITION_EMOJIS[position] || '\u2754';
}

function brandFooter(context) {
  const brand = config.BRAND?.FOOTER || 'Goal Bound';
  const ctx = context === null || context === undefined ? '' : String(context).trim();
  if (!ctx) return brand;
  const combined = `${ctx} \u00b7 ${brand}`;
  return combined.length > 2048 ? combined.slice(0, 2047) + '\u2026' : combined;
}

module.exports = {
  safeTruncate,
  formatDuration,
  progressBar,
  emojiTag,
  positionEmoji,
  brandFooter
};

/**
 * Renders a collection catalog page: dark list rows with mini card art on the right.
 * Matches the "catalog with thumbnail" look (text left, card right).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const logger = require('../logger/logger.js');

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

const W = 720;
const ROW_H = 118;
const PAD = 16;
const CARD_W = 78;
const CARD_H = 104;
const THUMB_CACHE = new Map();
const THUMB_CACHE_MAX = 80;

const RARITY_COLOR = {
  NEW_GEN: '#FFD166',
  EGOISTA: '#A78BFA',
  LOCKED: '#94A3B8',
  COACH: '#F472B6'
};

function ovrFromStats(card) {
  const s = card?.stats;
  if (!s) return 70;
  const vals = [s.speed, s.technique, s.physique, s.tactical].filter(n => typeof n === 'number');
  if (!vals.length) return 70;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.min(99, Math.max(50, Math.round(50 + avg * 4.5)));
}

function resolveArtPath(card) {
  if (card?.localImage) {
    const full = path.join(IMAGES_DIR, card.localImage);
    if (fs.existsSync(full)) return full;
  }
  if (card?.icon) {
    const full = path.join(ICONS_DIR, card.icon);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function thumbBuffer(card) {
  const key = String(card.id);
  const hit = THUMB_CACHE.get(key);
  if (hit) return hit;

  const artPath = resolveArtPath(card);
  let buf;

  if (artPath) {
    try {
      buf = await sharp(artPath, { animated: false, pages: 1 })
        .ensureAlpha()
        .resize(CARD_W, CARD_H, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
    } catch (err) {
      logger.warn(`catalog thumb fail ${card.name}`, err.message);
      buf = null;
    }
  }

  if (!buf) {
    const initials = String(card.name || '?')
      .split(/\s+/)
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const svg = `<svg width="${CARD_W}" height="${CARD_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1a1f2e" rx="8"/>
      <text x="50%" y="54%" text-anchor="middle" fill="#e2e8f0" font-size="28" font-family="Arial,sans-serif" font-weight="700">${initials}</text>
    </svg>`;
    buf = await sharp(Buffer.from(svg)).png().toBuffer();
  }

  if (THUMB_CACHE.size >= THUMB_CACHE_MAX) {
    const oldest = THUMB_CACHE.keys().next().value;
    THUMB_CACHE.delete(oldest);
  }
  THUMB_CACHE.set(key, buf);
  return buf;
}

/**
 * @param {Array<{card: object, level: number, index: number, onTeam: boolean}>} rows
 * @param {{ page: number, totalPages: number, total: number, username: string }} meta
 */
async function renderCatalogPage(rows, meta) {
  const n = Math.max(1, rows.length);
  const H = PAD * 2 + n * ROW_H + 36;

  const composites = [];
  const labelParts = [];

  for (let i = 0; i < rows.length; i++) {
    const { card, level, index, onTeam } = rows[i];
    const y = PAD + i * ROW_H;
    const ovr = ovrFromStats(card);
    const isCoach = card.position === 'CO';
    const rarityKey = isCoach ? 'COACH' : card.rarity || 'LOCKED';
    const accent = RARITY_COLOR[rarityKey] || '#94A3B8';
    const pos = isCoach ? 'CO' : String(card.position || '?');

    // Row background strip
    labelParts.push(`
      <rect x="0" y="${y}" width="${W}" height="${ROW_H - 6}" fill="#0f1419" rx="10"/>
      <rect x="0" y="${y}" width="4" height="${ROW_H - 6}" fill="${accent}" rx="2"/>
      <text x="20" y="${y + 32}" fill="#64748b" font-size="18" font-family="Arial,sans-serif" font-weight="700">${index}.</text>
      <text x="56" y="${y + 32}" fill="#f1f5f9" font-size="20" font-family="Arial,sans-serif" font-weight="700">${escapeXml(card.name)}</text>
      <text x="56" y="${y + 58}" fill="#94a3b8" font-size="14" font-family="Arial,sans-serif">${pos} · OVR ${ovr}${isCoach ? '' : ` · Lv.${level}`}${onTeam ? ' · 📌' : ''}</text>
      <text x="56" y="${y + 80}" fill="#475569" font-size="12" font-family="Arial,sans-serif">ID:${card.id}</text>
    `);

    const thumb = await thumbBuffer(card);
    composites.push({
      input: thumb,
      left: W - PAD - CARD_W - 4,
      top: y + 4
    });
  }

  const footerY = H - 22;
  labelParts.push(`
    <text x="${W / 2}" y="${footerY}" text-anchor="middle" fill="#64748b" font-size="13" font-family="Arial,sans-serif">
      Página ${meta.page + 1}/${meta.totalPages} — ${meta.total} no binder · ${escapeXml(meta.username || '')}
    </text>
  `);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0a0c10"/>
    ${labelParts.join('')}
  </svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(base).composite(composites).png().toBuffer();
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

module.exports = {
  renderCatalogPage,
  ovrFromStats,
  CARDS_PER_PAGE_CATALOG: 5
};

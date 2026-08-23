/**
 * FUT-style trading card renderer.
 *
 * Few static ideas, lots of runtime compose:
 * - Frame colors / chrome by rarity (no per-character template)
 * - Face from data/icons (or localImage fallback)
 * - Name, position, OVR, 4 core stats scaled to FUT-like 0–99
 *
 * Output: PNG buffer ready for Discord attachments.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config/config.js');

const W = 420;
const H = 600;

const ICONS_DIR = path.join(config.ASSETS_DIR, 'icons');
const IMAGES_DIR = path.join(config.ASSETS_DIR, 'images');

/** @type {Record<string, { accent: string, accent2: string, label: string, glow: string }> } */
const RARITY_THEME = {
  LOCKED: {
    accent: '#9AA4B2',
    accent2: '#5C6675',
    label: 'LOCKED',
    glow: 'rgba(154,164,178,0.45)'
  },
  EGOISTA: {
    accent: '#F5B942',
    accent2: '#C47A12',
    label: 'EGOIST',
    glow: 'rgba(245,185,66,0.55)'
  },
  NEW_GEN: {
    accent: '#FF4D8D',
    accent2: '#A01555',
    label: 'NEW GEN',
    glow: 'rgba(255,77,141,0.55)'
  },
  COACH: {
    accent: '#7C5CFF',
    accent2: '#3B2A8C',
    label: 'MASTER',
    glow: 'rgba(124,92,255,0.5)'
  }
};

function themeFor(card) {
  const r = String(card.rarity || '').toUpperCase();
  if (RARITY_THEME[r]) return RARITY_THEME[r];
  if (card.banner === 'treinadores' || card.position === 'CO') {
    return RARITY_THEME.COACH;
  }
  return RARITY_THEME.LOCKED;
}

/** Map internal 1–10 (or missing) → FUT-like 40–99 */
function to99(n, fallback = 60) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  if (v > 10) return Math.min(99, Math.round(v));
  return Math.min(99, Math.max(40, Math.round(40 + v * 5.9)));
}

function deriveStats(card) {
  const s = card.stats || {};
  const pac = to99(s.speed, 65);
  const tec = to99(s.technique, 65);
  const phy = to99(s.physique, 65);
  const tac = to99(s.tactical, 65);

  // Extra FUT columns derived from role so the bar looks complete
  const pos = String(card.position || 'FW').toUpperCase();
  let sho = Math.round((tec + phy) / 2);
  let pas = Math.round((tec + tac) / 2);
  let dri = tec;
  let def = Math.round((tac + phy) / 2);

  if (pos === 'FW' || pos === 'ATA') {
    sho = Math.min(99, sho + 4);
    def = Math.max(40, def - 8);
  } else if (pos === 'MF' || pos === 'MC' || pos === 'ME' || pos === 'MD') {
    pas = Math.min(99, pas + 4);
  } else if (pos === 'DF' || pos === 'ZAG') {
    def = Math.min(99, def + 6);
    sho = Math.max(40, sho - 6);
  } else if (pos === 'GK') {
    def = Math.min(99, Math.round((phy + tac) / 2) + 5);
    sho = Math.max(40, sho - 15);
  }

  const ovr = Math.min(
    99,
    Math.round((pac + sho + pas + dri + def + phy) / 6)
  );

  return {
    ovr,
    rows: [
      ['PAC', pac],
      ['SHO', sho],
      ['PAS', pas],
      ['DRI', dri],
      ['DEF', def],
      ['PHY', phy]
    ]
  };
}

function resolveFacePath(card) {
  if (card.icon) {
    const p = path.join(ICONS_DIR, card.icon);
    if (fs.existsSync(p)) return p;
  }
  if (card.localImage) {
    const p = path.join(IMAGES_DIR, card.localImage);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function shortName(name) {
  const n = String(name || 'Unknown').trim();
  if (n.length <= 18) return n;
  return n.slice(0, 17) + '…';
}

function buildChromeSvg(card, stats, theme) {
  const pos = String(card.position || '—').toUpperCase();
  const rarity = theme.label;
  const name = shortName(card.name);

  const statBlocks = stats.rows
    .map(([lab, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 48 + col * 110;
      const y = 455 + row * 52;
      return `
      <text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#B8C0CC" font-weight="700">${lab}</text>
      <text x="${x + 48}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#FFFFFF" font-weight="800">${val}</text>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1A1520"/>
      <stop offset="55%" stop-color="#121018"/>
      <stop offset="100%" stop-color="#0B0A10"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.accent}"/>
      <stop offset="100%" stop-color="${theme.accent2}"/>
    </linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2A2435"/>
      <stop offset="100%" stop-color="#16121C"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- outer frame -->
  <rect x="0" y="0" width="${W}" height="${H}" rx="28" fill="url(#frame)"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="22" fill="url(#bg)"/>

  <!-- soft glow behind face window -->
  <ellipse cx="210" cy="200" rx="150" ry="130" fill="${theme.glow}"/>

  <!-- face window border -->
  <rect x="48" y="72" width="324" height="300" rx="18" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.85"/>

  <!-- OVR + POS block -->
  <rect x="28" y="28" width="92" height="88" rx="14" fill="url(#plate)" stroke="${theme.accent}" stroke-width="2"/>
  <text x="74" y="72" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#FFFFFF" font-weight="900">${stats.ovr}</text>
  <text x="74" y="98" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${theme.accent}" font-weight="800">${escapeXml(pos)}</text>

  <!-- rarity ribbon -->
  <rect x="130" y="36" width="240" height="32" rx="10" fill="${theme.accent2}" opacity="0.95"/>
  <text x="250" y="58" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#FFFFFF" font-weight="800" letter-spacing="2">${escapeXml(rarity)}</text>

  <!-- name plate -->
  <rect x="28" y="392" width="364" height="44" rx="12" fill="url(#plate)" stroke="${theme.accent}" stroke-width="1.5"/>
  <text x="210" y="421" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#FFFFFF" font-weight="800">${escapeXml(name)}</text>

  <!-- stats panel -->
  <rect x="28" y="444" width="364" height="120" rx="14" fill="url(#plate)" stroke="${theme.accent2}" stroke-width="1.5" opacity="0.98"/>
  ${statBlocks}

  <!-- brand footer -->
  <text x="210" y="582" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#6B7280" font-weight="600" letter-spacing="1.5">GOAL BOUND</text>
</svg>`;
}

/**
 * @param {object} card  entry from cards.json
 * @param {{ level?: number }} [opts]
 * @returns {Promise<Buffer|null>} PNG buffer
 */
async function renderCard(card, opts = {}) {
  if (!card || !card.name) return null;

  const theme = themeFor(card);
  const stats = deriveStats(card);
  const chrome = Buffer.from(buildChromeSvg(card, stats, theme));

  const layers = [
    { input: await sharp(chrome).png().toBuffer(), top: 0, left: 0 }
  ];

  const facePath = resolveFacePath(card);
  if (facePath) {
    try {
      const faceBuf = await sharp(facePath, { animated: false })
        .resize(300, 280, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      layers.push({ input: faceBuf, top: 82, left: 60 });
    } catch {
      /* face optional — card still renders chrome */
    }
  }

  // level badge (optional)
  if (opts.level != null && Number.isFinite(Number(opts.level))) {
    const lv = Math.max(0, Math.min(100, Math.round(Number(opts.level))));
    const badge = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="36" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="36" rx="10" fill="#0B0A10" fill-opacity="0.85" stroke="${theme.accent}" stroke-width="2"/>
  <text x="50" y="24" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#FFFFFF" font-weight="800">Lv.${lv}</text>
</svg>`);
    layers.push({
      input: await sharp(badge).png().toBuffer(),
      top: 330,
      left: 300
    });
  }

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(layers)
    .png({ compressionLevel: 8 })
    .toBuffer();
}

module.exports = {
  renderCard,
  deriveStats,
  themeFor,
  CARD_W: W,
  CARD_H: H
};

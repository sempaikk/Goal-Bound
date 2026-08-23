const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const logger = require('../logger/logger.js');
const { FORMATIONS } = require('./formations.js');
const { bitmapTextSvg } = require('./pitchBitmapFont.js');

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const PITCH_PATH = path.join(__dirname, '..', '..', 'data', 'images', 'team', 'pitch.jpg');
const PITCH_PATH_PNG = path.join(__dirname, '..', '..', 'data', 'images', 'team', 'pitch.png');

const W = 820;
const H = 1180;

const HEAD = 96;
const HEAD_R = HEAD / 2;

const RING_OUTER = 4.5;
const RING_INNER = 2;

const NAME_GAP = 12;

const ATT_Y = 230;
const MID_Y = 520;
const DEF_Y = 800;
const GK_Y = 1005;

const FIELD = {
  left: 70,
  right: W - 70,
  top: 90,
  bottom: H - 90
};

const CX = (FIELD.left + FIELD.right) / 2;
const FW = FIELD.right - FIELD.left;

const LINE = {
  ATT: { stroke: '#FF4D8D', glow: '#FF4D8D' },
  MID: { stroke: '#FFB020', glow: '#FFB020' },
  DEF: { stroke: '#00E5C3', glow: '#00E5C3' },
  GK: { stroke: '#A78BFA', glow: '#A78BFA' }
};

const CROP_BIAS = {
  'shidou.png': 0.74,
  'gagamaru.png': 0.72,
  'kunigami.png': 0.76,
  'bachira.png': 0.79,
  'rin.png': 0.8,
  'nagi.png': 0.81,
  'reo.png': 0.79,
  'sae.png': 0.78,
  'hiori.png': 0.8,
  'karasu.png': 0.79,
  'otoya.png': 0.79,
  'isagi.png': 0.81,
  'kiyora.png': 0.82,
  'chigiri.png': 0.8,
  'zantetsu.png': 0.8,
  'raichi.png': 0.79,
  'barou.png': 0.78,
  'niko.png': 0.8,
  'kuon.png': 0.8,
  'igarashi.png': 0.8,
  'tokimitsu.png': 0.78,
  'keisuke.png': 0.8,
  'ego.png': 0.8,
  'noa.png': 0.8,
  'lavinho.png': 0.8,
  'snuffy.png': 0.8
};

const LINE_Y = { ATT: ATT_Y, MID: MID_Y, DEF: DEF_Y, GK: GK_Y };

const HEAD_CACHE = new Map();
const HEAD_CACHE_MAX = 80;
const PLACEHOLDER_CACHE = new Map();
let pitchBufferCache = null;
let pitchPathUsed = null;

function resolveSlots(formationId) {
  const f = FORMATIONS[formationId] || FORMATIONS['4-3-3'];
  return f.slots.map(s => ({
    key: s.key,
    label: s.label,
    line: s.line,
    x: CX + FW * s.xRatio,
    y: LINE_Y[s.line] + (s.yBias || 0)
  }));
}

const SLOTS = resolveSlots('4-3-3');

function lineOf(key, slots) {
  const found = (slots || SLOTS).find(s => s.key === key);
  if (found) return found.line;
  if (['LW', 'ST', 'RW', 'ST1', 'ST2', 'CAM'].includes(key)) return 'ATT';
  if (['LM', 'CM', 'RM', 'CM1', 'CM2', 'CM3', 'LWB', 'RWB', 'CDM1', 'CDM2'].includes(key)) return 'MID';
  if (['LB', 'CB1', 'CB2', 'CB3', 'RB'].includes(key)) return 'DEF';
  return 'GK';
}

function splitName(card, fallback) {
  if (!card) return { first: fallback, rest: '' };
  const p = String(card.name || '').trim().split(/\s+/);
  return {
    first: (p[0] || fallback).toUpperCase(),
    rest: p.slice(1).join(' ').toUpperCase()
  };
}

function initialsFromName(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'XX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function slotItems(teamMap, slots) {
  return slots.map(slot => {
    const card = teamMap.get(slot.key);
    const lk = lineOf(slot.key, slots);
    const { first, rest } = splitName(card, slot.label);
    return {
      slot,
      card,
      color: LINE[lk],
      first,
      rest,
      level: card ? (card.level ?? 0) : null
    };
  });
}

async function loadPitchBuffer() {
  if (pitchBufferCache) return pitchBufferCache;
  const candidates = [PITCH_PATH, PITCH_PATH_PNG];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      pitchBufferCache = await sharp(p)
        .resize(W, H, { fit: 'cover', position: 'centre' })
        .ensureAlpha()
        .png()
        .toBuffer();
      pitchPathUsed = p;
      logger.info(`Team pitch: using ${path.basename(p)}`);
      return pitchBufferCache;
    } catch (err) {
      logger.warn(`Team pitch load failed (${path.basename(p)})`, err.message);
    }
  }
  return null;
}

function buildOverlaySvg(teamMap, slots, formationLabel) {
  const filled = [...teamMap.values()].filter(Boolean).length;
  const ready = filled === 11;
  const items = slotItems(teamMap, slots);

  const shadows = items
    .map(({ slot, card, color }) => {
      if (!card) return '';
      const sy = slot.y + HEAD_R + 2;
      return `\n        <ellipse cx="${slot.x}" cy="${sy}" rx="${HEAD_R * 0.92}" ry="${HEAD_R * 0.26}"\n          fill="${color.glow}" opacity="0.18" filter="url(#blurSoft)"/>\n        <ellipse cx="${slot.x}" cy="${sy + 2}" rx="${HEAD_R * 0.82}" ry="${HEAD_R * 0.20}"\n          fill="#000" opacity="0.45" filter="url(#blurSoft)"/>`;
    })
    .join('');

  const rings = items
    .map(({ slot, card, color }) => {
      if (!card) {
        return `\n          <circle cx="${slot.x}" cy="${slot.y}" r="${HEAD_R + 4}"\n            fill="rgba(6,10,14,0.62)" stroke="${color.stroke}" stroke-width="4.2"\n            stroke-opacity="0.98"/>\n          <circle cx="${slot.x}" cy="${slot.y}" r="${HEAD_R - 0.5}"\n            fill="none" stroke="rgba(255,255,255,0.82)" stroke-width="2.2"/>`;
      }
      const outerR = HEAD_R + RING_OUTER + 1.5;
      const innerR = HEAD_R + 1.2;
      return `\n        <circle cx="${slot.x}" cy="${slot.y}" r="${outerR + 5}"\n          fill="none" stroke="${color.glow}" stroke-width="8" opacity="0.12"\n          filter="url(#blurSoft)"/>\n        <circle cx="${slot.x}" cy="${slot.y}" r="${outerR}"\n          fill="none" stroke="${color.stroke}" stroke-width="${RING_OUTER}"/>\n        <circle cx="${slot.x}" cy="${slot.y}" r="${innerR}"\n          fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="${RING_INNER}"/>`;
    })
    .join('');

  const status = ready ? 'READY' : `${filled}/11`;
  const statusColor = ready ? '#3DDC97' : '#F6F6F8';
  const formLabel = String(formationLabel || '4-3-3').replace(/[^0-9A-Za-z\-]/g, '');

  const hudY = H - 42;
  const hud = `\n    <g filter="url(#drop)">\n      <rect x="${CX - 116}" y="${H - 64}" width="232" height="44" rx="22"\n        fill="#090C11" fill-opacity="0.92" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>\n      ${bitmapTextSvg(formLabel, CX - 48, hudY, 1.6, '#F6F6F8')}\n      <circle cx="${CX + 8}" cy="${hudY}" r="1.5" fill="rgba(255,255,255,0.45)"/>\n      ${bitmapTextSvg(status, CX + 55, hudY, 1.6, statusColor)}\n    </g>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">\n    <defs>\n      <filter id="blurSoft" x="-60%" y="-60%" width="220%" height="220%">\n        <feGaussianBlur in="SourceGraphic" stdDeviation="4"/>\n      </filter>\n      <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">\n        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/>\n      </filter>\n    </defs>\n    ${shadows}\n    ${rings}\n    ${hud}\n  </svg>`;
}

function buildFallbackBaseSvg() {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">\n    <rect width="${W}" height="${H}" fill="#0C372C"/>\n    ${bitmapTextSvg('NO PITCH', CX, H / 2, 3, '#FFFFFF')}\n  </svg>`;
}

function buildNamesSvg(teamMap, slots) {
  const items = slotItems(teamMap, slots);

  const names = items
    .map(({ slot, card, first, rest, level, color }) => {
      const plateTop = slot.y + HEAD_R + NAME_GAP;

      if (!card) {
        const label = String(first || slot.label || '?').slice(0, 6);
        const plateW = Math.max(52, label.length * 10 + 20);
        const plateH = 22;
        return `\n          <rect x="${slot.x - plateW / 2}" y="${plateTop}" width="${plateW}" height="${plateH}"\n            rx="11" fill="rgba(6,10,14,0.88)" stroke="${color.stroke}"\n            stroke-width="1.4" stroke-opacity="0.9"/>\n          ${bitmapTextSvg(label, slot.x, plateTop + plateH / 2, 1.5, '#F6F6F8')}`;
      }

      const nameLine = String(first || '').slice(0, 10);
      const restLine = rest ? String(rest).slice(0, 10) : '';
      const hasRest = Boolean(restLine);
      const plateH = hasRest ? 34 : 24;
      const plateW = Math.min(140, Math.max(92, Math.max(nameLine.length, restLine.length) * 11 + 40));
      const tx = slot.x;

      const chipR = 11;
      const chipX = tx + plateW / 2 - chipR - 6;
      const chipY = plateTop + plateH / 2;

      const nameY1 = hasRest ? plateTop + 10 : plateTop + plateH / 2;
      const nameY2 = plateTop + 24;

      return `\n        <rect x="${tx - plateW / 2}" y="${plateTop}" width="${plateW}" height="${plateH}"\n          rx="${plateH / 2}" fill="rgba(4,6,10,0.94)"\n          stroke="${color.stroke}" stroke-width="1.1" stroke-opacity="0.7"/>\n        ${bitmapTextSvg(nameLine, tx - 10, nameY1, 1.4, '#F6F6F8')}\n        ${hasRest ? bitmapTextSvg(restLine, tx - 10, nameY2, 1.2, 'rgba(246,246,248,0.75)') : ''}\n        <circle cx="${chipX}" cy="${chipY}" r="${chipR}"\n          fill="#07090D" stroke="${color.stroke}" stroke-width="1.7"/>\n        ${bitmapTextSvg(String(level ?? 0), chipX, chipY, 1.35, '#F6F6F8')}`;
    })
    .join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">\n    ${names}\n  </svg>`;
}

async function circularHead(iconPath, lineColor) {
  const size = HEAD;
  const r = size / 2;
  const meta = await sharp(iconPath).metadata();
  const w = meta.width || size;
  const h = meta.height || size;

  const filename = path.basename(iconPath).toLowerCase();
  const bias = CROP_BIAS[filename] ?? 0.8;
  const cropH = Math.max(1, Math.min(h, Math.round(h * bias)));

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  );

  const rimColor = lineColor || '#FFFFFF';
  const lightOverlay = Buffer.from(`\n    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">\n      <defs>\n        <radialGradient id="spot" cx="50%" cy="26%" r="70%">\n          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>\n          <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.03"/>\n          <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>\n        </radialGradient>\n      </defs>\n      <circle cx="${r}" cy="${r}" r="${r}" fill="url(#spot)"/>\n      <circle cx="${r}" cy="${r}" r="${r - 1}" fill="none"\n        stroke="${rimColor}" stroke-width="2.5" stroke-opacity="0.35"/>\n    </svg>\n  `);

  const body = await sharp(iconPath)
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: w, height: cropH })
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: body, blend: 'over' },
      { input: mask, blend: 'dest-in' },
      { input: lightOverlay, blend: 'over' }
    ])
    .png()
    .toBuffer();
}

async function placeholderHead(displayName, lineColor) {
  const size = HEAD;
  const r = size / 2;
  const initials = initialsFromName(displayName).replace(/[^A-Z0-9]/g, '').slice(0, 2) || 'XX';
  const stroke = lineColor || '#FF4D8D';
  const key = `ph3:${initials}|${stroke}`;
  const hit = PLACEHOLDER_CACHE.get(key);
  if (hit) return hit;

  const svg = Buffer.from(`\n    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">\n      <defs>\n        <radialGradient id="phBg" cx="42%" cy="32%" r="72%">\n          <stop offset="0%" stop-color="#243040"/>\n          <stop offset="55%" stop-color="#121820"/>\n          <stop offset="100%" stop-color="#070A0E"/>\n        </radialGradient>\n      </defs>\n      <circle cx="${r}" cy="${r}" r="${r}" fill="url(#phBg)"/>\n      <circle cx="${r}" cy="${r}" r="${r - 2.5}" fill="none"\n        stroke="${stroke}" stroke-width="3.2" stroke-opacity="0.7"/>\n      ${bitmapTextSvg(initials, r, r, 3.2, '#F6F6F8')}\n    </svg>\n  `);

  const buf = await sharp(svg).png().toBuffer();
  PLACEHOLDER_CACHE.set(key, buf);
  return buf;
}

async function circularHeadCached(iconPath, lineColor) {
  const key = `${path.basename(iconPath).toLowerCase()}|${lineColor || ''}`;
  const hit = HEAD_CACHE.get(key);
  if (hit) return hit;

  const buf = await circularHead(iconPath, lineColor);
  if (HEAD_CACHE.size >= HEAD_CACHE_MAX) {
    const oldest = HEAD_CACHE.keys().next().value;
    HEAD_CACHE.delete(oldest);
  }
  HEAD_CACHE.set(key, buf);
  return buf;
}

function resolveCard(byId, cardId) {
  if (cardId == null) return null;
  return byId.get(cardId) || byId.get(Number(cardId)) || byId.get(String(cardId)) || null;
}

async function renderTeam(teamRows, allCards, formationId = '4-3-3') {
  const formation = FORMATIONS[formationId] || FORMATIONS['4-3-3'];
  const slots = resolveSlots(formation.id);
  const byId = new Map(allCards.map(c => [c.id, c]));

  const teamMap = new Map();
  for (const row of teamRows || []) {
    const card = resolveCard(byId, row.cardId);
    const iconName = card?.icon || null;
    teamMap.set(row.slot, {
      name: row.cardName || card?.name || row.slot,
      icon: iconName,
      level: row.level ?? 0
    });
  }

  const pitchBuf = await loadPitchBuffer();
  let baseBuf;
  if (pitchBuf) {
    baseBuf = pitchBuf;
  } else {
    baseBuf = await sharp(Buffer.from(buildFallbackBaseSvg())).png().toBuffer();
  }

  const overlaySvg = buildOverlaySvg(teamMap, slots, formation.label);
  const overlayPng = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  const headJobs = slots.map(async slot => {
    const entry = teamMap.get(slot.key);
    if (!entry) return null;

    const lk = lineOf(slot.key, slots);
    const lineColor = LINE[lk].stroke;
    const left = Math.round(slot.x - HEAD_R);
    const top = Math.round(slot.y - HEAD_R);

    if (entry.icon) {
      const iconPath = path.join(ICONS_DIR, entry.icon);
      if (fs.existsSync(iconPath)) {
        try {
          const head = await circularHeadCached(iconPath, lineColor);
          return { input: head, left, top, label: entry.name, source: 'icon' };
        } catch (err) {
          logger.error(`Failed head for ${entry.name}`, err.message);
        }
      } else {
        logger.warn(`Icon not found: ${iconPath} (${entry.name}) — using placeholder`);
      }
    } else {
      logger.warn(`No icon field for ${entry.name} — using placeholder`);
    }

    try {
      const head = await placeholderHead(entry.name, lineColor);
      return { input: head, left, top, label: entry.name, source: 'placeholder' };
    } catch (err) {
      logger.error(`Placeholder head failed for ${entry.name}`, err.message);
      return null;
    }
  });

  const layers = (await Promise.all(headJobs)).filter(Boolean);

  const namesSvg = buildNamesSvg(teamMap, slots);
  const namesPng = await sharp(Buffer.from(namesSvg)).png().toBuffer();

  const composites = [
    { input: overlayPng, left: 0, top: 0 },
    ...layers.map(l => ({ input: l.input, left: l.left, top: l.top })),
    { input: namesPng, left: 0, top: 0 }
  ];

  const out = await sharp(baseBuf)
    .ensureAlpha()
    .composite(composites)
    .png()
    .toBuffer();

  const iconHeads = layers.filter(l => l.source === 'icon').length;
  const phHeads = layers.filter(l => l.source === 'placeholder').length;
  logger.info(
    `Team render: ${teamMap.size} seated · ${iconHeads} icon head(s) · ${phHeads} placeholder(s) · pitch=${pitchPathUsed ? path.basename(pitchPathUsed) : 'fallback'}`
  );

  if (teamMap.size > 0 && layers.length === 0) {
    logger.warn('Team render: filled slots but no head layers — check data/icons');
  }

  return out;
}

function clearPitchCache() {
  pitchBufferCache = null;
  pitchPathUsed = null;
  HEAD_CACHE.clear();
}

module.exports = {
  renderTeam,
  FORMATION_SLOTS: SLOTS,
  resolveSlots,
  ICONS_DIR,
  PITCH_PATH,
  clearPitchCache
};

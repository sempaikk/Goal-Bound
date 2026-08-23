/**
 * Tiny 5×7 uppercase bitmap font for pitch SVG labels.
 * Avoids system fonts (Railway/Linux often has no Arial).
 * Glyphs: A–Z, 0–9, space, slash, hyphen, colon.
 */

const GLYPH_W = 5;
const GLYPH_H = 7;

/** Each row is 5 bits (MSB left). */
const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '/': [1, 2, 4, 8, 16, 0, 0],
  ':': [0, 4, 0, 0, 4, 0, 0],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [14, 17, 1, 6, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 19, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [1, 1, 1, 1, 17, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31]
};

function sanitize(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-/:.]/g, '')
    .slice(0, 24);
}

/**
 * Draw centered bitmap text as SVG rects.
 * @param {string} text
 * @param {number} cx center x
 * @param {number} cy baseline-ish center y of glyph block
 * @param {number} scale pixel size (1 = 5×7 px)
 * @param {string} fill
 * @param {number} [gap=1] pixels between glyphs at scale 1
 */
function bitmapTextSvg(text, cx, cy, scale, fill, gap = 1) {
  const t = sanitize(text);
  if (!t) return '';
  const advance = GLYPH_W + gap;
  const totalW = t.length * advance - gap;
  const originX = cx - (totalW * scale) / 2;
  const originY = cy - (GLYPH_H * scale) / 2;
  const parts = [];
  for (let i = 0; i < t.length; i++) {
    const rows = GLYPHS[t[i]] || GLYPHS[' '];
    const ox = originX + i * advance * scale;
    for (let y = 0; y < GLYPH_H; y++) {
      const row = rows[y] || 0;
      for (let x = 0; x < GLYPH_W; x++) {
        if (row & (1 << (GLYPH_W - 1 - x))) {
          parts.push(
            `<rect x="${(ox + x * scale).toFixed(1)}" y="${(originY + y * scale).toFixed(1)}" width="${scale}" height="${scale}" fill="${fill}"/>`
          );
        }
      }
    }
  }
  return parts.join('');
}

module.exports = {
  bitmapTextSvg,
  sanitize,
  GLYPH_W,
  GLYPH_H
};

/**
 * Media prep on boot — keeps banner GIFs and character icons consistent
 * without manual ffmpeg steps every time you drop a new file.
 *
 * Banners (data/images/banners/*.gif):
 *   Target 400×225 (16:9), fill-crop, palette-optimized GIF.
 *   Multi-pass: tries milder → stronger fps/colors until under ~1.5MB
 *   or no further gain. Needs ffmpeg on PATH.
 *
 * Icons (data/icons/*.png):
 *   Background removal (border flood-fill) + max dimension 256px.
 *   Refuses to save if more than 35% of pixels would be cleared (protects art).
 *
 * Hash-gated: only rewrites a file when content actually needs work.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const logger = require('../logger/logger.js');

const execFileAsync = promisify(execFile);

const BANNERS_DIR = path.join(__dirname, '..', '..', 'data', 'images', 'banners');
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'media-prep-cache.json');

const BANNER_W = 400;
const BANNER_H = 225;
const BANNER_FILES = ['standard.gif', 'coaches.gif', 'hub.gif'];
/** Prefer under this size so Discord clients load the panel smoothly */
const BANNER_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
const ICON_MAX_PX = 256;

/** Max fraction of pixels that may be made transparent. Above this → skip (keep original). */
const MAX_CLEAR_RATIO = 0.35;

/** Bump when processIcon / size logic changes → reprocess icons once */
const ICON_LOGIC_VERSION = 4;
/** Bump when banner ffmpeg pipeline changes → recompress once */
const BANNER_LOGIC_VERSION = 3;

/** Progressive passes: milder first, then stronger if still heavy */
const BANNER_PASSES = [
  { fps: 12, colors: 192, label: 'std' },
  { fps: 10, colors: 128, label: 'mid' },
  { fps: 8, colors: 96, label: 'tight' },
  { fps: 6, colors: 64, label: 'max' }
];

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function invalidateIconCacheIfNeeded(cache) {
  if (cache.iconLogicVersion === ICON_LOGIC_VERSION) return cache;

  const before = Object.keys(cache).filter(k => k.startsWith('icon:')).length;
  for (const key of Object.keys(cache)) {
    if (key.startsWith('icon:')) delete cache[key];
  }
  cache.iconLogicVersion = ICON_LOGIC_VERSION;

  if (before > 0) {
    logger.info(`mediaPrep: icon logic updated (v${ICON_LOGIC_VERSION}) — cleared ${before} icon cache entries`);
  }
  return cache;
}

function invalidateBannerCacheIfNeeded(cache) {
  if (cache.bannerLogicVersion === BANNER_LOGIC_VERSION) return cache;

  const before = Object.keys(cache).filter(k => k.startsWith('banner:')).length;
  for (const key of Object.keys(cache)) {
    if (key.startsWith('banner:')) delete cache[key];
  }
  cache.bannerLogicVersion = BANNER_LOGIC_VERSION;

  if (before > 0) {
    logger.info(`mediaPrep: banner logic updated (v${BANNER_LOGIC_VERSION}) — cleared ${before} banner cache entries`);
  }
  return cache;
}

async function hasFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function runFfmpegGif(inputPath, outputPath, fps, colors) {
  const scaleCrop =
    `scale=${BANNER_W}:${BANNER_H}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${BANNER_W}:${BANNER_H},fps=${fps}`;

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', inputPath,
      '-filter_complex',
      `[0:v]${scaleCrop},split[s0][s1];` +
        `[s0]palettegen=max_colors=${colors}:stats_mode=full[p];` +
        `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop', '0',
      outputPath
    ],
    { timeout: 180000, maxBuffer: 12 * 1024 * 1024 }
  );
}

/**
 * Multi-pass compress: keep the smallest result under target when possible.
 */
async function normalizeBanner(filePath, ffmpegOk) {
  if (!ffmpegOk) return { skipped: true, reason: 'ffmpeg not on PATH' };

  const before = fs.statSync(filePath).size;
  const workSrc = filePath.replace(/\.gif$/i, '.prep.src.gif');
  const tmp = filePath.replace(/\.gif$/i, '.prep.tmp.gif');

  try {
    fs.copyFileSync(filePath, workSrc);
  } catch (error) {
    return { skipped: true, reason: error.message };
  }

  let bestPath = null;
  let bestSize = before;
  let usedPass = null;

  try {
    for (const pass of BANNER_PASSES) {
      try {
        await runFfmpegGif(workSrc, tmp, pass.fps, pass.colors);
      } catch (error) {
        logger.warn(`mediaPrep: banner pass ${pass.label} failed — ${error.message}`);
        continue;
      }

      if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 100) {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        continue;
      }

      const size = fs.statSync(tmp).size;
      if (size < bestSize) {
        // promote this tmp to best
        const bestTmp = filePath.replace(/\.gif$/i, `.prep.best.gif`);
        try { if (fs.existsSync(bestTmp)) fs.unlinkSync(bestTmp); } catch { /* ignore */ }
        fs.renameSync(tmp, bestTmp);
        bestPath = bestTmp;
        bestSize = size;
        usedPass = pass.label;
      } else {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }

      if (bestSize <= BANNER_MAX_BYTES) break;
    }

    if (!bestPath || bestSize >= before) {
      // nothing better
      try { if (bestPath) fs.unlinkSync(bestPath); } catch { /* ignore */ }
      try { fs.unlinkSync(workSrc); } catch { /* ignore */ }
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      return {
        skipped: true,
        reason: bestSize >= before
          ? 'no size gain (art may already be dense)'
          : 'ffmpeg produced no usable output'
      };
    }

    fs.renameSync(bestPath, filePath);
    try { fs.unlinkSync(workSrc); } catch { /* ignore */ }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }

    return {
      updated: true,
      before,
      after: bestSize,
      savedPct: before > 0 ? Math.round((1 - bestSize / before) * 100) : 0,
      pass: usedPass
    };
  } catch (error) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    try { if (fs.existsSync(workSrc)) fs.unlinkSync(workSrc); } catch { /* ignore */ }
    try {
      const bestTmp = filePath.replace(/\.gif$/i, `.prep.best.gif`);
      if (fs.existsSync(bestTmp)) fs.unlinkSync(bestTmp);
    } catch { /* ignore */ }
    return { skipped: true, reason: error.message };
  }
}

async function processIcon(filePath) {
  const image = sharp(filePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const channels = info.channels;
  if (channels < 4 || w < 8 || h < 8) {
    return { skipped: true, reason: 'too small or invalid' };
  }

  const idx = (x, y) => (y * w + x) * channels;

  const border = Math.min(6, Math.floor(Math.min(w, h) / 10));
  const brightSamples = [];
  const allSamples = [];

  const pushSample = (x, y) => {
    const i = idx(x, y);
    const r = data[i], g = data[i + 1], b = data[i + 2];
    allSamples.push([r, g, b]);
    if ((r + g + b) / 3 > 200) brightSamples.push([r, g, b]);
  };

  for (let x = 0; x < w; x++) {
    for (let t = 0; t < border; t++) {
      pushSample(x, t);
      pushSample(x, h - 1 - t);
    }
  }
  for (let y = border; y < h - border; y++) {
    for (let t = 0; t < border; t++) {
      pushSample(t, y);
      pushSample(w - 1 - t, y);
    }
  }

  const samples = brightSamples.length > 30 ? brightSamples : allSamples;
  if (samples.length < 8) {
    return { skipped: true, reason: 'not enough border samples' };
  }

  const sortedR = samples.map(s => s[0]).sort((a, b) => a - b);
  const sortedG = samples.map(s => s[1]).sort((a, b) => a - b);
  const sortedB = samples.map(s => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  const bgR = sortedR[mid];
  const bgG = sortedG[mid];
  const bgB = sortedB[mid];

  let transparentCorners = 0;
  const cornerCoords = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]];
  for (const [cx, cy] of cornerCoords) {
    if (data[idx(cx, cy) + 3] < 30) transparentCorners++;
  }
  if (transparentCorners >= 4) {
    return { skipped: true, reason: 'already transparent' };
  }

  const borderDists = [];
  for (const [r, g, b] of samples) {
    const d = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
    if (d < 80) borderDists.push(d);
  }
  borderDists.sort((a, b) => a - b);
  let hardThresh = 28;
  if (borderDists.length > 20) {
    const p90 = borderDists[Math.floor(borderDists.length * 0.9)];
    hardThresh = Math.min(42, Math.max(22, p90 + 10));
  }

  const candidate = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const d = Math.sqrt(
        (data[i] - bgR) ** 2 +
        (data[i + 1] - bgG) ** 2 +
        (data[i + 2] - bgB) ** 2
      );
      if (d < hardThresh) candidate[y * w + x] = 1;
    }
  }

  const visited = new Uint8Array(w * h);
  const queue = [];

  const trySeed = (x, y) => {
    const p = y * w + x;
    if (candidate[p] && !visited[p]) {
      visited[p] = 1;
      queue.push(p);
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (queue.length) {
    const p = queue.pop();
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) trySeed(x - 1, y);
    if (x < w - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < h - 1) trySeed(x, y + 1);
  }

  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    if (visited[p]) cleared++;
  }

  const clearRatio = cleared / (w * h);
  if (cleared < (w * h) * 0.015) {
    return { skipped: true, reason: 'little solid background detected' };
  }
  if (clearRatio > MAX_CLEAR_RATIO) {
    return {
      skipped: true,
      reason: `would clear ${(clearRatio * 100).toFixed(0)}% (max ${MAX_CLEAR_RATIO * 100}%) — keeping original`
    };
  }

  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (visited[p]) {
      out[p * channels + 3] = 0;
    }
  }

  const soft = new Uint8Array(visited);
  const next = new Uint8Array(soft);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (soft[p]) continue;
      if (
        (x > 0 && soft[p - 1]) ||
        (x < w - 1 && soft[p + 1]) ||
        (y > 0 && soft[p - w]) ||
        (y < h - 1 && soft[p + w])
      ) {
        next[p] = 1;
      }
    }
  }
  soft.set(next);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (soft[p] && !visited[p]) {
        const i = p * channels;
        const d = Math.sqrt(
          (data[i] - bgR) ** 2 +
          (data[i + 1] - bgG) ** 2 +
          (data[i + 2] - bgB) ** 2
        );
        const alpha = Math.min(255, Math.max(0, Math.round((d / hardThresh) * 220)));
        if (out[i + 3] > alpha) {
          out[i + 3] = alpha;
        }
      }
    }
  }

  const tmp = filePath.replace(/\.png$/i, '.prep.tmp.png');
  await sharp(out, { raw: { width: w, height: h, channels } })
    .png({ compressionLevel: 9 })
    .toFile(tmp);

  fs.renameSync(tmp, filePath);
  return { updated: true, cleared };
}

async function ensureIconMaxSize(filePath) {
  const meta = await sharp(filePath).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w <= ICON_MAX_PX && h <= ICON_MAX_PX) {
    return { skipped: true };
  }

  const tmp = filePath.replace(/\.png$/i, '.size.tmp.png');
  await sharp(filePath)
    .resize(ICON_MAX_PX, ICON_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(tmp);

  fs.renameSync(tmp, filePath);
  return { updated: true, from: `${w}x${h}` };
}

async function prepareBanners(cache, ffmpegOk) {
  let updated = 0;
  let skipped = 0;

  if (!fs.existsSync(BANNERS_DIR)) {
    return { updated, skipped };
  }

  for (const name of BANNER_FILES) {
    const full = path.join(BANNERS_DIR, name);
    if (!fs.existsSync(full)) continue;

    const key = `banner:${name}`;
    const hash = hashFile(full);
    if (cache[key] === hash) {
      skipped++;
      continue;
    }

    let needsWork = true;
    try {
      const meta = await sharp(full, { animated: true }).metadata();
      const sizeOk = fs.statSync(full).size <= BANNER_MAX_BYTES;
      const dimOk = meta.width === BANNER_W && meta.height === BANNER_H;
      if (sizeOk && dimOk) {
        cache[key] = hash;
        skipped++;
        needsWork = false;
      }
    } catch {
      // proceed to recompress
    }

    if (!needsWork) continue;

    const result = await normalizeBanner(full, ffmpegOk);
    if (result.updated) {
      cache[key] = hashFile(full);
      updated++;
      const mb = (n) => (n / (1024 * 1024)).toFixed(2);
      logger.success(
        `mediaPrep: banner ${name} → ${BANNER_W}x${BANNER_H} · ` +
        `${mb(result.before)}MB → ${mb(result.after)}MB (−${result.savedPct}%)` +
        (result.pass ? ` [${result.pass}]` : '')
      );
    } else {
      // Mark current hash so we don't retry every boot if gain is impossible
      cache[key] = hashFile(full);
      skipped++;
      if (result.reason && result.reason !== 'ffmpeg not on PATH') {
        logger.warn(`mediaPrep: banner ${name} — ${result.reason}`);
      }
    }
  }

  return { updated, skipped };
}

async function prepareIcons(cache) {
  let updated = 0;
  let skipped = 0;
  let resized = 0;

  if (!fs.existsSync(ICONS_DIR)) {
    return { updated, skipped, resized };
  }

  const files = fs.readdirSync(ICONS_DIR).filter(f => /\.png$/i.test(f));

  for (const name of files) {
    const full = path.join(ICONS_DIR, name);
    const key = `icon:${name}`;
    const hash = hashFile(full);

    if (cache[key] === hash) {
      skipped++;
      continue;
    }

    try {
      const result = await processIcon(full);
      if (result.updated) {
        updated++;
        logger.success(`mediaPrep: cleaned icon background ${name}`);
      } else if (result.reason && result.reason.includes('would clear')) {
        logger.warn(`mediaPrep: icon ${name} protected — ${result.reason}`);
      }

      const sizeResult = await ensureIconMaxSize(full);
      if (sizeResult.updated) {
        resized++;
        logger.success(`mediaPrep: resized icon ${name} ${sizeResult.from} → max ${ICON_MAX_PX}px`);
      }

      if (result.updated || sizeResult.updated) {
        cache[key] = hashFile(full);
      } else {
        cache[key] = hash;
        skipped++;
      }
    } catch (error) {
      logger.warn(`mediaPrep: icon ${name} failed — ${error.message}`);
      skipped++;
    }
  }

  return { updated, skipped, resized };
}

async function runMediaPrep() {
  let cache = loadCache();
  cache = invalidateIconCacheIfNeeded(cache);
  cache = invalidateBannerCacheIfNeeded(cache);

  const ffmpegOk = await hasFfmpeg();

  if (!ffmpegOk) {
    logger.warn('mediaPrep: ffmpeg not found on PATH — banner auto-resize/compress disabled (icons still processed)');
  }

  try {
    const banners = await prepareBanners(cache, ffmpegOk);
    const icons = await prepareIcons(cache);
    saveCache(cache);

    logger.info(
      `mediaPrep: banners ${banners.updated} updated / ${banners.skipped} ok · ` +
      `icons ${icons.updated} cleaned / ${icons.resized || 0} resized / ${icons.skipped} ok`
    );
  } catch (error) {
    logger.error('mediaPrep: unexpected failure', error.message);
  }
}

module.exports = { runMediaPrep, BANNER_W, BANNER_H, ICON_MAX_PX, BANNER_MAX_BYTES };

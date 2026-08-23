/**
 * Automatic player-data snapshots → PERSIST_DIR/dados
 * Runs every day at 17:00 America/Sao_Paulo (fixed UTC−3, no DST).
 *
 * Keeps the last KEEP_DAYS sets. Safe on Railway volume and local PC.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');
const logger = require('../logger/logger.js');

const KEEP_DAYS = 14;
const HOUR_BRT = 17;
const MINUTE_BRT = 0;
/** São Paulo has no DST since 2019 → always UTC−3 */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

const DADOS_DIR = path.join(config.PERSIST_DIR, 'dados');

const SOURCES = [
  { src: config.PATHS.DB, base: 'goalbound', binary: true },
  { src: config.PATHS.DB + '-wal', base: 'goalbound', suffix: '-wal', binary: true },
  { src: config.PATHS.DB + '-shm', base: 'goalbound', suffix: '-shm', binary: true },
  { src: config.PATHS.QOL_STORE, base: 'qol-store', ext: '.json' },
  { src: config.PATHS.USER_COACHES, base: 'user-coaches', ext: '.json' },
  { src: config.PATHS.GUILD_SETTINGS, base: 'guild-settings', ext: '.json' },
  { src: config.PATHS.GUILD_ACTIVITY, base: 'guild-activity', ext: '.json' }
];

let timer = null;

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Wall-clock in BRT via fixed offset (good enough for scheduling 17:00). */
function msUntilNext1700Brt(fromMs = Date.now()) {
  const brt = new Date(fromMs - BRT_OFFSET_MS);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  // 17:00 BRT = 20:00 UTC on the same BRT calendar day
  let targetUtc = Date.UTC(y, m, d, HOUR_BRT + 3, MINUTE_BRT, 0, 0);
  if (targetUtc <= fromMs) {
    targetUtc += 24 * 60 * 60 * 1000;
  }
  return targetUtc - fromMs;
}

/** Flush WAL into the main DB so the .db copy is consistent. */
function checkpointSqlite() {
  try {
    const DataService = require('./DataService.js');
    if (DataService && DataService.db) {
      DataService.db.pragma('wal_checkpoint(TRUNCATE)');
    }
  } catch (error) {
    logger.warn('Backup checkpoint skipped', error.message);
  }
}

function pruneOld() {
  if (!fs.existsSync(DADOS_DIR)) return;
  const files = fs.readdirSync(DADOS_DIR).sort().reverse();
  const stamps = new Set();
  for (const f of files) {
    const m = f.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z)/);
    if (m) stamps.add(m[1]);
  }
  const ordered = [...stamps].sort().reverse();
  const drop = new Set(ordered.slice(KEEP_DAYS));
  if (drop.size === 0) return;
  for (const f of files) {
    for (const s of drop) {
      if (f.includes(s)) {
        try {
          fs.unlinkSync(path.join(DADOS_DIR, f));
        } catch {
          /* ignore */
        }
        break;
      }
    }
  }
}

function folderSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(dir)) {
    try {
      total += fs.statSync(path.join(dir, f)).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

/**
 * Copy current runtime data into dados/ with a timestamp.
 * @returns {{ ok: boolean, dir: string, files: string[], bytes?: number, error?: string }}
 */
function runBackup() {
  try {
    checkpointSqlite();
    fs.mkdirSync(DADOS_DIR, { recursive: true });
    const stamp = stampNow();
    const done = [];

    for (const item of SOURCES) {
      if (!fs.existsSync(item.src)) continue;
      const suffix = item.suffix || '';
      const ext = item.ext || (item.binary ? '.db' : '');
      let name;
      if (suffix) {
        name = `${item.base}-${stamp}.db${suffix}`;
      } else if (item.binary) {
        name = `${item.base}-${stamp}.db`;
      } else {
        name = `${item.base}-${stamp}${ext}`;
      }
      const dest = path.join(DADOS_DIR, name);
      fs.copyFileSync(item.src, dest);
      done.push(name);
    }

    pruneOld();

    const bytes = folderSizeBytes(DADOS_DIR);
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    if (bytes > 200 * 1024 * 1024) {
      logger.warn(`Player data folder is ${mb} MB — consider pruning or larger volume`);
    }

    if (done.length === 0) {
      return { ok: false, dir: DADOS_DIR, files: [], bytes, error: 'nothing to copy' };
    }
    return { ok: true, dir: DADOS_DIR, files: done, bytes };
  } catch (error) {
    return { ok: false, dir: DADOS_DIR, files: [], error: error.message };
  }
}

function listRecentBackups(limit = 5) {
  if (!fs.existsSync(DADOS_DIR)) return [];
  const stamps = new Set();
  for (const f of fs.readdirSync(DADOS_DIR)) {
    const m = f.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z)/);
    if (m) stamps.add(m[1]);
  }
  return [...stamps].sort().reverse().slice(0, limit);
}

function scheduleNext() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const wait = msUntilNext1700Brt();
  const mins = Math.round(wait / 60000);
  logger.info(
    `Player data backup: next run in ~${mins} min (daily ${HOUR_BRT}:00 BRT → ${DADOS_DIR})`
  );

  timer = setTimeout(() => {
    const result = runBackup();
    if (result.ok) {
      logger.success(
        `Player data backup OK (${result.files.length} file(s)) → ${result.dir}`
      );
    } else {
      logger.warn(`Player data backup failed: ${result.error || 'unknown'}`);
    }
    scheduleNext();
  }, wait);
}

function startScheduler() {
  try {
    fs.mkdirSync(DADOS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  scheduleNext();
}

function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

module.exports = {
  runBackup,
  listRecentBackups,
  startScheduler,
  stopScheduler,
  DADOS_DIR,
  KEEP_DAYS,
  HOUR_BRT
};

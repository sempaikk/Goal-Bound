#!/usr/bin/env node
/**
 * Snapshot runtime data into persist backups/ with a timestamp stamp.
 *
 * Copies:
 *   - goalbound.db (+ WAL/SHM if present)
 *   - qol-store.json (daily, pity, locale, pull log, …)
 *   - guild-settings.json (allowed channel per server)
 *   - user-coaches.json
 *
 * Usage: npm run backup
 * Windows schedule: npm run backup:schedule  (daily 17:00)
 * Cron example: 0 17 * * * cd /path/to/Goal-Bound && npm run backup
 */
const fs = require('fs');
const path = require('path');

// Load config paths (respects PERSIST_DIR)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../src/config/config.js');

const PERSIST = config.PERSIST_DIR;
const OUT = config.PATHS.BACKUPS;
const KEEP = 14;

const DB = config.PATHS.DB;
const EXTRA_FILES = [
  { src: config.PATHS.QOL_STORE, label: 'qol-store' },
  { src: config.PATHS.GUILD_SETTINGS, label: 'guild-settings' },
  { src: config.PATHS.USER_COACHES, label: 'user-coaches' },
  { src: config.PATHS.GUILD_ACTIVITY, label: 'guild-activity' }
];

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function pruneByPrefix(prefix, suffix) {
  const files = fs
    .readdirSync(OUT)
    .filter(f => f.startsWith(prefix) && f.endsWith(suffix))
    .sort()
    .reverse();
  for (const old of files.slice(KEEP)) {
    try {
      fs.unlinkSync(path.join(OUT, old));
    } catch {
      /* ignore */
    }
  }
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = stampNow();
  const done = [];

  if (!fs.existsSync(DB)) {
    console.error('No database at', DB);
  } else {
    const base = `goalbound-${stamp}.db`;
    const dest = path.join(OUT, base);
    fs.copyFileSync(DB, dest);
    copyIfExists(DB + '-wal', dest + '-wal');
    copyIfExists(DB + '-shm', dest + '-shm');
    done.push(base);

    const dbFiles = fs
      .readdirSync(OUT)
      .filter(
        f =>
          f.startsWith('goalbound-') &&
          f.endsWith('.db') &&
          !f.includes('-wal') &&
          !f.includes('-shm')
      )
      .sort()
      .reverse();
    for (const old of dbFiles.slice(KEEP)) {
      try {
        fs.unlinkSync(path.join(OUT, old));
        for (const extra of ['-wal', '-shm']) {
          const p = path.join(OUT, old + extra);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      } catch {
        /* ignore */
      }
    }
  }

  for (const { src, label } of EXTRA_FILES) {
    if (!fs.existsSync(src)) continue;
    const name = `${label}-${stamp}.json`;
    const dest = path.join(OUT, name);
    fs.copyFileSync(src, dest);
    done.push(name);
    pruneByPrefix(`${label}-`, '.json');
  }

  if (done.length === 0) {
    console.error('Nothing to back up under', PERSIST);
    process.exit(1);
  }

  console.log('Backup OK →', OUT);
  for (const f of done) console.log('  ·', f);
}

main();

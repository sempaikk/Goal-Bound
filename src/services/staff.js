/**
 * Staff titles (Owner-granted) + privilege checks.
 *
 * Titles (English, display order highest → lowest):
 *   Owner            — always DISCORD_OWNER_ID from .env
 *   Tester           — no cooldowns, free unlimited banner rolls
 *   Content Creator  — cosmetic title only
 *
 * How to grant (no slash command):
 *   1. Edit data/staff.json (hot-reload via mtime — no bot restart)
 *   2. Or set TESTER_IDS / CONTENT_CREATOR_IDS in .env (comma-separated)
 *
 * IMPORTANT: Discord snowflake IDs MUST be JSON strings in quotes.
 * Never write them as bare numbers — they exceed Number.MAX_SAFE_INTEGER
 * and JSON.parse will corrupt the digits (privilege checks then fail).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'staff.json');

const TITLE = {
  OWNER: {
    key: 'OWNER',
    label: 'Owner',
    emoji: '\uD83D\uDC51',
    privileged: true
  },
  TESTER: {
    key: 'TESTER',
    label: 'Tester',
    emoji: '\uD83E\uDDEA',
    privileged: true
  },
  CONTENT_CREATOR: {
    key: 'CONTENT_CREATOR',
    label: 'Content Creator',
    emoji: '\uD83C\uDFA5',
    privileged: false
  }
};

const TITLE_PRIORITY = ['OWNER', 'TESTER', 'CONTENT_CREATOR'];

/** @type {{ tester: string[], content_creator: string[] } | null} */
let fileCache = null;
let fileCacheMtime = -1;

function parseIdList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function toIdString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return s || null;
  }
  return String(value);
}

function loadFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fileCache = { tester: [], content_creator: [] };
      fileCacheMtime = 0;
      return fileCache;
    }
    const st = fs.statSync(STORE_PATH);
    if (fileCache && st.mtimeMs === fileCacheMtime) return fileCache;

    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    const tester = (Array.isArray(data.tester) ? data.tester : [])
      .map(toIdString)
      .filter(Boolean);
    const content_creator = (Array.isArray(data.content_creator) ? data.content_creator : [])
      .map(toIdString)
      .filter(Boolean);
    fileCache = { tester, content_creator };
    fileCacheMtime = st.mtimeMs;
    return fileCache;
  } catch {
    fileCache = { tester: [], content_creator: [] };
    fileCacheMtime = -1;
    return fileCache;
  }
}

/** Env lists are static for process lifetime */
const ENV_TESTERS = parseIdList(process.env.TESTER_IDS);
const ENV_CREATORS = parseIdList(process.env.CONTENT_CREATOR_IDS);

function collectIds() {
  const file = loadFile();
  const ownerId = config.OWNER_ID ? String(config.OWNER_ID) : null;

  return {
    owner: ownerId ? [ownerId] : [],
    tester: ENV_TESTERS.length
      ? [...new Set([...file.tester, ...ENV_TESTERS])]
      : file.tester,
    content_creator: ENV_CREATORS.length
      ? [...new Set([...file.content_creator, ...ENV_CREATORS])]
      : file.content_creator
  };
}

function getStaffTitles(userId) {
  if (!userId) return [];
  const id = String(userId);
  const ids = collectIds();
  const held = [];

  if (ids.owner.includes(id)) held.push(TITLE.OWNER);
  if (ids.tester.includes(id)) held.push(TITLE.TESTER);
  if (ids.content_creator.includes(id)) held.push(TITLE.CONTENT_CREATOR);

  return held.sort(
    (a, b) => TITLE_PRIORITY.indexOf(a.key) - TITLE_PRIORITY.indexOf(b.key)
  );
}

function getPrimaryStaffTitle(userId) {
  const titles = getStaffTitles(userId);
  return titles[0] || null;
}

function isPrivileged(userId) {
  if (!userId) return false;
  const id = String(userId);
  const ids = collectIds();
  return ids.owner.includes(id) || ids.tester.includes(id);
}

function isOwner(userId) {
  if (!userId || !config.OWNER_ID) return false;
  return String(userId) === String(config.OWNER_ID);
}

module.exports = {
  TITLE,
  TITLE_PRIORITY,
  STORE_PATH,
  getStaffTitles,
  getPrimaryStaffTitle,
  isPrivileged,
  isOwner
};

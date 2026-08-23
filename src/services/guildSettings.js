/**
 * Per-guild settings (allowed channel for bot activity).
 * Until a channel is set, slash commands and passive rewards stay off in that guild.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');

const STORE_PATH = config.PATHS.GUILD_SETTINGS;

/** @type {object | null} */
let mem = null;
let memMtime = -1;

function empty() {
  return { guilds: {} };
}

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      mem = empty();
      memMtime = 0;
      return mem;
    }
    const st = fs.statSync(STORE_PATH);
    if (mem && st.mtimeMs === memMtime) return mem;
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) || {};
    mem = {
      guilds: raw.guilds && typeof raw.guilds === 'object' ? raw.guilds : {}
    };
    memMtime = st.mtimeMs;
    return mem;
  } catch {
    mem = empty();
    memMtime = -1;
    return mem;
  }
}

function save(data) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const tmp = path.join(dir, `guild-settings.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, STORE_PATH);
  } catch {
    try {
      fs.writeFileSync(STORE_PATH, payload);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  mem = data;
  try {
    memMtime = fs.statSync(STORE_PATH).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

function mutate(fn) {
  const data = load();
  const result = fn(data);
  save(data);
  return result;
}

function getGuildEntry(guildId) {
  const id = String(guildId);
  const entry = load().guilds[id];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

/** @returns {string | null} channel id or null if not configured */
function getAllowedChannelId(guildId) {
  if (!guildId) return null;
  const entry = getGuildEntry(guildId);
  if (!entry) return null;
  const ch = entry.channelId;
  return ch ? String(ch) : null;
}

function isGuildConfigured(guildId) {
  return getAllowedChannelId(guildId) != null;
}

/**
 * True if this channel may run bot commands / message XP.
 * DMs (no guildId) always allowed.
 */
function isChannelAllowed(guildId, channelId) {
  if (!guildId) return true;
  const allowed = getAllowedChannelId(guildId);
  if (!allowed) return false;
  return String(channelId) === allowed;
}

function setAllowedChannelId(guildId, channelId, setByUserId) {
  return mutate(data => {
    const gid = String(guildId);
    data.guilds[gid] = {
      channelId: String(channelId),
      setBy: setByUserId ? String(setByUserId) : null,
      setAt: new Date().toISOString()
    };
    return data.guilds[gid];
  });
}

function clearAllowedChannelId(guildId) {
  return mutate(data => {
    const gid = String(guildId);
    const had = !!data.guilds[gid]?.channelId;
    delete data.guilds[gid];
    return had;
  });
}

module.exports = {
  getAllowedChannelId,
  isGuildConfigured,
  isChannelAllowed,
  setAllowedChannelId,
  clearAllowedChannelId
};

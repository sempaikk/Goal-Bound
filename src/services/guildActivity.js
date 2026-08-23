/**
 * Per-guild activity for "active servers" presence filter.
 * - human messages per UTC day
 * - distinct users who used bot commands (timestamps, 7d window)
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');

const STORE_PATH = config.PATHS.GUILD_ACTIVITY;
const MSG_MIN_GAP_MS = 2000;
const BOT_USER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DAY_KEYS = 3;

/** @type {object | null} */
let mem = null;
let memMtime = -1;

/** anti-spam: guildId:userId -> last msg counted at */
const lastMsgAt = new Map();
let ops = 0;

function empty() {
  return { guilds: {} };
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
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
  const tmp = path.join(dir, `guild-activity.${process.pid}.${Date.now()}.tmp`);
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

function ensureGuild(data, guildId) {
  const id = String(guildId);
  if (!data.guilds[id] || typeof data.guilds[id] !== 'object') {
    data.guilds[id] = { messagesByDay: {}, botUsers: {} };
  }
  if (!data.guilds[id].messagesByDay || typeof data.guilds[id].messagesByDay !== 'object') {
    data.guilds[id].messagesByDay = {};
  }
  if (!data.guilds[id].botUsers || typeof data.guilds[id].botUsers !== 'object') {
    data.guilds[id].botUsers = {};
  }
  return data.guilds[id];
}

function pruneMessagesByDay(entry) {
  const keys = Object.keys(entry.messagesByDay || {}).sort();
  while (keys.length > MAX_DAY_KEYS) {
    const old = keys.shift();
    delete entry.messagesByDay[old];
  }
}

function pruneBotUsers(entry, now = Date.now()) {
  const users = entry.botUsers || {};
  for (const [uid, ts] of Object.entries(users)) {
    if (!ts || now - Number(ts) > BOT_USER_TTL_MS) delete users[uid];
  }
}

/** Count a human message toward daily guild activity (anti-spam gap). */
function recordHumanMessage(guildId, userId) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const last = lastMsgAt.get(key) || 0;
  if (now - last < MSG_MIN_GAP_MS) return;
  lastMsgAt.set(key, now);

  ops += 1;
  if (ops >= 300) {
    ops = 0;
    for (const [k, at] of lastMsgAt) {
      if (now - at > 60 * 60 * 1000) lastMsgAt.delete(k);
    }
  }

  const day = utcDayKey();
  mutate(data => {
    const entry = ensureGuild(data, guildId);
    entry.messagesByDay[day] = (entry.messagesByDay[day] || 0) + 1;
    pruneMessagesByDay(entry);
    return entry.messagesByDay[day];
  });
}

/** Mark a user as having used a bot command in this guild. */
function recordBotUser(guildId, userId) {
  if (!guildId || !userId) return;
  const now = Date.now();
  mutate(data => {
    const entry = ensureGuild(data, guildId);
    entry.botUsers[String(userId)] = now;
    pruneBotUsers(entry, now);
    return true;
  });
}

function messagesToday(guildId) {
  if (!guildId) return 0;
  const entry = load().guilds[String(guildId)];
  if (!entry) return 0;
  return Number(entry.messagesByDay?.[utcDayKey()] || 0);
}

function uniqueBotUsersSince(guildId, sinceMs) {
  if (!guildId) return 0;
  const entry = load().guilds[String(guildId)];
  if (!entry?.botUsers) return 0;
  const now = Date.now();
  let n = 0;
  for (const ts of Object.values(entry.botUsers)) {
    if (ts && now - Number(ts) <= sinceMs) n += 1;
  }
  return n;
}

/**
 * Presence filter: configured + enough members + (chat activity OR real bot users).
 * @param {import('discord.js').Client} client
 * @param {{ minMembers?: number, minMessages?: number, minBotUsers?: number, botUserWindowMs?: number }} [opts]
 */
function countActiveGuilds(client, opts = {}) {
  const minMembers = opts.minMembers ?? 10;
  const minMessages = opts.minMessages ?? 10;
  const minBotUsers = opts.minBotUsers ?? 2;
  const botUserWindowMs = opts.botUserWindowMs ?? BOT_USER_TTL_MS;

  const { isGuildConfigured } = require('./guildSettings.js');
  let n = 0;

  for (const guild of client.guilds.cache.values()) {
    if (!isGuildConfigured(guild.id)) continue;

    const members = guild.memberCount || 0;
    if (members < minMembers) continue;

    const msgs = messagesToday(guild.id);
    const botUsers = uniqueBotUsersSince(guild.id, botUserWindowMs);

    if (msgs >= minMessages || botUsers >= minBotUsers) {
      n += 1;
    }
  }

  return n;
}

module.exports = {
  recordHumanMessage,
  recordBotUser,
  messagesToday,
  uniqueBotUsersSince,
  countActiveGuilds,
  utcDayKey
};

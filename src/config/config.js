require('dotenv').config();
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

let VERSION = '1.2.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  if (pkg.version) VERSION = String(pkg.version);
} catch {
  /* keep default */
}

/**
 * Static game assets (cards.json, icons, images) — always under data/.
 * Must NOT be covered by a host volume, or Railway will hide the repo files.
 */
const ASSETS_DIR = path.join(PROJECT_ROOT, 'data');

/**
 * Writable runtime data (SQLite, qol-store, guild settings, …).
 * Local default: same as data/ (no change for PC users).
 * Railway: set PERSIST_DIR=/app/persist and mount the volume there.
 */
const PERSIST_DIR = process.env.PERSIST_DIR
  ? path.resolve(process.env.PERSIST_DIR)
  : ASSETS_DIR;

if (!fs.existsSync(PERSIST_DIR)) {
  try {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
  } catch {
    /* DataService / stores will retry */
  }
}

module.exports = {
  TOKEN: process.env.DISCORD_TOKEN,

  OWNER_ID: process.env.DISCORD_OWNER_ID || null,

  OWNER_GUILD_ID: process.env.OWNER_GUILD_ID || null,

  VERSION,

  PROJECT_ROOT,
  ASSETS_DIR,
  PERSIST_DIR,

  BRAND: {
    NAME: 'Goal Bound',
    TAGLINE: 'Collect. Form. Dominate.',
    FOOTER: 'Goal Bound'
  },

  COLORS: {
    PRIMARY: '#FF4D8D',
    SECONDARY: '#00E5C3',
    SUCCESS: '#3DDC97',
    ERROR: '#FF5C5C',
    WARNING: '#FFB020',
    GOLD: '#FFD166',
    FIELD: '#1B7F5A'
  },

  MESSAGES: {
    NO_CARDS:
      'Your binder is empty.\n\n' +
      'Open **`/banners`** to recruit an egoist, then seat them on **`/team`** so they gain XP.',
    ERROR_LOADING: 'Something failed on our side. Try again in a few seconds.',
    ERROR_SAVING: "Couldn't save that. Try again in a moment.",
    OWNER_ONLY: 'That action is reserved for the bot owner.',
    COOLDOWN_SUMMON:
      'The gate is closed.\n\nYou can pull again in **{time}**.',
    EMPTY_TEAM:
      '**Vacant pitch.**\n\n' +
      'Choose a role, then a card from your binder.\n' +
      '_Only the eleven on the field gain XP from chat and voice._',
    EMPTY_COLLECTION_OTHER: "**{user}** hasn't recruited anyone yet.",
    BOTS_DONT_PLAY: 'Automated accounts stay on the bench. Pick a human.',
    BOTS_DONT_COLLECT: 'Automated accounts have no binder. Pick a human.',
    NOT_YOUR_PANEL: 'This panel belongs to someone else. Open it with the matching command yourself.',
    POOL_EMPTY: 'No characters are configured right now. Try again later.'
  },

  PATHS: {
    CARDS: path.join(ASSETS_DIR, 'cards.json'),
    DB: path.join(PERSIST_DIR, 'goalbound.db'),
    QOL_STORE: path.join(PERSIST_DIR, 'qol-store.json'),
    GUILD_SETTINGS: path.join(PERSIST_DIR, 'guild-settings.json'),
    GUILD_ACTIVITY: path.join(PERSIST_DIR, 'guild-activity.json'),
    USER_COACHES: path.join(PERSIST_DIR, 'user-coaches.json'),
    BACKUPS: path.join(PERSIST_DIR, 'backups')
  },

  TIMESTAMPS: {
    ENABLED: true
  }
};

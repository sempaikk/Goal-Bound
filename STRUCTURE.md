# Goal Bound — project map

```
Goal-Bound/
├── index.js                 # Discord client boot + graceful shutdown
├── package.json
├── .env.example             # DISCORD_TOKEN, OWNER_*, PERSIST_DIR, PUBLIC_URL
├── README.md
├── STRUCTURE.md             # this file
│
├── data/                    # ASSETS (repo) — never mount volume over this
│   ├── cards.json           # roster + banner pools
│   ├── icons/               # head shots (mediaPrep)
│   └── images/
│       ├── team/pitch.jpg   # static /team background
│       └── banners/         # standard.gif · coaches.gif · hub.gif
│
├── tools/                   # backup / one-off scripts
├── tests/
│
└── src/
    ├── commands/            # player + staff slash commands
    │   ├── banners.js · team.js · collection.js · profile.js
    │   ├── help.js · rank.js · reload.js · grant.js · backup.js
    │   ├── slash/           # daily · stats · setchannel (+ thin re-exports)
    │   └── context/         # right-click menus
    │
    ├── events/              # ready, interactionCreate, message, voice
    ├── services/            # domain logic
    │   ├── DataService.js · FieldRenderer.js · teamRenderCache.js
    │   ├── mediaPrep.js · banners.js · qolStore.js
    │   ├── leaderboardService.js · webServer.js · leaderboardSnapshots.js
    │   └── …
    ├── utils/               # i18n, format, nav, channelGate, slashLocale
    ├── config/              # brand, PATHS, ASSETS_DIR vs PERSIST_DIR
    └── logger/
```

## Persistence (Railway)

| Path | What |
|------|------|
| `ASSETS_DIR` (`data/`) | cards, icons, images — **from git** |
| `PERSIST_DIR` | SQLite, qol-store, guild settings, coaches, backups, snapshots |

Local: `PERSIST_DIR` defaults to `data/`.
Railway: set `PERSIST_DIR=/app/persist` and mount volume **only** there (not over `data/`).

## Player surface

| Command | Role |
|---------|------|
| `/banners` | Standard + Coaches · x1 / x5 / x10 |
| `/team` | Pitch render + slots + master |
| `/collection` | Binder — tier, search, sort |
| `/profile` | Rank, Iene, eleven · **language toggle** |
| `/daily` | Daily Iene |
| `/stats` | Server pull rankings + binder gaps |
| `/rank` | Link to live top-100 web board |
| `/help` | Quick + full guide |
| `/setchannel` | Admin: lock command channel |

## i18n

- Player copy: `src/utils/i18n.js` (`EN` + `PT`)
- Preference: `qolStore` locale (`/profile` button)
- Slash descriptions: `withPtBr` / `optionPtBr` → Discord `pt-BR` localization
- Web leaderboard: `?lang=pt|en` or `Accept-Language`

## Rules

1. Commands only under `src/commands/` (recursive load).
2. Gacha / team / score rules live in `services/`, not event handlers.
3. Never mount host volume over `data/` assets.
4. Prefer one module path per command (root **or** `slash/`, not both with logic).
5. Player-facing strings go through `t(userId, key)` — no hard-coded English in panels.

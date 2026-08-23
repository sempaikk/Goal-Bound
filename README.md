# Goal Bound

Discord bot — collect Blue Lock egoists, form an eleven, pull banners.

**Version:** 1.2.0

## Quick start

```bash
npm install
# .env: DISCORD_TOKEN, optional DISCORD_OWNER_ID, OWNER_GUILD_ID
npm start
```

## Player commands

| Command | Role |
|---------|------|
| `/banners` | Standard + Coaches pulls (x1 / x5 / x10) |
| `/team` | Pitch, slots, master / formation |
| `/collection` | Binder — tier, search, sort |
| `/profile` | Rank, Iene, eleven, tiers |
| `/daily` | Claim daily Iene |
| `/stats` | Server pull rankings (players only) |
| `/help` | Quick start + full guide |

## Ops notes

- **Icons:** `data/icons/*.png` — boot `mediaPrep` cleans backgrounds and caps size at 256px.
- **Banner art:** `data/images/banners/` → `standard.gif`, `coaches.gif`, `hub.gif`. On boot, ffmpeg scales to **400×225**, ~12fps, palette-optimized, target **under ~1.5MB** (needs ffmpeg on PATH).
- **Missing icon:** `/team` draws initials placeholder instead of empty ring.
- **Team render:** cache TTL 90s, max 2 concurrent; queue shows “Drawing the pitch…”.
- **Stats:** Owner + Testers pulls are excluded from server rankings.
- **Presence:** rotates `/banners`, `/team`, card count, servers, `/help`.
- **Tests:** `npm test`

## Brand

- Primary `#FF4D8D` · Secondary `#00E5C3`
- Tagline: *Collect. Form. Dominate.*

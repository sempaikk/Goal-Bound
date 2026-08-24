# FUT card art (team + summon)

Put each character’s FIFA-style card PNG here.

## Naming

| File | `cards.json` `localImage` |
|------|---------------------------|
| `sae.png` | `"cards/sae.png"` |
| `isagi.png` | `"cards/isagi.png"` |
| … | `"cards/<slug>.png"` |

## Rules

- Prefer **PNG** (static). Avoid GIF on the pitch — 11 animated cards is heavy.
- Transparent background outside the shield is ideal.
- `/team` scales each card to ~128×190 on the field.
- Summon / collection still show the full-size file from `localImage`.

## Fallback

If a card file is missing, `/team` falls back to the circular `icon` in `data/icons/`, then initials.

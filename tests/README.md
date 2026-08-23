# Tests

```bash
git pull
npm install
npm test
```

| File | Covers |
|------|--------|
| formations | slots, coach, remap |
| xpCurve | level math |
| rarities | weights |
| ieneAtomic | SQL spend |
| teamCache | fingerprint |
| i18n | EN/PT key parity |
| claimCooldown | atomic gate SQL |
| pity | PITY_SOFT constant |

CI: `.github/workflows/test.yml` runs `npm test` on every push to `main`.

Backup:
```bash
npm run backup
npm run backup:schedule   # Windows Task Scheduler 04:00 daily
```

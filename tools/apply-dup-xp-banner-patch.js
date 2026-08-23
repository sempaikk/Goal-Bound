/**
 * Wire banner pulls so duplicates always hit addCard
 * (DataService.addCard converts duplicates → XP by card.rarity).
 *
 * Usage (from repo root):
 *   node tools/apply-dup-xp-banner-patch.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'commands', 'banners.js');
let src = fs.readFileSync(file, 'utf8');
const before = src;

// Normalize for matching (Windows may use CRLF)
const norm = (s) => s.replace(/\r\n/g, '\n');

function replaceFlexible(haystack, needle, replacement) {
  const h = norm(haystack);
  const n = norm(needle);
  const idx = h.indexOf(n);
  if (idx === -1) return { ok: false, text: haystack };

  // Map index back onto original string by scanning
  // Simpler: work entirely in normalized form, then write LF (Node/git fine on Windows)
  const out = h.slice(0, idx) + norm(replacement) + h.slice(idx + n.length);
  return { ok: true, text: out };
}

const multiOld = `
      const alreadyOwned = DataService.userHasCard(userId, card.id);
      if (!alreadyOwned) {
        DataService.addCard(userId, card.id, card.name);
        ownedNow += 1;
        if (ownedNow === poolSize) completedThis = true;
      }`;

const multiNew = `
      const alreadyOwned = DataService.userHasCard(userId, card.id);
      // Always call addCard: INSERT or (if duplicate) convert to XP
      DataService.addCard(userId, card.id, card.name);
      if (!alreadyOwned) {
        ownedNow += 1;
        if (ownedNow === poolSize) completedThis = true;
      }`;

const singleOld = `
  const alreadyOwned = DataService.userHasCard(userId, randomCard.id);
  if (!alreadyOwned) DataService.addCard(userId, randomCard.id, randomCard.name);`;

const singleNew = `
  const alreadyOwned = DataService.userHasCard(userId, randomCard.id);
  // Always call addCard: INSERT or (if duplicate) convert to XP
  DataService.addCard(userId, randomCard.id, randomCard.name);`;

let r = replaceFlexible(src, multiOld, multiNew);
if (!r.ok) {
  console.error('Multi-pull pattern not found — already patched or banners.js changed.');
} else {
  src = r.text;
  console.log('Patched multi-pull');
}

r = replaceFlexible(src, singleOld, singleNew);
if (!r.ok) {
  console.error('Single-pull pattern not found — already patched or banners.js changed.');
} else {
  src = r.text;
  console.log('Patched single-pull');
}

if (norm(src) === norm(before)) {
  console.error('No changes written.');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log('OK -> src/commands/banners.js');
console.log('Next: git add src/commands/banners.js');
console.log('      git commit -m "feat(banners): always addCard so duplicates grant XP"');
console.log('      git push');
console.log('      node index.js');

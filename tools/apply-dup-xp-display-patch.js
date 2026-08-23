/**
 * Show +XP on duplicate banner results (x1 + multi).
 * Uses DataService.addCardFromPull + pullGrant formatters.
 *
 * Usage: node tools/apply-dup-xp-display-patch.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'commands', 'banners.js');
let src = fs.readFileSync(file, 'utf8');
const before = src;
const norm = (s) => s.replace(/\r\n/g, '\n');

function replaceFlexible(haystack, needle, replacement) {
  const h = norm(haystack);
  const n = norm(needle);
  const idx = h.indexOf(n);
  if (idx === -1) return { ok: false, text: haystack };
  return { ok: true, text: h.slice(0, idx) + norm(replacement) + h.slice(idx + n.length) };
}

// --- imports ---
const impOld = `const { maybeSendDmHint } = require('../services/dmNotifier.js');`;
const impNew = `const { maybeSendDmHint, notifyLevelUps } = require('../services/dmNotifier.js');
const { formatDupTag, formatDupStatusLine } = require('../services/pullGrant.js');`;

let r = replaceFlexible(src, impOld, impNew);
if (!r.ok) {
  console.error('Import pattern not found (maybe already patched).');
} else {
  src = r.text;
  console.log('Patched imports');
}

// --- multi grant ---
const multiOld = `
      const alreadyOwned = DataService.userHasCard(userId, card.id);
      // Always call addCard: INSERT or (if duplicate) convert to XP
      DataService.addCard(userId, card.id, card.name);
      if (!alreadyOwned) {
        ownedNow += 1;
        if (ownedNow === poolSize) completedThis = true;
      }
      recordPull(userId, { cardId: card.id, name: card.name, banner: bannerId, rarity });
      const rar = RARITIES[rarity];
      const icon = emojiTag(getEmojiForCard(card.id)) || '';
      const rarLabel = rar ? \`\${rar.emoji} \${rarityLabel(userId, rarity)}\` : (isCoachBanner ? t(userId, 'team_master') : '?');
      results.push({
        name: card.name,
        icon,
        rar: rarLabel,
        neu: !alreadyOwned,
        pity: Boolean(pityForced),
        card,
        rarity
      });`;

const multiNew = `
      const grant = DataService.addCardFromPull(userId, card, rarity);
      if (grant.isNew) {
        ownedNow += 1;
        if (ownedNow === poolSize) completedThis = true;
      }
      recordPull(userId, { cardId: card.id, name: card.name, banner: bannerId, rarity });
      const rar = RARITIES[rarity];
      const icon = emojiTag(getEmojiForCard(card.id)) || '';
      const rarLabel = rar ? \`\${rar.emoji} \${rarityLabel(userId, rarity)}\` : (isCoachBanner ? t(userId, 'team_master') : '?');
      results.push({
        name: card.name,
        icon,
        rar: rarLabel,
        neu: grant.isNew,
        grant,
        pity: Boolean(pityForced),
        card,
        rarity
      });`;

r = replaceFlexible(src, multiOld, multiNew);
if (!r.ok) {
  // try without the Always call comment (if user has different version)
  const multiOld2 = `
      const alreadyOwned = DataService.userHasCard(userId, card.id);
      DataService.addCard(userId, card.id, card.name);
      if (!alreadyOwned) {
        ownedNow += 1;
        if (ownedNow === poolSize) completedThis = true;
      }
      recordPull(userId, { cardId: card.id, name: card.name, banner: bannerId, rarity });
      const rar = RARITIES[rarity];
      const icon = emojiTag(getEmojiForCard(card.id)) || '';
      const rarLabel = rar ? \`\${rar.emoji} \${rarityLabel(userId, rarity)}\` : (isCoachBanner ? t(userId, 'team_master') : '?');
      results.push({
        name: card.name,
        icon,
        rar: rarLabel,
        neu: !alreadyOwned,
        pity: Boolean(pityForced),
        card,
        rarity
      });`;
  r = replaceFlexible(src, multiOld2, multiNew);
}
if (!r.ok) {
  console.error('Multi-pull grant pattern not found.');
} else {
  src = r.text;
  console.log('Patched multi-pull grant');
}

// --- multi lines ---
const linesOld = `
    const lines = results.map((r, idx) => {
      if (r.miss) return \`**\${idx + 1}.** —\`;
      const tag = r.neu ? \` · \${t(userId, 'ban_new_short')}\` : \` · \${t(userId, 'ban_dup_short')}\`;
      const pity = r.pity ? \` · **PITY**\` : '';
      return \`**\${idx + 1}.** \${r.icon} **\${r.name}** · \${r.rar}\${tag}\${pity}\`;
    }).join('\\n');`;

const linesNew = `
    const lines = results.map((r, idx) => {
      if (r.miss) return \`**\${idx + 1}.** —\`;
      const tag = formatDupTag(userId, r.grant || { isNew: r.neu }, t);
      const pity = r.pity ? \` · **PITY**\` : '';
      return \`**\${idx + 1}.** \${r.icon} **\${r.name}** · \${r.rar}\${tag}\${pity}\`;
    }).join('\\n');`;

r = replaceFlexible(src, linesOld, linesNew);
if (!r.ok) {
  console.error('Multi lines pattern not found.');
} else {
  src = r.text;
  console.log('Patched multi lines');
}

// --- multi level-up DM (before maybeSendDmHint after multi publish) ---
const multiDmOld = `
    await maybeSendDmHint(interaction);
    return;
  }

  const { card: randomCard, rarity: rolledRarity, pityForced } = rollCard(allCards, bannerId, userId);`;

const multiDmNew = `
    const levelUps = results
      .filter(row => row.grant && row.grant.leveledUp)
      .map(row => ({
        cardId: row.card.id,
        cardName: row.card.name,
        newLevel: row.grant.newLevel
      }));
    if (levelUps.length) {
      try { await notifyLevelUps(interaction.user, levelUps); } catch (_) {}
    }
    await maybeSendDmHint(interaction);
    return;
  }

  const { card: randomCard, rarity: rolledRarity, pityForced } = rollCard(allCards, bannerId, userId);`;

r = replaceFlexible(src, multiDmOld, multiDmNew);
if (!r.ok) {
  console.error('Multi DM pattern not found.');
} else {
  src = r.text;
  console.log('Patched multi level-up DM');
}

// --- single grant ---
const singleOld = `
  const alreadyOwned = DataService.userHasCard(userId, randomCard.id);
  // Always call addCard: INSERT or (if duplicate) convert to XP
  DataService.addCard(userId, randomCard.id, randomCard.name);
  recordPull(userId, { cardId: randomCard.id, name: randomCard.name, banner: bannerId, rarity: rolledRarity });`;

const singleNew = `
  const grant = DataService.addCardFromPull(userId, randomCard, rolledRarity);
  const alreadyOwned = !grant.isNew;
  recordPull(userId, { cardId: randomCard.id, name: randomCard.name, banner: bannerId, rarity: rolledRarity });`;

r = replaceFlexible(src, singleOld, singleNew);
if (!r.ok) {
  const singleOld2 = `
  const alreadyOwned = DataService.userHasCard(userId, randomCard.id);
  DataService.addCard(userId, randomCard.id, randomCard.name);
  recordPull(userId, { cardId: randomCard.id, name: randomCard.name, banner: bannerId, rarity: rolledRarity });`;
  r = replaceFlexible(src, singleOld2, singleNew);
}
if (!r.ok) {
  console.error('Single-pull grant pattern not found.');
} else {
  src = r.text;
  console.log('Patched single-pull grant');
}

// --- single status + progress after XP ---
const statusOld = `
  const art = attachCardArt(randomCard);
  const cardProgress = getProgressForXp(alreadyOwned ? (DataService.getCardXp(userId, randomCard.id) || 0) : 0);
  const titleEmoji = emojiTag(getEmojiForCard(randomCard.id));
  const isCoach = randomCard.position === 'CO';

  let statusLine;
  if (justCompleted) statusLine = poolCompleteHint(bannerId, userId, allCards);
  else if (alreadyOwned) statusLine = \`🔁 **\${t(userId, 'ban_dup')}**\`;
  else statusLine = \`🆕 **\${t(userId, 'ban_new')}**\`;
  if (pityForced) statusLine += \`\\n\${t(userId, 'soft_pity')}\`;`;

const statusNew = `
  const art = attachCardArt(randomCard);
  const cardProgress = getProgressForXp(DataService.getCardXp(userId, randomCard.id) || 0);
  const titleEmoji = emojiTag(getEmojiForCard(randomCard.id));
  const isCoach = randomCard.position === 'CO';

  let statusLine;
  if (justCompleted) statusLine = poolCompleteHint(bannerId, userId, allCards);
  else statusLine = formatDupStatusLine(userId, grant, t);
  if (pityForced) statusLine += \`\\n\${t(userId, 'soft_pity')}\`;`;

r = replaceFlexible(src, statusOld, statusNew);
if (!r.ok) {
  console.error('Single status pattern not found.');
} else {
  src = r.text;
  console.log('Patched single status line');
}

// --- single level-up DM ---
const singleDmOld = `
  await maybeSendDmHint(interaction);
}

module.exports = {`;

const singleDmNew = `
  if (grant.leveledUp) {
    try {
      await notifyLevelUps(interaction.user, [{
        cardId: randomCard.id,
        cardName: randomCard.name,
        newLevel: grant.newLevel
      }]);
    } catch (_) {}
  }
  await maybeSendDmHint(interaction);
}

module.exports = {`;

r = replaceFlexible(src, singleDmOld, singleDmNew);
if (!r.ok) {
  console.error('Single DM pattern not found.');
} else {
  src = r.text;
  console.log('Patched single level-up DM');
}

if (norm(src) === norm(before)) {
  console.error('No changes written.');
  process.exit(1);
}

fs.writeFileSync(file, src);
console.log('OK -> src/commands/banners.js');
console.log('Next: git add / commit / push / node index.js');

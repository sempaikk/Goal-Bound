/**
 * Banner pools for /banners.
 */
const { getEmojiForCard } = require('../characterEmojis.js');
const { emojiTag } = require('../../utils/format.js');
const { PITY_SOFT } = require('../qolStore.js');
const { PASSIVES } = require('../coachPassives.js');

const BANNERS = {
  padrao: {
    id: 'padrao',
    name: 'Standard Banner',
    emoji: '🏟️',
    description: 'Field egoists under standard rarity weights.'
  },
  treinadores: {
    id: 'treinadores',
    name: 'Coaches Banner',
    emoji: '🧠',
    description:
      'Masters reshape your eleven + passive farm bonus.\n' +
      'Ego 4-2-3-1 · Noa 4-4-2 · Lavinho 4-3-3 · Snuffy 3-5-2'
  }
};

const DEFAULT_BANNER = 'padrao';

/** Weights → Ego 2% · Noa 8% · Lavinho 45% · Snuffy 45% */
const TREINADORES_WEIGHTS = {
  14: 2,
  15: 8,
  16: 45,
  17: 45
};

const TREINADORES_ODDS = [
  { id: 14, name: 'Jinpachi Ego', pct: '2%' },
  { id: 15, name: 'Noel Noa', pct: '8%' },
  { id: 16, name: 'Lavinho', pct: '45%' },
  { id: 17, name: 'Marc Snuffy', pct: '45%' }
];

function getBanner(id) {
  return BANNERS[id] || BANNERS[DEFAULT_BANNER];
}

function cardsForBanner(allCards, bannerId) {
  const id = bannerId || DEFAULT_BANNER;
  if (id === 'treinadores') {
    return allCards.filter(c => c.banner === 'treinadores');
  }
  return allCards.filter(c => !c.banner || c.banner === 'padrao');
}

function rollTreinadoresCard(pool) {
  if (!pool || pool.length === 0) return { card: null, rarity: null };

  let total = 0;
  const weighted = pool.map(c => {
    const w = TREINADORES_WEIGHTS[c.id] ?? 1;
    total += w;
    return { card: c, weight: w };
  });

  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return { card: entry.card, rarity: null };
  }

  const last = weighted[weighted.length - 1];
  return { card: last.card, rarity: null };
}

function treinadoresOddsLine() {
  return TREINADORES_ODDS.map(({ id, name, pct }) => {
    const tag = emojiTag(getEmojiForCard(id));
    const icon = tag ? `${tag} ` : '🎩 ';
    const bonus = PASSIVES[id]?.short ? ` · _${PASSIVES[id].short}_` : '';
    return `${icon}**${name}** · ${pct}${bonus}`;
  }).join('\n');
}

function padraoOddsLine() {
  return (
    '🔒 Locked · ~65.79%\n' +
    '👁️ Egoist · ~32.89%\n' +
    '💫 New Gen · ~1.32%\n' +
    `🔥 **Pity:** ${PITY_SOFT} rolls without New Gen → guaranteed New Gen`
  );
}

module.exports = {
  BANNERS,
  DEFAULT_BANNER,
  TREINADORES_WEIGHTS,
  getBanner,
  cardsForBanner,
  rollTreinadoresCard,
  treinadoresOddsLine,
  padraoOddsLine
};

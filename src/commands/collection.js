const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  AttachmentBuilder,
  SectionBuilder,
  ThumbnailBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { RARITIES, RARITY_ORDER } = require('../services/rarities.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { positionEmoji, safeTruncate, progressBar } = require('../utils/format.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const { buildCtaRow, openDestination } = require('../utils/nav.js');
const { t, rarityLabel } = require('../utils/i18n.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');
const {
  TIER_ALL,
  TIER_COACH,
  TIER_OPTIONS,
  ROLE_GK,
  ROLE_ATT,
  ROLE_MID,
  ROLE_DEF,
  parseTierFromQuery,
  encodeTierQuery,
  isTierQuery,
  textQuery,
  matchesTier,
  isRoleFilter
} = require('../utils/collectionFilter.js');

const CUSTOM_ID_PREFIX = 'collection';
const CARDS_PER_PAGE = 5;
const SORTS = ['rarity', 'level', 'name'];
const COACH_GROUP = 'COACH';

const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

function accentInt() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function sortLabelOf(userId, sort) {
  if (sort === 'level') return t(userId, 'col_sort_level');
  if (sort === 'name') return t(userId, 'col_sort_name');
  return t(userId, 'col_sort_rarity');
}

function tierLabelOf(userId, tier) {
  if (!tier || tier === TIER_ALL) return t(userId, 'col_tier_all');
  if (tier === TIER_COACH) return t(userId, 'profile_masters');
  if (tier === ROLE_GK) return t(userId, 'col_role_gk');
  if (tier === ROLE_ATT) return t(userId, 'col_role_att');
  if (tier === ROLE_MID) return t(userId, 'col_role_mid');
  if (tier === ROLE_DEF) return t(userId, 'col_role_def');
  return rarityLabel(userId, tier);
}

function localizedTierOptions(userId) {
  return TIER_OPTIONS.map(o => {
    let label;
    if (o.value === TIER_ALL) label = t(userId, 'col_tier_all_opt');
    else if (o.value === TIER_COACH) label = t(userId, 'profile_masters');
    else if (isRoleFilter(o.value)) label = tierLabelOf(userId, o.value);
    else label = rarityLabel(userId, o.value);
    return { label, value: o.value, emoji: o.emoji };
  });
}

function buildSortSelectId(viewerId, targetId, page) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':sortsel:' + page;
}

function buildTierSelectId(viewerId, targetId, page, sort) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':tiersel:' + page + ':' + sort;
}

function buildPageId(viewerId, targetId, page, sort, query) {
  const q = encodeURIComponent(query || '');
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':page:' + page + ':' + sort + ':' + q;
}

function buildNoopId(viewerId, targetId, page, sort) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':noop:' + page + ':' + sort;
}

function buildSearchId(viewerId, targetId, sort) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':search:' + sort;
}

function buildClearSearchId(viewerId, targetId, sort) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':clearq:' + sort;
}

function buildModalId(viewerId, targetId, sort) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':' + targetId + ':modal:' + sort;
}

function buildPickUserId(viewerId) {
  return CUSTOM_ID_PREFIX + ':' + viewerId + ':_:pickuser';
}

function parseCustomId(customId) {
  const parts = customId.split(':');
  const action = parts[3];
  let query = '';
  if (parts[6]) {
    try { query = decodeURIComponent(parts[6]); } catch { query = parts[6]; }
  }
  return {
    viewerId: parts[1],
    targetId: parts[2],
    action: action || 'page',
    page: parseInt(parts[4], 10) || 0,
    sort: SORTS.includes(parts[5]) ? parts[5] : (SORTS.includes(parts[4]) ? parts[4] : 'rarity'),
    query
  };
}

function ovrFromStats(card) {
  const s = card && card.stats;
  if (!s) return 70;
  const vals = [s.speed, s.technique, s.physique, s.tactical].filter(n => typeof n === 'number');
  if (!vals.length) return 70;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.min(99, Math.max(50, Math.round(50 + avg * 4.5)));
}

function resolveArtPath(card) {
  if (card && card.localImage) {
    const full = path.join(IMAGES_DIR, card.localImage);
    if (fs.existsSync(full)) return full;
    const underCards = path.join(IMAGES_DIR, 'cards', path.basename(card.localImage));
    if (fs.existsSync(underCards)) return underCards;
  }
  if (card && card.icon) {
    const full = path.join(ICONS_DIR, card.icon);
    if (fs.existsSync(full)) return full;
  }
  if (card && card.id != null) {
    const byId = path.join(IMAGES_DIR, 'cards', String(card.id) + '.png');
    if (fs.existsSync(byId)) return byId;
  }
  return null;
}

function buildCardEntries(validUserCards, cards, cardIdsInTeam, sort, query, userId) {
  const rarityRank = key => RARITY_ORDER.indexOf(key);
  const tier = parseTierFromQuery(query);
  const q = textQuery(query).toLowerCase();
  let sortedUserCards = validUserCards.slice();
  sortedUserCards = sortedUserCards.filter(uc => {
    const card = cards.find(c => c.id === uc.id);
    if (!card) return false;
    if (!matchesTier(card, tier)) return false;
    if (!q) return true;
    return (
      card.name.toLowerCase().includes(q) ||
      String(card.position || '').toLowerCase().includes(q) ||
      String(card.rarity || '').toLowerCase().includes(q) ||
      (card.position === 'CO' && (q.includes('coach') || q.includes('master') || q.includes('tecnico')))
    );
  });
  sortedUserCards.sort((a, b) => {
    const cardA = cards.find(c => c.id === a.id);
    const cardB = cards.find(c => c.id === b.id);
    if (!cardA || !cardB) return 0;
    if (sort === 'level') {
      const aCoach = cardA.position === 'CO';
      const bCoach = cardB.position === 'CO';
      if (aCoach && !bCoach) return 1;
      if (!aCoach && bCoach) return -1;
      if (aCoach && bCoach) return cardA.name.localeCompare(cardB.name);
      const ld = (b.level || 0) - (a.level || 0);
      if (ld !== 0) return ld;
      return cardA.name.localeCompare(cardB.name);
    }
    if (sort === 'name') return cardA.name.localeCompare(cardB.name);
    const aCoach = cardA.position === 'CO';
    const bCoach = cardB.position === 'CO';
    if (aCoach && !bCoach) return 1;
    if (!aCoach && bCoach) return -1;
    if (aCoach && bCoach) return cardA.name.localeCompare(cardB.name);
    const rankDiff = rarityRank(cardB.rarity) - rarityRank(cardA.rarity);
    return rankDiff !== 0 ? rankDiff : cardA.name.localeCompare(cardB.name);
  });
  const entries = [];
  const useGrouped = sort === 'rarity' && !q && tier === TIER_ALL;
  if (useGrouped) {
    for (const key of RARITY_ORDER.slice().reverse()) {
      const cardsInGroup = sortedUserCards.filter(uc => {
        const card = cards.find(c => c.id === uc.id);
        return card && card.position !== 'CO' && card.rarity === key;
      });
      for (const userCard of cardsInGroup) {
        entries.push(makeEntry(userCard, cards, RARITIES[key], cardIdsInTeam, key, userId));
      }
    }
    const coaches = sortedUserCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position === 'CO';
    });
    for (const userCard of coaches) {
      entries.push(makeEntry(userCard, cards, null, cardIdsInTeam, COACH_GROUP, userId));
    }
  } else {
    for (const userCard of sortedUserCards) {
      const card = cards.find(c => c.id === userCard.id);
      if (!card) continue;
      if (card.position === 'CO') {
        entries.push(makeEntry(userCard, cards, null, cardIdsInTeam, COACH_GROUP, userId));
      } else {
        const rarity = RARITIES[card.rarity] || RARITIES.LOCKED;
        entries.push(makeEntry(userCard, cards, rarity, cardIdsInTeam, card.rarity, userId));
      }
    }
  }
  return entries;
}

function makeEntry(userCard, cards, rarity, cardIdsInTeam, rarityKey, userId) {
  const card = cards.find(c => c.id === userCard.id);
  const isCoach = card.position === 'CO';
  const emoji = isCoach ? '🎩' : ((rarity && rarity.emoji) || '🃏');
  const teamBadge = cardIdsInTeam.has(userCard.id) ? ' 📌' : '';
  let line;
  if (isCoach) {
    line = emoji + ' **' + card.name + '** 🎩 `' + t(userId, 'col_master_tag') + '`;
  } else {
    line = emoji + ' **' + card.name + '** `Lv.' + userCard.level + '`' + teamBadge + ' ' + positionEmoji(card.position) + ' `' + card.position + '`;
  }
  return {
    rarityKey: rarityKey,
    line: line,
    name: card.name,
    card: card,
    level: userCard.level || 0,
    onTeam: cardIdsInTeam.has(userCard.id)
  };
}

function buildBreakdown(validUserCards, cards, userId) {
  const lines = RARITY_ORDER.map(key => {
    const totalInTier = cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (totalInTier === 0) return null;
    const ownedInTier = validUserCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position !== 'CO' && card.rarity === key;
    }).length;
    return RARITIES[key].emoji + ' **' + rarityLabel(userId, key) + '** ' + ownedInTier + '/' + totalInTier;
  }).filter(Boolean);
  const coachTotal = cards.filter(c => c.position === 'CO').length;
  if (coachTotal > 0) {
    const coachOwned = validUserCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position === 'CO';
    }).length;
    lines.push('🎩 **' + t(userId, 'profile_masters') + '** ' + coachOwned + '/' + coachTotal);
  }
  return lines.join('  ·  ');
}

function buildComponents(viewerId, targetId, page, totalPages, sort, query) {
  const rows = [];
  const currentTier = parseTierFromQuery(query);
  const uid = viewerId;
  rows.push(new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(buildPickUserId(viewerId))
      .setPlaceholder(t(uid, 'col_switch'))
      .setMinValues(1)
      .setMaxValues(1)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildTierSelectId(viewerId, targetId, page, sort))
      .setPlaceholder(t(uid, 'col_filter_ph', { label: tierLabelOf(uid, currentTier) }))
      .addOptions(localizedTierOptions(uid).map(o => ({
        label: o.label.slice(0, 100),
        value: o.value,
        emoji: o.emoji,
        default: currentTier === o.value
      })))
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildSortSelectId(viewerId, targetId, page))
      .setPlaceholder(t(uid, 'col_order_ph', { sort: sortLabelOf(uid, sort) }))
      .addOptions(
        { label: t(uid, 'col_sort_rarity'), description: t(uid, 'col_sort_rarity_desc'), value: 'rarity', default: sort === 'rarity' },
        { label: t(uid, 'col_sort_level'), description: t(uid, 'col_sort_level_desc'), value: 'level', default: sort === 'level' },
        { label: t(uid, 'col_sort_name'), description: t(uid, 'col_sort_name_desc'), value: 'name', default: sort === 'name' }
      )
  ));
  const utilButtons = [
    new ButtonBuilder()
      .setCustomId(buildSearchId(viewerId, targetId, sort))
      .setLabel(textQuery(query) ? t(uid, 'col_filter', { q: textQuery(query).slice(0, 18) }) : t(uid, 'col_search'))
      .setEmoji('🔍')
      .setStyle(textQuery(query) ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ];
  if (query) {
    utilButtons.push(
      new ButtonBuilder()
        .setCustomId(buildClearSearchId(viewerId, targetId, sort))
        .setLabel(t(uid, 'col_clear'))
        .setStyle(ButtonStyle.Danger)
    );
  }
  rows.push(new ActionRowBuilder().addComponents(...utilButtons));
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(buildPageId(viewerId, targetId, page - 1, sort, query)).setLabel(t(uid, 'col_prev')).setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
      new ButtonBuilder().setCustomId(buildNoopId(viewerId, targetId, page, sort)).setLabel((page + 1) + ' / ' + totalPages).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(buildPageId(viewerId, targetId, page + 1, sort, query)).setLabel(t(uid, 'col_next')).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    ));
  }
  return rows;
}

function buildCatalogRow(entry, index) {
  const card = entry.card;
  const level = entry.level;
  const onTeam = entry.onTeam;
  const isCoach = card.position === 'CO';
  const ovr = ovrFromStats(card);
  const pos = isCoach ? 'CO' : String(card.position || '?');
  const rarity = isCoach ? null : (RARITIES[card.rarity] || RARITIES.LOCKED);
  const emoji = isCoach ? '🎩' : ((rarity && rarity.emoji) || '🃏');
  const team = onTeam ? ' · 📌' : '';

  const title = '**' + index + '. ' + card.name + '**';
  const detail = isCoach
    ? (emoji + ' Master · OVR ' + ovr)
    : (emoji + ' ' + pos + ' · OVR ' + ovr + ' · Lv.' + level + team);
  const content = title + '\n' + detail;

  const artPath = resolveArtPath(card);
  if (artPath) {
    const filename = 'card_' + card.id + '.png';
    const file = new AttachmentBuilder(artPath, { name: filename });
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(content, 900)))
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL('attachment://' + filename)
          .setDescription(card.name)
      );
    return { section: section, file: file };
  }

  return {
    text: new TextDisplayBuilder().setContent(safeTruncate(content + '\n-# (sem arte)', 900))
  };
}

async function buildCollectionContainer(opts) {
  const username = opts.username;
  const entries = opts.entries;
  const page = opts.page;
  const cards = opts.cards;
  const validUserCards = opts.validUserCards;
  const teamCount = opts.teamCount;
  const isSelf = opts.isSelf;
  const sort = opts.sort;
  const query = opts.query;
  const viewerId = opts.viewerId;
  const targetId = opts.targetId;

  const totalPages = Math.max(1, Math.ceil(entries.length / CARDS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * CARDS_PER_PAGE;
  const pageEntries = entries.slice(start, start + CARDS_PER_PAGE);
  const owned = validUserCards.length;
  const poolSize = cards.length;
  const isComplete = owned === poolSize && poolSize > 0;
  const remaining = Math.max(0, poolSize - owned);
  const sortLabel = sortLabelOf(viewerId, sort);
  const tier = parseTierFromQuery(query);
  const progressLine = isComplete
    ? t(viewerId, 'col_full_set', { owned: owned, pool: poolSize })
    : t(viewerId, 'col_left', { bar: progressBar(owned, poolSize, 10), n: remaining });
  let filterLine = null;
  if (isTierQuery(query) && tier !== TIER_ALL) {
    if (isRoleFilter(tier)) {
      filterLine = t(viewerId, 'col_filter_role', {
        role: tierLabelOf(viewerId, tier),
        n: t(viewerId, 'col_n_cards', { n: entries.length })
      });
    } else {
      filterLine = t(viewerId, 'col_filter_tier', {
        tier: tierLabelOf(viewerId, tier),
        n: t(viewerId, 'col_n_cards', { n: entries.length })
      });
    }
  } else if (textQuery(query)) {
    filterLine = t(viewerId, 'col_filter_search', {
      q: textQuery(query),
      n: t(viewerId, 'col_n_matches', { n: entries.length })
    });
  }
  let header = '# ' + (isComplete ? '🏁' : '📔') + ' ' + t(viewerId, 'col_binder_title', { user: username }) + '\n';
  if (!isSelf) header += t(viewerId, 'col_viewing') + '\n';
  header += progressLine;
  if (filterLine) header += '\n' + filterLine;
  const meta = t(viewerId, 'col_on_pitch', { n: teamCount, sort: sortLabel }) + '\n' +
    '🏷️ ' + (buildBreakdown(validUserCards, cards, viewerId) || '—');

  const container = new ContainerBuilder()
    .setAccentColor(isComplete ? 0x57f287 : accentInt())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeTruncate(header, 3800)),
      new TextDisplayBuilder().setContent(safeTruncate(meta, 1000))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const files = [];
  for (let i = 0; i < pageEntries.length; i++) {
    const row = buildCatalogRow(pageEntries[i], start + i + 1);
    if (row.section) {
      container.addSectionComponents(row.section);
      if (row.file) files.push(row.file);
    } else if (row.text) {
      container.addTextDisplayComponents(row.text);
    }
  }

  if (pageEntries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t(viewerId, 'col_empty_page') || '_Nenhuma carta nesta página._')
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  for (const row of buildComponents(viewerId, targetId, safePage, totalPages, sort, query)) {
    container.addActionRowComponents(row);
  }

  return { container: container, safePage: safePage, totalPages: totalPages, files: files };
}

async function renderCollectionFor(viewerId, targetId, username, avatarURL, page, isSelf, sort, query) {
  if (sort === undefined) sort = 'rarity';
  if (query === undefined) query = '';
  const cards = DataService.loadCards();
  const validUserCards = DataService.getValidUserCards(targetId, cards);
  const teamRows = DataService.getTeam(targetId);
  const cardIdsInTeam = new Set(teamRows.map(row => row.cardId));
  const entries = buildCardEntries(validUserCards, cards, cardIdsInTeam, sort, query, viewerId);
  const built = await buildCollectionContainer({
    username: username, entries: entries, page: page, cards: cards, validUserCards: validUserCards,
    teamCount: teamRows.length, isSelf: isSelf, sort: sort, query: query, viewerId: viewerId, targetId: targetId
  });
  return {
    container: built.container,
    totalCards: validUserCards.length,
    poolSize: cards.length,
    isEmpty: validUserCards.length === 0,
    safePage: built.safePage,
    totalPages: built.totalPages,
    files: built.files
  };
}

async function replyCollectionV2(interaction, result, isEdit) {
  const payload = {
    components: [result.container],
    flags: MessageFlags.IsComponentsV2,
    files: (result.files && result.files.length) ? result.files : []
  };
  if (isEdit || interaction.deferred || interaction.replied) {
    try {
      await interaction.editReply(payload);
    } catch (e) {
      await interaction.followUp({ components: payload.components, flags: MessageFlags.IsComponentsV2 | 64, files: payload.files });
    }
  } else {
    await interaction.reply(payload);
  }
}

function emptyBinderPayload(ownerId, isSelf, username) {
  return {
    embeds: [
      buildStatusEmbed(
        'WARNING',
        t(ownerId, 'col_empty_title'),
        isSelf
          ? (t(ownerId, 'empty_binder') + '\n\n' + t(ownerId, 'empty_binder_cta'))
          : t(ownerId, 'col_empty_other', { user: username })
      )
    ],
    components: isSelf ? [buildCtaRow(ownerId, 'empty_binder')] : [],
    files: []
  };
}

async function openCollectionPanel(interaction, userId, username, avatarURL) {
  DataService.ensureUser(userId, username);
  const result = await renderCollectionFor(userId, userId, username, avatarURL, 0, true, 'rarity', '');
  if (result.isEmpty) {
    const payload = emptyBinderPayload(userId, true, username);
    try { await interaction.editReply(payload); } catch (e) { await interaction.followUp({ embeds: payload.embeds, components: payload.components, flags: 64 }); }
    return;
  }
  await replyCollectionV2(interaction, result, true);
}

async function openCollectionPanelForTarget(interaction, viewerId, targetUser) {
  const targetId = targetUser.id;
  const isSelf = viewerId === targetId;
  DataService.ensureUser(targetId, targetUser.username);
  const result = await renderCollectionFor(viewerId, targetId, targetUser.username, targetUser.displayAvatarURL(), 0, isSelf, 'rarity', '');
  if (result.isEmpty) {
    const payload = emptyBinderPayload(viewerId, isSelf, targetUser.username);
    try { await interaction.editReply(payload); } catch (e) { await interaction.followUp({ embeds: payload.embeds, components: payload.components, flags: 64 }); }
    return;
  }
  await replyCollectionV2(interaction, result, true);
}

module.exports = {
  renderCollectionFor: renderCollectionFor,
  openCollectionPanel: openCollectionPanel,
  openCollectionPanelForTarget: openCollectionPanelForTarget,
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('collection')
      .setDescription('Browse a binder — tier, role, search, order')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('Whose binder to view (default: you)').setRequired(false),
          'De quem ver o binder (padrao: voce)'
        )
      )
      .addStringOption(opt =>
        optionPtBr(
          opt.setName('filter').setDescription('Filter by card name (autocomplete)').setAutocomplete(true).setRequired(false),
          'Filtrar pelo nome da carta (autocomplete)'
        )
      ),
    'Binder — raridade, posicao, busca e ordem'
  ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'filter') { await interaction.respond([]); return; }
    const q = String(focused.value || '').trim().toLowerCase();
    const cards = DataService.loadCards();
    let pool = cards.map(c => c.name);
    if (q) pool = pool.filter(n => n.toLowerCase().includes(q));
    pool.sort((a, b) => a.localeCompare(b));
    await interaction.respond([...new Set(pool)].slice(0, 25).map(name => ({ name: name.slice(0, 100), value: name.slice(0, 100) })));
  },

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      const filterOpt = interaction.options.getString('filter') || '';
      if (target.bot) {
        await interaction.reply({ embeds: [buildStatusEmbed('WARNING', t(interaction.user.id, 'col_bots'), config.MESSAGES.BOTS_DONT_COLLECT)], flags: 64 });
        return;
      }
      const viewerId = interaction.user.id;
      const targetId = target.id;
      const isSelf = viewerId === targetId;
      DataService.ensureUser(targetId, target.username);
      const result = await renderCollectionFor(viewerId, targetId, target.username, target.displayAvatarURL(), 0, isSelf, 'rarity', filterOpt);
      if (result.isEmpty) {
        await interaction.reply({
          embeds: emptyBinderPayload(viewerId, isSelf, target.username).embeds,
          components: emptyBinderPayload(viewerId, isSelf, target.username).components,
          flags: isSelf ? 0 : 64
        });
        return;
      }
      await replyCollectionV2(interaction, result, false);
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /collection command', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)], flags: 64 });
        }
      } catch (e) {}
    }
  },

  async handleComponent(interaction) {
    const parsed = parseCustomId(interaction.customId);
    let viewerId = parsed.viewerId;
    let targetId = parsed.targetId;
    let action = parsed.action;
    let page = parsed.page;
    let sort = parsed.sort;
    let query = parsed.query;
    if (action === 'nav') {
      await openDestination(interaction, interaction.values && interaction.values[0], viewerId);
      return;
    }
    if (action === 'sortsel') {
      page = parseInt(String(interaction.customId).split(':')[4], 10) || 0;
      sort = (interaction.values && interaction.values[0]) || 'rarity';
      if (!SORTS.includes(sort)) sort = 'rarity';
      action = 'sort';
    }
    if (action === 'tiersel') {
      const parts = String(interaction.customId).split(':');
      page = 0;
      sort = SORTS.includes(parts[5]) ? parts[5] : 'rarity';
      const tier = (interaction.values && interaction.values[0]) || TIER_ALL;
      query = encodeTierQuery(tier);
      action = 'sort';
    }
    if (interaction.user.id !== viewerId) {
      await interaction.reply({ embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_not_yours_title'), t(viewerId, 'col_not_yours'))], flags: 64 });
      return;
    }
    if (action === 'pickuser') {
      await interaction.deferUpdate();
      try {
        let selected = interaction.users && interaction.users.first && interaction.users.first();
        if (!selected && interaction.values && interaction.values[0]) {
          selected = await interaction.client.users.fetch(interaction.values[0]).catch(() => null);
        }
        if (!selected || selected.bot) {
          await interaction.followUp({ embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_pick_human'), config.MESSAGES.BOTS_DONT_COLLECT)], flags: 64 });
          return;
        }
        const isSelf = selected.id === viewerId;
        DataService.ensureUser(selected.id, selected.username);
        const result = await renderCollectionFor(viewerId, selected.id, selected.username, selected.displayAvatarURL(), 0, isSelf, 'rarity', '');
        if (result.isEmpty) {
          await interaction.followUp({ embeds: emptyBinderPayload(viewerId, isSelf, selected.username).embeds, components: emptyBinderPayload(viewerId, isSelf, selected.username).components, flags: 64 });
          return;
        }
        await replyCollectionV2(interaction, result, true);
      } catch (error) {
        logger.error('Error handling collection user select', error.message);
      }
      return;
    }
    if (action === 'noop') { await interaction.deferUpdate(); return; }
    if (action === 'search') {
      const modal = new ModalBuilder().setCustomId(buildModalId(viewerId, targetId, sort)).setTitle(t(viewerId, 'col_modal_title').slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId('query')
        .setLabel(t(viewerId, 'col_modal_label').slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(t(viewerId, 'col_modal_ph').slice(0, 100))
        .setRequired(true)
        .setMaxLength(40);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    await interaction.deferUpdate();
    try {
      if (action === 'clearq') { query = ''; page = 0; }
      if (!targetId || targetId === '_' || targetId === '_ ') targetId = viewerId;
      const isSelf = viewerId === targetId;
      let username = interaction.user.username;
      let avatarURL = interaction.user.displayAvatarURL();
      if (!isSelf) {
        try {
          const user = await interaction.client.users.fetch(targetId);
          username = user.username;
          avatarURL = user.displayAvatarURL();
        } catch (e) { username = t(viewerId, 'col_player'); }
      }
      const nextPage = action === 'sort' ? 0 : page;
      const result = await renderCollectionFor(viewerId, targetId, username, avatarURL, nextPage, isSelf, sort, query);
      await replyCollectionV2(interaction, result, true);
    } catch (error) {
      logger.error('Error handling /collection page', error.message);
    }
  },

  async handleModal(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const viewerId = parts[1];
    let targetId = parts[2];
    const sort = SORTS.includes(parts[4]) ? parts[4] : 'rarity';
    if (interaction.user.id !== viewerId) {
      await interaction.reply({ embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_not_yours_title'), t(viewerId, 'col_not_yours'))], flags: 64 });
      return;
    }
    if (!targetId || targetId === '_' || targetId === '_ ') targetId = viewerId;
    const query = (interaction.fields.getTextInputValue('query') || '').trim();
    await interaction.deferUpdate();
    try {
      const isSelf = viewerId === targetId;
      let username = interaction.user.username;
      let avatarURL = interaction.user.displayAvatarURL();
      if (!isSelf) {
        try {
          const user = await interaction.client.users.fetch(targetId);
          username = user.username;
          avatarURL = user.displayAvatarURL();
        } catch (e) { username = t(viewerId, 'col_player'); }
      }
      const result = await renderCollectionFor(viewerId, targetId, username, avatarURL, 0, isSelf, sort, query);
      await replyCollectionV2(interaction, result, true);
    } catch (error) {
      logger.error('Error handling collection modal', error.message);
    }
  }
};

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
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
const { safeTruncate, progressBar } = require('../utils/format.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const { buildCtaRow, openDestination } = require('../utils/nav.js');
const { t, rarityLabel } = require('../utils/i18n.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');
const {
  TIER_ALL, TIER_COACH, TIER_OPTIONS, ROLE_GK, ROLE_ATT, ROLE_MID, ROLE_DEF,
  parseTierFromQuery, encodeTierQuery, isTierQuery, textQuery, matchesTier, isRoleFilter
} = require('../utils/collectionFilter.js');

const CUSTOM_ID_PREFIX = 'collection';
const CARDS_PER_PAGE = 5;
const SORTS = ['rarity', 'level', 'name'];
const COACH_GROUP = 'COACH';
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');
const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

function accentInt() {
  const hex = String((config.COLORS && config.COLORS.PRIMARY) || '#FF4D8D').replace('#', '');
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
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:sortsel:${page}`;
}
function buildTierSelectId(viewerId, targetId, page, sort) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:tiersel:${page}:${sort}`;
}
function buildPageId(viewerId, targetId, page, sort, query) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:page:${page}:${sort}:${encodeURIComponent(query || '')}`;
}
function buildNoopId(viewerId, targetId, page, sort) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:noop:${page}:${sort}`;
}
function buildSearchId(viewerId, targetId, sort) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:search:${sort}`;
}
function buildClearSearchId(viewerId, targetId, sort) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:clearq:${sort}`;
}
function buildModalId(viewerId, targetId, sort) {
  return `${CUSTOM_ID_PREFIX}:${viewerId}:${targetId}:modal:${sort}`;
}

function parseCustomId(customId) {
  const parts = customId.split(':');
  let query = '';
  if (parts[6]) {
    try { query = decodeURIComponent(parts[6]); } catch { query = parts[6]; }
  }
  return {
    viewerId: parts[1],
    targetId: parts[2],
    action: parts[3] || 'page',
    page: parseInt(parts[4], 10) || 0,
    sort: SORTS.includes(parts[5]) ? parts[5] : (SORTS.includes(parts[4]) ? parts[4] : 'rarity'),
    query
  };
}

function ovrFromStats(card) {
  const s = card?.stats;
  if (!s) return 70;
  const vals = [s.speed, s.technique, s.physique, s.tactical].filter(n => typeof n === 'number');
  if (!vals.length) return 70;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.min(99, Math.max(50, Math.round(50 + avg * 4.5)));
}

function resolveArtPath(card) {
  if (card?.localImage) {
    const full = path.join(IMAGES_DIR, card.localImage);
    if (fs.existsSync(full)) return full;
    const underCards = path.join(IMAGES_DIR, 'cards', path.basename(card.localImage));
    if (fs.existsSync(underCards)) return underCards;
  }
  if (card?.icon) {
    const full = path.join(ICONS_DIR, card.icon);
    if (fs.existsSync(full)) return full;
  }
  if (card?.id != null) {
    const byId = path.join(IMAGES_DIR, 'cards', `${card.id}.png`);
    if (fs.existsSync(byId)) return byId;
  }
  return null;
}

function makeEntry(userCard, cards, rarity, cardIdsInTeam, rarityKey) {
  const card = cards.find(c => c.id === userCard.id);
  return {
    rarityKey,
    name: card.name,
    card,
    level: userCard.level || 0,
    onTeam: cardIdsInTeam.has(userCard.id)
  };
}

function buildCardEntries(validUserCards, cards, cardIdsInTeam, sort, query) {
  const rarityRank = key => RARITY_ORDER.indexOf(key);
  const tier = parseTierFromQuery(query);
  const q = textQuery(query).toLowerCase();
  let sortedUserCards = validUserCards.slice().filter(uc => {
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
      for (const userCard of sortedUserCards.filter(uc => {
        const card = cards.find(c => c.id === uc.id);
        return card && card.position !== 'CO' && card.rarity === key;
      })) {
        entries.push(makeEntry(userCard, cards, RARITIES[key], cardIdsInTeam, key));
      }
    }
    for (const userCard of sortedUserCards.filter(uc => {
      const card = cards.find(c => c.id === uc.id);
      return card && card.position === 'CO';
    })) {
      entries.push(makeEntry(userCard, cards, null, cardIdsInTeam, COACH_GROUP));
    }
  } else {
    for (const userCard of sortedUserCards) {
      const card = cards.find(c => c.id === userCard.id);
      if (!card) continue;
      if (card.position === 'CO') {
        entries.push(makeEntry(userCard, cards, null, cardIdsInTeam, COACH_GROUP));
      } else {
        entries.push(makeEntry(userCard, cards, RARITIES[card.rarity] || RARITIES.LOCKED, cardIdsInTeam, card.rarity));
      }
    }
  }
  return entries;
}

/** Controls: Filtrar + Ordenar + Buscar — no UserSelect (use slash user:) */
function buildComponents(viewerId, targetId, page, totalPages, sort, query) {
  const rows = [];
  const currentTier = parseTierFromQuery(query);
  const uid = viewerId;

  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildTierSelectId(viewerId, targetId, page, sort))
      .setPlaceholder(`Filtrar · ${tierLabelOf(uid, currentTier)}`.slice(0, 100))
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
      .setPlaceholder(`Ordenar · ${sortLabelOf(uid, sort)}`.slice(0, 100))
      .addOptions(
        { label: t(uid, 'col_sort_rarity'), description: t(uid, 'col_sort_rarity_desc'), value: 'rarity', default: sort === 'rarity' },
        { label: t(uid, 'col_sort_level'), description: t(uid, 'col_sort_level_desc'), value: 'level', default: sort === 'level' },
        { label: t(uid, 'col_sort_name'), description: t(uid, 'col_sort_name_desc'), value: 'name', default: sort === 'name' }
      )
  ));

  const util = [
    new ButtonBuilder()
      .setCustomId(buildSearchId(viewerId, targetId, sort))
      .setLabel(textQuery(query) ? `Busca: ${textQuery(query).slice(0, 16)}` : 'Buscar')
      .setEmoji('🔍')
      .setStyle(textQuery(query) ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ];
  if (query) {
    util.push(
      new ButtonBuilder()
        .setCustomId(buildClearSearchId(viewerId, targetId, sort))
        .setLabel('Limpar')
        .setStyle(ButtonStyle.Danger)
    );
  }
  rows.push(new ActionRowBuilder().addComponents(...util));

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildPageId(viewerId, targetId, 0, sort, query))
        .setLabel('«')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(buildPageId(viewerId, targetId, page - 1, sort, query))
        .setLabel('‹')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(buildNoopId(viewerId, targetId, page, sort))
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(buildPageId(viewerId, targetId, page + 1, sort, query))
        .setLabel('›')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(buildPageId(viewerId, targetId, totalPages - 1, sort, query))
        .setLabel('»')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    ));
  }
  return rows;
}

/** Arena-style row: **N. Name** / POS · OVR · Lv · pin | thumb */
function buildCatalogRow(entry, index) {
  const card = entry.card;
  const level = entry.level;
  const onTeam = entry.onTeam;
  const isCoach = card.position === 'CO';
  const ovr = ovrFromStats(card);
  const pos = isCoach ? 'Master' : String(card.position || '?');
  const rarity = isCoach ? null : (RARITIES[card.rarity] || RARITIES.LOCKED);
  const emoji = isCoach ? '🎩' : ((rarity && rarity.emoji) || '🃏');
  const team = onTeam ? ' · 📌' : '';
  const title = `**${index}. ${card.name}**`;
  const detail = isCoach
    ? `${emoji} ${pos} · OVR ${ovr} · ID:${card.id}`
    : `${emoji} ${pos} · OVR ${ovr} · Lv.${level}${team} · ID:${card.id}`;
  const content = `${title}\n${detail}`;
  const artPath = resolveArtPath(card);
  if (artPath) {
    const filename = `card_${card.id}.png`;
    const file = new AttachmentBuilder(artPath, { name: filename });
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(content, 900)))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(`attachment://${filename}`).setDescription(card.name)
      );
    return { section, file };
  }
  return {
    text: new TextDisplayBuilder().setContent(safeTruncate(`${content}\n-# (sem arte)`, 900))
  };
}

async function buildCollectionContainer(opts) {
  const {
    username, entries, page, cards, validUserCards,
    teamCount, isSelf, sort, query, viewerId, targetId, avatarURL
  } = opts;

  const totalPages = Math.max(1, Math.ceil(entries.length / CARDS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * CARDS_PER_PAGE;
  const pageEntries = entries.slice(start, start + CARDS_PER_PAGE);
  const owned = validUserCards.length;
  const poolSize = cards.length;
  const isComplete = owned === poolSize && poolSize > 0;
  const remaining = Math.max(0, poolSize - owned);
  const tier = parseTierFromQuery(query);

  const files = [];

  // Featured thumb: first card on page, else user avatar
  let headerThumb = null;
  if (pageEntries[0]) {
    const art = resolveArtPath(pageEntries[0].card);
    if (art) {
      const fname = `header_${pageEntries[0].card.id}.png`;
      files.push(new AttachmentBuilder(art, { name: fname }));
      headerThumb = `attachment://${fname}`;
    }
  }
  if (!headerThumb && avatarURL) headerThumb = avatarURL;

  const title = isComplete ? `🏁 Binder de ${username}` : `📔 Binder de ${username}`;
  const subtitle = isSelf
    ? 'Navegue pelas cartas do binder. Use filtros e ordenação abaixo.'
    : `Binder de **${username}** · só leitura`;
  const progress = isComplete
    ? `Completo · **${owned}/${poolSize}** · em campo **${teamCount}/11**`
    : `${progressBar(owned, poolSize, 8)} **${owned}/${poolSize}** · faltam **${remaining}** · em campo **${teamCount}/11**`;

  let statusLine = `Filtro: **${tierLabelOf(viewerId, tier)}** · Ordenação: **${sortLabelOf(viewerId, sort)}**`;
  if (textQuery(query)) statusLine += ` · Busca: **${textQuery(query)}**`;

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${title}`),
      new TextDisplayBuilder().setContent(subtitle),
      new TextDisplayBuilder().setContent(`-# ${progress}`)
    );
  if (headerThumb) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(headerThumb).setDescription(username)
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(isComplete ? 0x57f287 : accentInt())
    .addSectionComponents(headerSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLine));

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
      new TextDisplayBuilder().setContent('_Nenhuma carta neste filtro. Tente **Limpar** ou outro tier._')
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Página **${safePage + 1}/${totalPages}** · **${entries.length}** carta(s) neste filtro · ${owned} no binder`
      )
    );

  for (const row of buildComponents(viewerId, targetId, safePage, totalPages, sort, query)) {
    container.addActionRowComponents(row);
  }

  return { container, safePage, totalPages, files };
}

async function renderCollectionFor(viewerId, targetId, username, avatarURL, page, isSelf, sort, query) {
  if (sort === undefined) sort = 'rarity';
  if (query === undefined) query = '';
  const cards = DataService.loadCards();
  const validUserCards = DataService.getValidUserCards(targetId, cards);
  const teamRows = DataService.getTeam(targetId);
  const cardIdsInTeam = new Set(teamRows.map(row => row.cardId));
  const entries = buildCardEntries(validUserCards, cards, cardIdsInTeam, sort, query);
  const built = await buildCollectionContainer({
    username,
    entries,
    page,
    cards,
    validUserCards,
    teamCount: teamRows.length,
    isSelf,
    sort,
    query,
    viewerId,
    targetId,
    avatarURL
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
    } catch {
      await interaction.followUp({
        components: payload.components,
        flags: MessageFlags.IsComponentsV2 | 64,
        files: payload.files
      });
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
          ? `${t(ownerId, 'empty_binder')}\n\n${t(ownerId, 'empty_binder_cta')}`
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
    try { await interaction.editReply(payload); } catch { await interaction.followUp({ embeds: payload.embeds, components: payload.components, flags: 64 }); }
    return;
  }
  await replyCollectionV2(interaction, result, true);
}

async function openCollectionPanelForTarget(interaction, viewerId, targetUser) {
  const targetId = targetUser.id;
  const isSelf = viewerId === targetId;
  DataService.ensureUser(targetId, targetUser.username);
  const result = await renderCollectionFor(
    viewerId, targetId, targetUser.username, targetUser.displayAvatarURL(), 0, isSelf, 'rarity', ''
  );
  if (result.isEmpty) {
    const payload = emptyBinderPayload(viewerId, isSelf, targetUser.username);
    try { await interaction.editReply(payload); } catch { await interaction.followUp({ embeds: payload.embeds, components: payload.components, flags: 64 }); }
    return;
  }
  await replyCollectionV2(interaction, result, true);
}

module.exports = {
  renderCollectionFor,
  openCollectionPanel,
  openCollectionPanelForTarget,
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('collection')
      .setDescription('Veja e filtre o binder de cartas — raridade, posicao, busca e ordem')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('De quem ver o binder (padrao: voce)').setRequired(false),
          'De quem ver o binder (padrao: voce)'
        )
      )
      .addStringOption(opt =>
        optionPtBr(
          opt.setName('filter').setDescription('Filtrar pelo nome da carta (autocomplete)').setAutocomplete(true).setRequired(false),
          'Filtrar pelo nome da carta (autocomplete)'
        )
      ),
    'Veja e filtre o binder de cartas — raridade, posicao, busca e ordem'
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
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', t(interaction.user.id, 'col_bots'), config.MESSAGES.BOTS_DONT_COLLECT)],
          flags: 64
        });
        return;
      }
      const viewerId = interaction.user.id;
      const targetId = target.id;
      const isSelf = viewerId === targetId;
      DataService.ensureUser(targetId, target.username);
      const result = await renderCollectionFor(
        viewerId, targetId, target.username, target.displayAvatarURL(), 0, isSelf, 'rarity', filterOpt
      );
      if (result.isEmpty) {
        const empty = emptyBinderPayload(viewerId, isSelf, target.username);
        await interaction.reply({ embeds: empty.embeds, components: empty.components, flags: isSelf ? 0 : 64 });
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
      } catch { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const parsed = parseCustomId(interaction.customId);
    let { viewerId, targetId, action, page, sort, query } = parsed;

    if (action === 'nav') {
      await openDestination(interaction, interaction.values?.[0], viewerId);
      return;
    }
    if (action === 'sortsel') {
      page = parseInt(String(interaction.customId).split(':')[4], 10) || 0;
      sort = interaction.values?.[0] || 'rarity';
      if (!SORTS.includes(sort)) sort = 'rarity';
      action = 'sort';
    }
    if (action === 'tiersel') {
      const parts = String(interaction.customId).split(':');
      page = 0;
      sort = SORTS.includes(parts[5]) ? parts[5] : 'rarity';
      query = encodeTierQuery(interaction.values?.[0] || TIER_ALL);
      action = 'sort';
    }
    if (interaction.user.id !== viewerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_not_yours_title'), t(viewerId, 'col_not_yours'))],
        flags: 64
      });
      return;
    }
    if (action === 'noop') { await interaction.deferUpdate(); return; }
    if (action === 'search') {
      const modal = new ModalBuilder()
        .setCustomId(buildModalId(viewerId, targetId, sort))
        .setTitle('Buscar no binder');
      const input = new TextInputBuilder()
        .setCustomId('query')
        .setLabel('Nome, posicao ou raridade')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: isagi, FW, egoista')
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
        } catch { username = t(viewerId, 'col_player'); }
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
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_not_yours_title'), t(viewerId, 'col_not_yours'))],
        flags: 64
      });
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
        } catch { username = t(viewerId, 'col_player'); }
      }
      const result = await renderCollectionFor(viewerId, targetId, username, avatarURL, 0, isSelf, sort, query);
      await replyCollectionV2(interaction, result, true);
    } catch (error) {
      logger.error('Error handling collection modal', error.message);
    }
  }
};

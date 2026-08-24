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
  parseTierFromQuery, encodeTierQuery, textQuery, matchesTier, isRoleFilter
} = require('../utils/collectionFilter.js');

/**
 * /collection — rebuilt from scratch (Arena reference).
 *
 * Layout:
 *   Container
 *   ├─ Section  # Título + ajuda + -# progresso | thumb
 *   ├─ Separator
 *   ├─ TextDisplay  Filtro · Ordenação
 *   ├─ Section × N  **N. Nome** / POS · OVR · ID | thumb
 *   ├─ Separator
 *   ├─ -# Página x/y
 *   └─ ActionRows  [Filtrar] [Ordenar] · select sob demanda · «‹›»
 */

const PREFIX = 'collection';
const PER_PAGE = 5;
const SORTS = ['rarity', 'level', 'name'];
const COACH = 'COACH';
const ICONS = path.join(__dirname, '..', '..', 'data', 'icons');
const IMAGES = path.join(__dirname, '..', '..', 'data', 'images');

function accent() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function sortLabel(uid, sort) {
  if (sort === 'level') return t(uid, 'col_sort_level');
  if (sort === 'name') return t(uid, 'col_sort_name');
  return t(uid, 'col_sort_rarity');
}

function tierLabel(uid, tier) {
  if (!tier || tier === TIER_ALL) return t(uid, 'col_tier_all');
  if (tier === TIER_COACH) return t(uid, 'profile_masters');
  if (tier === ROLE_GK) return t(uid, 'col_role_gk');
  if (tier === ROLE_ATT) return t(uid, 'col_role_att');
  if (tier === ROLE_MID) return t(uid, 'col_role_mid');
  if (tier === ROLE_DEF) return t(uid, 'col_role_def');
  return rarityLabel(uid, tier);
}

function tierOptions(uid) {
  return TIER_OPTIONS.map(o => {
    let label;
    if (o.value === TIER_ALL) label = t(uid, 'col_tier_all_opt');
    else if (o.value === TIER_COACH) label = t(uid, 'profile_masters');
    else if (isRoleFilter(o.value)) label = tierLabel(uid, o.value);
    else label = rarityLabel(uid, o.value);
    return { label: label.slice(0, 100), value: o.value, emoji: o.emoji };
  });
}

/* ── custom ids ─────────────────────────────────────────── */
function idPage(v, t, page, sort, q) {
  return `${PREFIX}:${v}:${t}:page:${page}:${sort}:${encodeURIComponent(q || '')}`;
}
function idNoop(v, t, page, sort) {
  return `${PREFIX}:${v}:${t}:noop:${page}:${sort}`;
}
function idFilterBtn(v, t, page, sort, q) {
  return `${PREFIX}:${v}:${t}:filterbtn:${page}:${sort}:${encodeURIComponent(q || '')}`;
}
function idSortBtn(v, t, page, sort, q) {
  return `${PREFIX}:${v}:${t}:sortbtn:${page}:${sort}:${encodeURIComponent(q || '')}`;
}
function idTierSel(v, t, page, sort) {
  return `${PREFIX}:${v}:${t}:tiersel:${page}:${sort}`;
}
function idSortSel(v, t, page) {
  return `${PREFIX}:${v}:${t}:sortsel:${page}`;
}
function idSearch(v, t, sort) {
  return `${PREFIX}:${v}:${t}:search:${sort}`;
}
function idClear(v, t, sort) {
  return `${PREFIX}:${v}:${t}:clearq:${sort}`;
}
function idModal(v, t, sort) {
  return `${PREFIX}:${v}:${t}:modal:${sort}`;
}

function parseId(customId) {
  const p = customId.split(':');
  let query = '';
  if (p[6]) {
    try { query = decodeURIComponent(p[6]); } catch { query = p[6]; }
  }
  return {
    viewerId: p[1],
    targetId: p[2],
    action: p[3] || 'page',
    page: parseInt(p[4], 10) || 0,
    sort: SORTS.includes(p[5]) ? p[5] : (SORTS.includes(p[4]) ? p[4] : 'rarity'),
    query
  };
}

/* ── data helpers ───────────────────────────────────────── */
function ovrOf(card) {
  const s = card?.stats;
  if (!s) return 70;
  const vals = [s.speed, s.technique, s.physique, s.tactical].filter(n => typeof n === 'number');
  if (!vals.length) return 70;
  return Math.min(99, Math.max(50, Math.round(50 + (vals.reduce((a, b) => a + b, 0) / vals.length) * 4.5)));
}

function artPath(card) {
  if (card?.localImage) {
    const a = path.join(IMAGES, card.localImage);
    if (fs.existsSync(a)) return a;
    const b = path.join(IMAGES, 'cards', path.basename(card.localImage));
    if (fs.existsSync(b)) return b;
  }
  if (card?.icon) {
    const c = path.join(ICONS, card.icon);
    if (fs.existsSync(c)) return c;
  }
  if (card?.id != null) {
    const d = path.join(IMAGES, 'cards', `${card.id}.png`);
    if (fs.existsSync(d)) return d;
  }
  return null;
}

function buildEntries(valid, cards, inTeam, sort, query) {
  const rank = k => RARITY_ORDER.indexOf(k);
  const tier = parseTierFromQuery(query);
  const q = textQuery(query).toLowerCase();

  let list = valid.filter(uc => {
    const card = cards.find(c => c.id === uc.id);
    if (!card || !matchesTier(card, tier)) return false;
    if (!q) return true;
    return (
      card.name.toLowerCase().includes(q) ||
      String(card.position || '').toLowerCase().includes(q) ||
      String(card.rarity || '').toLowerCase().includes(q) ||
      (card.position === 'CO' && (q.includes('coach') || q.includes('master') || q.includes('tecnico')))
    );
  });

  list.sort((a, b) => {
    const A = cards.find(c => c.id === a.id);
    const B = cards.find(c => c.id === b.id);
    if (!A || !B) return 0;
    const aC = A.position === 'CO';
    const bC = B.position === 'CO';
    if (sort === 'name') return A.name.localeCompare(B.name);
    if (sort === 'level') {
      if (aC && !bC) return 1;
      if (!aC && bC) return -1;
      if (aC && bC) return A.name.localeCompare(B.name);
      const d = (b.level || 0) - (a.level || 0);
      return d || A.name.localeCompare(B.name);
    }
    if (aC && !bC) return 1;
    if (!aC && bC) return -1;
    if (aC && bC) return A.name.localeCompare(B.name);
    const rd = rank(B.rarity) - rank(A.rarity);
    return rd || A.name.localeCompare(B.name);
  });

  const out = [];
  const grouped = sort === 'rarity' && !q && tier === TIER_ALL;
  if (grouped) {
    for (const key of RARITY_ORDER.slice().reverse()) {
      for (const uc of list) {
        const card = cards.find(c => c.id === uc.id);
        if (card && card.position !== 'CO' && card.rarity === key) {
          out.push({ card, level: uc.level || 0, onTeam: inTeam.has(uc.id), rarityKey: key });
        }
      }
    }
    for (const uc of list) {
      const card = cards.find(c => c.id === uc.id);
      if (card && card.position === 'CO') {
        out.push({ card, level: 0, onTeam: inTeam.has(uc.id), rarityKey: COACH });
      }
    }
  } else {
    for (const uc of list) {
      const card = cards.find(c => c.id === uc.id);
      if (!card) continue;
      out.push({
        card,
        level: uc.level || 0,
        onTeam: inTeam.has(uc.id),
        rarityKey: card.position === 'CO' ? COACH : card.rarity
      });
    }
  }
  return out;
}

/* ── UI rows ────────────────────────────────────────────── */
function buildControls(viewerId, targetId, page, totalPages, sort, query, panel) {
  const rows = [];
  const tier = parseTierFromQuery(query);
  const hasQuery = Boolean(textQuery(query) || (tier && tier !== TIER_ALL));

  // Arena-style: two primary buttons
  const top = [
    new ButtonBuilder()
      .setCustomId(idFilterBtn(viewerId, targetId, page, sort, query))
      .setLabel('Filtrar')
      .setEmoji('🔍')
      .setStyle(panel === 'filter' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(idSortBtn(viewerId, targetId, page, sort, query))
      .setLabel('Ordenar')
      .setEmoji('🔢')
      .setStyle(panel === 'sort' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(idSearch(viewerId, targetId, sort))
      .setLabel(textQuery(query) ? textQuery(query).slice(0, 18) : 'Buscar')
      .setStyle(textQuery(query) ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ];
  if (hasQuery) {
    top.push(
      new ButtonBuilder()
        .setCustomId(idClear(viewerId, targetId, sort))
        .setLabel('Limpar')
        .setStyle(ButtonStyle.Danger)
    );
  }
  rows.push(new ActionRowBuilder().addComponents(...top.slice(0, 5)));

  // Expand select only when user asked
  if (panel === 'filter') {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(idTierSel(viewerId, targetId, page, sort))
        .setPlaceholder(`Filtro atual: ${tierLabel(viewerId, tier)}`.slice(0, 100))
        .addOptions(tierOptions(viewerId).map(o => ({
          ...o,
          default: tier === o.value
        })))
    ));
  }
  if (panel === 'sort') {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(idSortSel(viewerId, targetId, page))
        .setPlaceholder(`Ordem: ${sortLabel(viewerId, sort)}`.slice(0, 100))
        .addOptions(
          { label: t(viewerId, 'col_sort_rarity'), value: 'rarity', default: sort === 'rarity' },
          { label: t(viewerId, 'col_sort_level'), value: 'level', default: sort === 'level' },
          { label: t(viewerId, 'col_sort_name'), value: 'name', default: sort === 'name' }
        )
    ));
  }

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(idPage(viewerId, targetId, 0, sort, query)).setLabel('«').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
      new ButtonBuilder().setCustomId(idPage(viewerId, targetId, page - 1, sort, query)).setLabel('‹').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
      new ButtonBuilder().setCustomId(idNoop(viewerId, targetId, page, sort)).setLabel(`${page + 1}/${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(idPage(viewerId, targetId, page + 1, sort, query)).setLabel('›').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
      new ButtonBuilder().setCustomId(idPage(viewerId, targetId, totalPages - 1, sort, query)).setLabel('»').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    ));
  }
  return rows;
}

/** List row — Arena text pattern */
function catalogRow(entry, index) {
  const { card, level, onTeam } = entry;
  const coach = card.position === 'CO';
  const ovr = ovrOf(card);
  const pos = coach ? 'Master' : String(card.position || '?');
  const rarity = coach ? null : (RARITIES[card.rarity] || RARITIES.LOCKED);
  const em = coach ? '🎩' : (rarity?.emoji || '🃏');
  const pin = onTeam ? ' · 📌' : '';

  // Markdown hierarchy inside Section
  const title = `**${index}. ${card.name}**`;
  const detail = coach
    ? `${em} ${pos} · OVR \`${ovr}\` · ID:\`${card.id}\``
    : `${em} ${pos} · OVR \`${ovr}\` · Lv.\`${level}\`${pin} · ID:\`${card.id}\``;

  const body = `${title}\n${detail}`;
  const filePath = artPath(card);
  if (filePath) {
    const name = `card_${card.id}.png`;
    return {
      section: new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(body, 900)))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(`attachment://${name}`).setDescription(card.name)),
      file: new AttachmentBuilder(filePath, { name })
    };
  }
  return {
    text: new TextDisplayBuilder().setContent(safeTruncate(`${body}\n-# sem arte`, 900))
  };
}

async function buildPanel(opts) {
  const {
    username, entries, page, cards, valid, teamCount,
    isSelf, sort, query, viewerId, targetId, avatarURL, panel
  } = opts;

  const totalPages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * PER_PAGE;
  const slice = entries.slice(start, start + PER_PAGE);
  const owned = valid.length;
  const pool = cards.length;
  const complete = owned === pool && pool > 0;
  const left = Math.max(0, pool - owned);
  const tier = parseTierFromQuery(query);
  const files = [];

  // Header thumb = first card art or avatar
  let headUrl = avatarURL || null;
  if (slice[0]) {
    const p = artPath(slice[0].card);
    if (p) {
      const fn = `head_${slice[0].card.id}.png`;
      files.push(new AttachmentBuilder(p, { name: fn }));
      headUrl = `attachment://${fn}`;
    }
  }

  const h1 = complete ? `Binder de ${username}` : `Binder de ${username}`;
  const help = isSelf
    ? 'Navegue pelas cartas do binder. Use **Filtrar** e **Ordenar** abaixo.'
    : `Binder de **${username}** · somente leitura`;
  const prog = complete
    ? `Completo · ${owned}/${pool} · em campo ${teamCount}/11`
    : `${progressBar(owned, pool, 8)} ${owned}/${pool} · faltam ${left} · em campo ${teamCount}/11`;

  const header = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ${h1}`),
    new TextDisplayBuilder().setContent(help),
    new TextDisplayBuilder().setContent(`-# ${prog}`)
  );
  if (headUrl) {
    header.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(headUrl).setDescription(username)
    );
  }

  let status = `Filtro: **${tierLabel(viewerId, tier)}** · Ordenação: **${sortLabel(viewerId, sort)}**`;
  if (textQuery(query)) status += ` · Busca: **${textQuery(query)}**`;

  const container = new ContainerBuilder()
    .setAccentColor(complete ? 0x57f287 : accent())
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(status))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (!slice.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('_Nenhuma carta neste filtro._\n-# Toque em **Limpar** ou mude o filtro.')
    );
  } else {
    for (let i = 0; i < slice.length; i++) {
      const row = catalogRow(slice[i], start + i + 1);
      if (row.section) {
        container.addSectionComponents(row.section);
        if (row.file) files.push(row.file);
      } else {
        container.addTextDisplayComponents(row.text);
      }
    }
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Página ${safePage + 1}/${totalPages} — ${entries.length} carta(s) no filtro · ${owned} no binder`
      )
    );

  for (const row of buildControls(viewerId, targetId, safePage, totalPages, sort, query, panel || null)) {
    container.addActionRowComponents(row);
  }

  return { container, safePage, totalPages, files };
}

async function renderCollectionFor(viewerId, targetId, username, avatarURL, page, isSelf, sort, query, panel) {
  sort = sort || 'rarity';
  query = query || '';
  const cards = DataService.loadCards();
  const valid = DataService.getValidUserCards(targetId, cards);
  const team = DataService.getTeam(targetId);
  const inTeam = new Set(team.map(r => r.cardId));
  const entries = buildEntries(valid, cards, inTeam, sort, query);
  const built = await buildPanel({
    username, entries, page, cards, valid,
    teamCount: team.length, isSelf, sort, query,
    viewerId, targetId, avatarURL, panel
  });
  return {
    container: built.container,
    totalCards: valid.length,
    poolSize: cards.length,
    isEmpty: valid.length === 0,
    safePage: built.safePage,
    totalPages: built.totalPages,
    files: built.files
  };
}

async function replyV2(interaction, result, isEdit) {
  const payload = {
    components: [result.container],
    flags: MessageFlags.IsComponentsV2,
    files: result.files?.length ? result.files : []
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

function emptyPayload(ownerId, isSelf, username) {
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
    const p = emptyPayload(userId, true, username);
    try { await interaction.editReply(p); } catch { await interaction.followUp({ ...p, flags: 64 }); }
    return;
  }
  await replyV2(interaction, result, true);
}

async function openCollectionPanelForTarget(interaction, viewerId, targetUser) {
  const targetId = targetUser.id;
  const isSelf = viewerId === targetId;
  DataService.ensureUser(targetId, targetUser.username);
  const result = await renderCollectionFor(
    viewerId, targetId, targetUser.username, targetUser.displayAvatarURL(), 0, isSelf, 'rarity', ''
  );
  if (result.isEmpty) {
    const p = emptyPayload(viewerId, isSelf, targetUser.username);
    try { await interaction.editReply(p); } catch { await interaction.followUp({ ...p, flags: 64 }); }
    return;
  }
  await replyV2(interaction, result, true);
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
    if (focused.name !== 'filter') {
      await interaction.respond([]);
      return;
    }
    const q = String(focused.value || '').trim().toLowerCase();
    let names = DataService.loadCards().map(c => c.name);
    if (q) names = names.filter(n => n.toLowerCase().includes(q));
    names.sort((a, b) => a.localeCompare(b));
    await interaction.respond(
      [...new Set(names)].slice(0, 25).map(n => ({ name: n.slice(0, 100), value: n.slice(0, 100) }))
    );
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
        const empty = emptyPayload(viewerId, isSelf, target.username);
        await interaction.reply({ embeds: empty.embeds, components: empty.components, flags: isSelf ? 0 : 64 });
        return;
      }
      await replyV2(interaction, result, false);
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /collection', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)], flags: 64 });
        }
      } catch { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const parsed = parseId(interaction.customId);
    let { viewerId, targetId, action, page, sort, query } = parsed;

    if (action === 'nav') {
      await openDestination(interaction, interaction.values?.[0], viewerId);
      return;
    }

    if (interaction.user.id !== viewerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', t(viewerId, 'col_not_yours_title'), t(viewerId, 'col_not_yours'))],
        flags: 64
      });
      return;
    }

    if (action === 'noop') {
      await interaction.deferUpdate();
      return;
    }

    if (action === 'search') {
      const modal = new ModalBuilder()
        .setCustomId(idModal(viewerId, targetId, sort))
        .setTitle('Buscar no binder');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel('Nome, posicao ou raridade')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ex: isagi, FW, egoista')
            .setRequired(true)
            .setMaxLength(40)
        )
      );
      await interaction.showModal(modal);
      return;
    }

    // Select values
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

    await interaction.deferUpdate();

    try {
      if (action === 'clearq') {
        query = '';
        page = 0;
      }
      if (!targetId || targetId === '_') targetId = viewerId;

      const isSelf = viewerId === targetId;
      let username = interaction.user.username;
      let avatarURL = interaction.user.displayAvatarURL();
      if (!isSelf) {
        try {
          const u = await interaction.client.users.fetch(targetId);
          username = u.username;
          avatarURL = u.displayAvatarURL();
        } catch {
          username = t(viewerId, 'col_player');
        }
      }

      let panel = null;
      if (action === 'filterbtn') panel = 'filter';
      if (action === 'sortbtn') panel = 'sort';

      const nextPage = (action === 'sort' || action === 'clearq') ? 0 : page;
      const result = await renderCollectionFor(
        viewerId, targetId, username, avatarURL, nextPage, isSelf, sort, query, panel
      );
      await replyV2(interaction, result, true);
    } catch (error) {
      logger.error('Error handling collection component', error.message);
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
    if (!targetId || targetId === '_') targetId = viewerId;

    const query = (interaction.fields.getTextInputValue('query') || '').trim();
    await interaction.deferUpdate();

    try {
      const isSelf = viewerId === targetId;
      let username = interaction.user.username;
      let avatarURL = interaction.user.displayAvatarURL();
      if (!isSelf) {
        try {
          const u = await interaction.client.users.fetch(targetId);
          username = u.username;
          avatarURL = u.displayAvatarURL();
        } catch {
          username = t(viewerId, 'col_player');
        }
      }
      const result = await renderCollectionFor(
        viewerId, targetId, username, avatarURL, 0, isSelf, sort, query
      );
      await replyV2(interaction, result, true);
    } catch (error) {
      logger.error('Error handling collection modal', error.message);
    }
  }
};

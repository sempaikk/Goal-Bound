const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { renderTeam, resolveSlots } = require('../services/FieldRenderer.js');
const { isRenderBusy } = require('../services/teamRenderCache.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { RARITIES } = require('../services/rarities.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const {
  getCoachId,
  setCoachId,
  getFormationForCoach,
  COACH_IDS
} = require('../services/coachStore.js');
const { formatPassiveShort, passiveLineForCoach } = require('../services/coachPassives.js');
const {
  masterReminder,
  snapshotTeam,
  hasSnapshot,
  restoreSnapshot,
  ownsAnyMaster,
  purgeInvalidSeats
} = require('../services/teamQoL.js');
const { whoNeedsXpLines } = require('../utils/qolText.js');
const { buildCtaRow } = require('../utils/nav.js');
const { t } = require('../utils/i18n.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');
const { getEligibleOwnedCards, trySeatCard } = require('./teamSeating.js');
const { computeSquadScore, formatScore } = require('../services/squadScore.js');

const CUSTOM_ID_PREFIX = 'team';
const CARDS_PER_PAGE = 25;

const COACH_META = {
  14: { name: 'Jinpachi Ego', short: 'Ego', formation: '4-2-3-1' },
  15: { name: 'Noel Noa', short: 'Noa', formation: '4-4-2' },
  16: { name: 'Lavinho', short: 'Lavinho', formation: '4-3-3' },
  17: { name: 'Marc Snuffy', short: 'Snuffy', formation: '3-5-2' }
};

function buildCustomId(ownerId, action, extra = '', extra2 = '') {
  const parts = [CUSTOM_ID_PREFIX, ownerId, action];
  if (extra !== '' && extra != null) parts.push(String(extra));
  if (extra2 !== '' && extra2 != null) parts.push(String(extra2));
  return parts.join(':');
}

function parseCustomId(customId) {
  const parts = String(customId || '').split(':');
  return {
    prefix: parts[0],
    ownerId: parts[1],
    action: parts[2],
    extra: parts[3],
    extra2: parts[4]
  };
}

function formationSlotsForUser(userId) {
  const coachId = getCoachId(userId);
  const formation = getFormationForCoach(coachId);
  return { coachId, formation, slots: resolveSlots(formation.id) };
}

function accentFor(notice, isComplete) {
  if (notice) {
    const hex = String(config.COLORS?.WARNING || '#FFB020').replace('#', '');
    const n = parseInt(hex, 16);
    return Number.isFinite(n) ? n : 0xffb020;
  }
  if (isComplete) {
    const hex = String(config.COLORS?.SUCCESS || '#3DDC97').replace('#', '');
    const n = parseInt(hex, 16);
    return Number.isFinite(n) ? n : 0x3ddc97;
  }
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

async function maybeShowRenderWait(interaction) {
  if (!isRenderBusy()) return;
  try {
    if (!interaction.deferred && !interaction.replied) return;
    const uid = interaction.user.id;
    const wait = new ContainerBuilder()
      .setAccentColor(accentFor(null, false))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# 🏟️ ${t(uid, 'team_drawing')}`),
        new TextDisplayBuilder().setContent(t(uid, 'team_drawing_body'))
      );
    await interaction.editReply({
      components: [wait],
      files: [],
      flags: MessageFlags.IsComponentsV2
    });
  } catch {
    /* ignore */
  }
}

function buildBodyText(userId, username, teamRows, coachId, formation, notice) {
  const filled = teamRows.length;
  const isComplete = filled === 11;
  const avgLevel = filled > 0
    ? Math.round(teamRows.reduce((sum, row) => sum + (row.level || 0), 0) / filled)
    : null;

  let spLine = '';
  if (filled > 0) {
    try {
      const sp = computeSquadScore(userId);
      spLine = `⚡ **${formatScore(sp.score)}** SP`;
    } catch {
      spLine = '';
    }
  }

  const passive = coachId != null ? passiveLineForCoach(coachId) : null;
  let coachLabel;
  if (coachId && COACH_META[coachId]) {
    coachLabel = `🧭 **${COACH_META[coachId].short}** · ${formation.label}`;
    if (passive) coachLabel += `\n_${passive}_`;
  } else {
    coachLabel = `📋 **${t(userId, 'team_no_master')}** · ${formation.label}`;
  }

  let body;
  if (filled === 0) {
    body =
      `${coachLabel}\n\n` +
      `**${t(userId, 'empty_team')}**\n` +
      `${t(userId, 'empty_team_cta')}\n\n` +
      `_${t(userId, 'team_xp_note')}_`;
  } else if (isComplete) {
    body =
      `${coachLabel}\n\n` +
      `🏁 **${t(userId, 'team_complete')}** · ${t(userId, 'profile_avg')} **Lv.${avgLevel}**` +
      (spLine ? ` · ${spLine}` : '') +
      `\n_${t(userId, 'team_all_xp')}_`;
  } else {
    body =
      `${coachLabel}\n\n` +
      t(userId, 'team_filled', { n: filled }) +
      (avgLevel !== null ? ` · ${t(userId, 'profile_avg')} **Lv.${avgLevel}**` : '') +
      (spLine ? ` · ${spLine}` : '') +
      `\n_${t(userId, 'team_pick_role')}_`;
  }

  const tip = masterReminder(userId);
  if (tip) body = `${tip}\n\n${body}`;
  if (hasSnapshot(userId)) {
    body += `\n\n_💾 ${t(userId, 'restore_hint')}_`;
  }
  if (notice) body = `${notice}\n\n${body}`;

  const xpLines = whoNeedsXpLines(userId, teamRows, 3);
  if (xpLines) {
    body += `\n\n### 📈 ${t(userId, 'team_who_xp')}\n${xpLines}`;
  }

  body += `\n\n_${t(userId, 'team_footer')}_`;

  return {
    title: `# 📋 ${t(userId, 'team_title', { user: username })}`,
    body,
    filled,
    isComplete
  };
}

async function buildFormationDisplay(userId, username, notice = null, extraTip = null) {
  const cards = DataService.loadCards();
  const teamRows = DataService.getTeam(userId);
  const teamBySlot = new Map(teamRows.map(row => [row.slot, row]));
  const { coachId, formation } = formationSlotsForUser(userId);

  const imageBuffer = await renderTeam(teamRows, cards, formation.id);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'team.png' });

  let { title, body, filled, isComplete } = buildBodyText(
    userId, username, teamRows, coachId, formation, notice
  );
  if (extraTip) body += `\n\n${extraTip}`;

  const container = new ContainerBuilder()
    .setAccentColor(accentFor(notice, isComplete))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title),
      new TextDisplayBuilder().setContent(body)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://team.png')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  return { container, attachment, teamBySlot, filled, coachId, formation, isComplete };
}

function attachRows(container, rows) {
  for (const row of rows.slice(0, 5)) {
    container.addActionRowComponents(row);
  }
  return container;
}

function buildStateAComponents(ownerId, teamBySlot, slots) {
  const selectOptions = slots.map(slot => {
    const entry = teamBySlot.get(slot.key);
    return {
      label: `${slot.key} (${slot.label})`,
      description: entry
        ? `In: ${entry.cardName} · Lv.${entry.level}`.slice(0, 100)
        : t(ownerId, 'team_empty_slot').slice(0, 100),
      value: slot.key,
      emoji: entry ? '✅' : '⬜'
    };
  });

  const positionSelect = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(ownerId, 'selpos'))
    .setPlaceholder(`📍 ${t(ownerId, 'team_sel_role')}`)
    .addOptions(selectOptions);

  const needsMaster = ownsAnyMaster(ownerId) && getCoachId(ownerId) == null;
  const coachButton = new ButtonBuilder()
    .setCustomId(buildCustomId(ownerId, 'coach'))
    .setLabel(needsMaster ? `🧭 ${t(ownerId, 'team_master_set')}` : `🧭 ${t(ownerId, 'team_master')}`)
    .setStyle(needsMaster ? ButtonStyle.Success : ButtonStyle.Secondary);

  const clearAllButton = new ButtonBuilder()
    .setCustomId(buildCustomId(ownerId, 'clearall'))
    .setLabel(`🗑️ ${t(ownerId, 'team_clear_all')}`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(teamBySlot.size === 0);

  const row2 = [coachButton, clearAllButton];
  if (hasSnapshot(ownerId)) {
    row2.push(
      new ButtonBuilder()
        .setCustomId(buildCustomId(ownerId, 'restore'))
        .setLabel(`💾 ${t(ownerId, 'team_restore')}`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  const rows = [
    new ActionRowBuilder().addComponents(positionSelect),
    new ActionRowBuilder().addComponents(...row2)
  ];

  if (teamBySlot.size === 0) {
    rows.push(buildCtaRow(ownerId, 'empty_team'));
  }

  return rows.slice(0, 5);
}

function buildCoachSelectComponents(ownerId, ownedCoachIds, currentCoachId) {
  const options = [
    {
      label: t(ownerId, 'team_no_master_opt'),
      description: '4-3-3 · no passive',
      value: 'none',
      emoji: '📋',
      default: currentCoachId == null
    }
  ];

  for (const id of COACH_IDS) {
    if (!ownedCoachIds.has(id)) continue;
    const meta = COACH_META[id];
    const bonus = passiveLineForCoach(id) || '';
    options.push({
      label: `${meta.short} · ${meta.formation}`,
      description: (bonus ? `${bonus}` : meta.name).slice(0, 100),
      value: String(id),
      emoji: '🧭',
      default: currentCoachId === id
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(ownerId, 'setcoach'))
    .setPlaceholder(
      ownedCoachIds.size === 0
        ? t(ownerId, 'team_no_masters')
        : `🧭 ${t(ownerId, 'team_pick_master')}`
    )
    .addOptions(options);

  const back = new ButtonBuilder()
    .setCustomId(buildCustomId(ownerId, 'back'))
    .setLabel(`↩ ${t(ownerId, 'team_back')}`)
    .setStyle(ButtonStyle.Primary);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(back)
  ];
}

function sortOwnedForSlot(ownedCards, currentEntry, cardSlotByCardId) {
  return [...ownedCards].sort((a, b) => {
    const aHere = currentEntry?.cardId === a.id ? 0 : 1;
    const bHere = currentEntry?.cardId === b.id ? 0 : 1;
    if (aHere !== bHere) return aHere - bHere;
    const aOn = cardSlotByCardId.has(a.id) ? 0 : 1;
    const bOn = cardSlotByCardId.has(b.id) ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    return (b.level || 0) - (a.level || 0);
  });
}

function buildStateBComponents(ownerId, slotKey, teamBySlot, ownedCards, slots, cardPage = 0) {
  const slotInfo = slots.find(s => s.key === slotKey);
  const currentEntry = teamBySlot.get(slotKey);
  const cardSlotByCardId = new Map();
  for (const [otherSlot, entry] of teamBySlot) {
    cardSlotByCardId.set(entry.cardId, otherSlot);
  }

  const components = [];

  if (ownedCards.length === 0) {
    const emptySelect = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(ownerId, 'noop'))
      .setPlaceholder(t(ownerId, 'team_no_slot_players', { slot: slotKey }).slice(0, 100))
      .setDisabled(true)
      .addOptions([{ label: '—', value: 'none' }]);
    components.push(new ActionRowBuilder().addComponents(emptySelect));
    components.push(buildCtaRow(ownerId, 'empty_binder'));
  } else {
    const sortedOwned = sortOwnedForSlot(ownedCards, currentEntry, cardSlotByCardId);
    const totalPages = Math.max(1, Math.ceil(sortedOwned.length / CARDS_PER_PAGE));
    const safePage = Math.min(Math.max(0, cardPage), totalPages - 1);
    const start = safePage * CARDS_PER_PAGE;
    const pageCards = sortedOwned.slice(start, start + CARDS_PER_PAGE);

    const cardOptions = pageCards.map(card => {
      const isHere = currentEntry?.cardId === card.id;
      const elsewhere = cardSlotByCardId.get(card.id);
      const onTeam = isHere || Boolean(elsewhere);
      const rarityEmoji = RARITIES[card.rarity]?.emoji || '';
      let context;
      if (isHere) context = `✓ ${slotKey}`;
      else if (elsewhere) context = `📌 ${elsewhere}`;
      else context = `${rarityEmoji} ${card.position || ''}`.trim();
      const customEmoji = getEmojiForCard(card.id);
      const emoji = customEmoji || (onTeam ? '📌' : undefined);
      const labelPrefix = isHere ? '✓ ' : elsewhere ? '📌 ' : '';
      return {
        label: `${labelPrefix}${card.name}`.slice(0, 100),
        description: `Lv.${card.level} · ${context}`.slice(0, 100),
        value: String(card.id),
        emoji,
        default: isHere
      };
    });

    const pageHint = totalPages > 1 ? ` · ${safePage + 1}/${totalPages}` : '';
    const cardSelect = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(ownerId, 'selcard', slotKey, String(safePage)))
      .setPlaceholder(`${slotKey} (${slotInfo?.label || slotKey})${pageHint}`)
      .addOptions(cardOptions);
    components.push(new ActionRowBuilder().addComponents(cardSelect));

    if (totalPages > 1) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId(ownerId, 'cardpage', slotKey, String(safePage - 1)))
          .setLabel(t(ownerId, 'col_prev'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(buildCustomId(ownerId, 'noop'))
          .setLabel(t(ownerId, 'team_card_page', {
            page: safePage + 1,
            total: totalPages,
            n: sortedOwned.length
          }))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(buildCustomId(ownerId, 'cardpage', slotKey, String(safePage + 1)))
          .setLabel(t(ownerId, 'col_next'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1)
      ));
    }
  }

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(ownerId, 'clearslot', slotKey))
      .setLabel(`🧽 ${slotKey}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!currentEntry),
    new ButtonBuilder()
      .setCustomId(buildCustomId(ownerId, 'back'))
      .setLabel(`↩ ${t(ownerId, 'team_back')}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildCustomId(ownerId, 'clearall'))
      .setLabel(`🗑️ ${t(ownerId, 'team_clear_all')}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(teamBySlot.size === 0)
  ));

  return components.slice(0, 5);
}

async function sendTeamPanel(interaction, container, attachment, rows, mode = 'edit') {
  const full = attachRows(container, rows);
  const payload = {
    components: [full],
    files: [attachment],
    flags: MessageFlags.IsComponentsV2
  };
  if (mode === 'followUp') {
    await interaction.followUp({ ...payload, flags: MessageFlags.IsComponentsV2 | 64 });
    return;
  }
  await interaction.editReply(payload);
}

async function openTeamPanel(interaction, userId, username) {
  DataService.ensureUser(userId, username);
  purgeInvalidSeats(userId);
  await maybeShowRenderWait(interaction);
  const { container, attachment, teamBySlot, formation } = await buildFormationDisplay(userId, username);
  const slots = resolveSlots(formation.id);
  const rows = buildStateAComponents(userId, teamBySlot, slots);
  try {
    await sendTeamPanel(interaction, container, attachment, rows, 'edit');
  } catch {
    try {
      await sendTeamPanel(interaction, container, attachment, rows, 'followUp');
    } catch (err) {
      logger.error('openTeamPanel failed', err.message);
    }
  }
}

async function renderState(interaction, userId, state, slotKey, notice = null, cardPage = 0) {
  await maybeShowRenderWait(interaction);
  const { container, attachment, teamBySlot, formation } = await buildFormationDisplay(
    userId,
    interaction.user.username,
    notice
  );
  const slots = resolveSlots(formation.id);
  let rows;
  if (state === 'B') {
    const ownedCards = getEligibleOwnedCards(userId, slotKey);
    rows = buildStateBComponents(userId, slotKey, teamBySlot, ownedCards, slots, cardPage);
  } else {
    rows = buildStateAComponents(userId, teamBySlot, slots);
  }
  try {
    await sendTeamPanel(interaction, container, attachment, rows, 'edit');
  } catch (err) {
    logger.error('renderState edit failed', err.message);
  }
}

const teamData = withPtBr(
  new SlashCommandBuilder()
    .setName('team')
    .setDescription('📋 Shape your eleven — pick a master for formation + farm bonus')
    .addStringOption(opt =>
      optionPtBr(
        opt.setName('card').setDescription('Quick-seat: card name (autocomplete)').setAutocomplete(true).setRequired(false),
        'Nome da carta (autocomplete)'
      )
    )
    .addStringOption(opt =>
      optionPtBr(
        opt.setName('slot').setDescription('Quick-seat: role key (e.g. ST, CM, GK)').setRequired(false),
        'Posição (ex: ST, CM, GK)'
      )
    ),
  '📋 Monte o onze — master muda formação e bônus de farm'
);

module.exports = {
  buildFormationDisplay,
  buildStateAComponents,
  openTeamPanel,

  data: teamData,

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'card') {
      await interaction.respond([]);
      return;
    }
    const q = String(focused.value || '').trim().toLowerCase();
    const userId = interaction.user.id;
    DataService.ensureUser(userId, interaction.user.username);
    const cardsById = new Map(DataService.loadCards().map(c => [c.id, c]));
    let owned = DataService.getUserCards(userId)
      .map(uc => cardsById.get(uc.id))
      .filter(c => c && c.position !== 'CO');
    if (q) owned = owned.filter(c => c.name.toLowerCase().includes(q));
    owned.sort((a, b) => a.name.localeCompare(b.name));
    await interaction.respond(
      owned.slice(0, 25).map(c => ({
        name: `${c.name} (${c.position || '?'})`.slice(0, 100),
        value: String(c.id)
      }))
    );
  },

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);
      purgeInvalidSeats(userId);
      const cardRaw = interaction.options.getString('card');
      const slotRaw = interaction.options.getString('slot');
      let notice = null;

      if (cardRaw && slotRaw) {
        const cardId = parseInt(cardRaw, 10);
        const slotKey = String(slotRaw).trim().toUpperCase();
        const result = trySeatCard(userId, slotKey, cardId);
        notice = result.notice;
      } else if (cardRaw || slotRaw) {
        notice = t(userId, 'team_need_both');
      }

      await maybeShowRenderWait(interaction);

      const { container, attachment, teamBySlot, formation } = await buildFormationDisplay(
        userId, interaction.user.username, notice
      );
      const slots = resolveSlots(formation.id);
      await sendTeamPanel(
        interaction,
        container,
        attachment,
        buildStateAComponents(userId, teamBySlot, slots),
        'edit'
      );
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /team', error.message);
      try {
        await interaction.editReply({
          embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
          components: [],
          files: []
        });
      } catch (_) { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const { ownerId, action, extra, extra2 } = parseCustomId(interaction.customId);

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', '🚫', t(ownerId, 'team_open_self'))],
        flags: 64
      });
      return;
    }

    if (action === 'fromdm') {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 64 });
        }
        await openTeamPanel(interaction, ownerId, interaction.user.username);
      } catch (error) {
        logger.error('Error opening team from DM button', error.message);
        try {
          const errEmbed = buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING);
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ embeds: [errEmbed], flags: 64 });
          } else {
            await interaction.reply({ embeds: [errEmbed], flags: 64 });
          }
        } catch (_) { /* ignore */ }
      }
      return;
    }

    if (action === 'seatctx') {
      const cardId = parseInt(extra, 10);
      const slotKey = interaction.values?.[0];
      await interaction.deferUpdate();
      try {
        const result = trySeatCard(ownerId, slotKey, cardId);
        if (!result.ok) {
          await interaction.editReply({
            embeds: [buildStatusEmbed('WARNING', '⚠️', result.notice)],
            components: []
          });
          return;
        }
        await interaction.editReply({
          embeds: [buildStatusEmbed('SUCCESS', '✅', result.notice)],
          components: []
        });
      } catch (error) {
        logger.error('Error seatctx', error.message);
      }
      return;
    }

    if (action === 'clearall') {
      const filled = DataService.getTeam(ownerId).length;
      if (filled === 0) {
        await interaction.deferUpdate();
        await renderState(interaction, ownerId, 'A');
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(buildCustomId(ownerId, 'clearconfirm'))
        .setTitle(t(ownerId, 'team_clear_title').slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId('confirm')
        .setLabel(t(ownerId, 'team_clear_label').slice(0, 45))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(t(ownerId, 'team_clear_ph').slice(0, 100))
        .setRequired(true)
        .setMaxLength(16);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    await interaction.deferUpdate();

    try {
      const userId = interaction.user.id;
      if (action === 'noop') return;

      if (action === 'restore') {
        const result = restoreSnapshot(userId);
        await renderState(
          interaction,
          userId,
          'A',
          null,
          result.ok ? `✅ ${result.restored}` : '⚠️'
        );
        return;
      }

      if (action === 'coach') {
        const owned = new Set(
          DataService.getUserCards(userId).filter(c => COACH_IDS.includes(c.id)).map(c => c.id)
        );
        const current = getCoachId(userId);
        const tip = owned.size === 0
          ? `_${t(userId, 'team_no_masters')}_`
          : `_${t(userId, 'team_pick_master')}_`;
        await maybeShowRenderWait(interaction);
        const { container, attachment } = await buildFormationDisplay(
          userId,
          interaction.user.username,
          null,
          tip
        );
        await sendTeamPanel(
          interaction,
          container,
          attachment,
          buildCoachSelectComponents(userId, owned, current),
          'edit'
        );
        return;
      }

      if (action === 'setcoach') {
        const raw = interaction.values[0];
        const coachCardId = raw === 'none' ? null : parseInt(raw, 10);
        const result = setCoachId(userId, coachCardId, DataService);
        let notice = null;
        if (!result.ok) notice = '⚠️';
        else if (coachCardId != null) {
          const bonus = passiveLineForCoach(coachCardId);
          notice = `✅ **${result.formation.label}**` + (bonus ? ` · ${bonus}` : '');
        } else notice = `✅ ${t(userId, 'team_default_shape')}`;
        await renderState(interaction, userId, 'A', null, notice);
        return;
      }

      if (action === 'selpos') {
        await renderState(interaction, userId, 'B', interaction.values[0], null, 0);
        return;
      }

      if (action === 'cardpage') {
        const slotKey = extra;
        const page = parseInt(extra2, 10) || 0;
        await renderState(interaction, userId, 'B', slotKey, null, page);
        return;
      }

      if (action === 'back' || action === 'clearno') {
        await renderState(interaction, userId, 'A');
        return;
      }
      if (action === 'clearslot') {
        DataService.clearTeamSlot(userId, extra);
        await renderState(interaction, userId, 'B', extra, null, 0);
        return;
      }
      if (action === 'selcard') {
        const slotKey = extra;
        const cardId = parseInt(interaction.values[0], 10);
        const result = trySeatCard(userId, slotKey, cardId);
        if (!result.ok) {
          await renderState(interaction, userId, 'B', slotKey, result.notice, parseInt(extra2, 10) || 0);
          return;
        }
        await renderState(interaction, userId, 'A');
        return;
      }
    } catch (error) {
      logger.error('Error handling /team component', error.message);
    }
  },

  async handleModal(interaction) {
    const { ownerId, action } = parseCustomId(interaction.customId);
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', '🚫', t(ownerId, 'team_open_self'))],
        flags: 64
      });
      return;
    }
    if (action !== 'clearconfirm') return;
    const typed = String(interaction.fields.getTextInputValue('confirm') || '').trim();
    await interaction.deferUpdate();
    try {
      if (typed.toUpperCase() !== 'CLEAR') {
        await renderState(interaction, ownerId, 'A', null, t(ownerId, 'team_clear_need'));
        return;
      }
      snapshotTeam(ownerId);
      const clearedCount = DataService.clearAllTeamSlots(ownerId);
      await renderState(
        interaction,
        ownerId,
        'A',
        null,
        `✅ ${t(ownerId, 'team_cleared', { n: clearedCount })}`
      );
    } catch (error) {
      logger.error('Error handling team clear modal', error.message);
    }
  }
};

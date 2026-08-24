const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { RARITIES, RARITY_ORDER } = require('../services/rarities.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { progressBar, emojiTag, safeTruncate } = require('../utils/format.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { maybeSendDmHint } = require('../services/dmNotifier.js');
const { getSquadLines } = require('../utils/squadLines.js');
const { getCoachId } = require('../services/coachStore.js');
const { getFormationForCoach } = require('../services/formations.js');
const { formatPassiveShort } = require('../services/coachPassives.js');
const { getStaffTitles } = require('../services/staff.js');
const { getPlayerRank } = require('../services/playerRank.js');
const { openDestination } = require('../utils/nav.js');
const { whoNeedsXpLines, recentPullsLines } = require('../utils/qolText.js');
const { withPtBr, optionPtBr } = require('../utils/slashLocale.js');

/**
 * /profile — reescrito do zero.
 * Identidade Goal Bound (não copia Arena).
 * UI 100% português do Brasil.
 *
 * Hierarquia:
 *   Header (nome + rank + avatar)
 *   Status (iene / onze / binder / formação)
 *   Blocos Coleção e Time com atalho
 *   Galeria de cartas em destaque
 *   Progressão por raridade
 *   XP e últimos pulls
 *   Ações
 */

const PREFIX = 'profile';
const ICONS_DIR = path.join(__dirname, '..', '..', 'data', 'icons');

const RANK_PT = {
  ROOKIE: 'Novato',
  PROSPECT: 'Promessa',
  REGULAR: 'Regular',
  ELITE: 'Elite',
  ACE: 'Ás',
  LEGEND: 'Lenda'
};

const RARITY_PT = {
  LOCKED: 'Locked',
  EGOISTA: 'Egoísta',
  NEW_GEN: 'New Gen'
};

function accent() {
  const hex = String(config.COLORS?.PRIMARY || '#FF4D8D').replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : 0xff4d8d;
}

function bar(cur, max, len = 10) {
  if (max <= 0) return '░'.repeat(len);
  const f = Math.round(Math.max(0, Math.min(1, cur / max)) * len);
  return '█'.repeat(f) + '░'.repeat(len - f);
}

function btn(id, label, style, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function loadData(targetUser, viewerId) {
  const userId = targetUser.id;
  const username = targetUser.username;
  const displayName = targetUser.globalName || targetUser.displayName || username;
  const isSelf = userId === viewerId;
  const avatarURL = targetUser.displayAvatarURL({ size: 256, extension: 'png' });

  DataService.ensureUser(userId, username);

  const cards = DataService.loadCards();
  const userCards = DataService.getValidUserCards(userId, cards);
  const iene = DataService.getIene(userId);
  const teamRows = DataService.getTeam(userId);
  const lines = getSquadLines(userId);
  const coachId = getCoachId(userId);
  const formation = getFormationForCoach(coachId);
  const coachCard = coachId != null ? cards.find(c => c.id === coachId) : null;
  const masterPassive = formatPassiveShort(userId);

  const poolSize = cards.length;
  const owned = userCards.length;
  const remaining = Math.max(0, poolSize - owned);
  const binderPct = poolSize > 0 ? Math.round((owned / poolSize) * 100) : 0;
  const fullBinder = poolSize > 0 && owned === poolSize;
  const fullTeam = teamRows.length === 11;

  let avgLevel = 0;
  if (teamRows.length > 0) {
    avgLevel = Math.round(teamRows.reduce((s, r) => s + (r.level || 0), 0) / teamRows.length);
  }

  const staffTitles = getStaffTitles(userId);
  const playerRank = getPlayerRank({
    owned,
    poolSize,
    teamAvgLevel: avgLevel,
    teamSize: teamRows.length
  });
  const rankName = RANK_PT[playerRank.key] || playerRank.key;
  const nextRankName = playerRank.next ? (RANK_PT[playerRank.next.key] || playerRank.next.key) : null;

  return {
    userId,
    username,
    displayName,
    isSelf,
    avatarURL,
    cards,
    userCards,
    iene,
    teamRows,
    lines,
    coachCard,
    formation,
    masterPassive,
    poolSize,
    owned,
    remaining,
    binderPct,
    fullBinder,
    fullTeam,
    avgLevel,
    staffTitles,
    playerRank,
    rankName,
    nextRankName
  };
}

function findCard(uc, cards) {
  return cards.find(c => c.id === uc.id) || null;
}

function buildGallery(d) {
  const picks = [];
  const seen = new Set();

  for (const row of d.teamRows) {
    const card = d.cards.find(c => c.id === row.cardId);
    if (!card?.icon || seen.has(card.id)) continue;
    picks.push(card);
    seen.add(card.id);
    if (picks.length >= 3) break;
  }
  if (picks.length < 3) {
    for (const uc of d.userCards) {
      const card = findCard(uc, d.cards);
      if (!card?.icon || seen.has(card.id)) continue;
      picks.push(card);
      seen.add(card.id);
      if (picks.length >= 3) break;
    }
  }

  const files = [];
  const gallery = new MediaGalleryBuilder();
  for (const card of picks) {
    const full = path.join(ICONS_DIR, card.icon);
    if (!fs.existsSync(full)) continue;
    const name = `perfil_${card.id}.png`;
    files.push(new AttachmentBuilder(full, { name }));
    gallery.addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${name}`)
        .setDescription(`${card.name}`)
    );
  }
  return { gallery: files.length ? gallery : null, files };
}

function headerSection(d) {
  const tags = [];
  for (const s of d.staffTitles) tags.push(`${s.emoji} **${s.label}**`);
  tags.push(`${d.playerRank.emoji} **${d.rankName}**`);
  if (d.fullBinder) tags.push('**Binder completo**');
  if (d.fullTeam) tags.push('**Onze pronto**');

  const sub = d.isSelf
    ? `-# @${d.username} · este é o seu perfil`
    : `-# @${d.username} · perfil de outro jogador`;

  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${d.displayName}`),
      new TextDisplayBuilder().setContent(sub),
      new TextDisplayBuilder().setContent(safeTruncate(tags.join(' · ') || '—', 800))
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(d.avatarURL).setDescription(d.displayName)
    );
}

/** Visão principal — uma tela legível, densa e organizada */
function buildMain(d, viewerId) {
  const ieneStr = Number(d.iene || 0).toLocaleString('pt-BR');

  // Bloco status (números importantes em code)
  const status = [
    '## Status',
    `**Rank** · ${d.rankName}` +
      (d.nextRankName
        ? ` · próximo **${d.nextRankName}** · \`${d.playerRank.progressToNext}%\``
        : ' · **rank máximo**'),
    `**Iene** \`${ieneStr}\`  ·  **Onze** \`${d.teamRows.length}/11\`  ·  **Média** \`Lv.${d.avgLevel || 0}\``,
    `**Binder** \`${d.owned}/${d.poolSize}\` · \`${d.binderPct}%\`` +
      (d.remaining > 0 ? ` · faltam \`${d.remaining}\`` : ' · **completo**'),
    `**Formação** · **${d.formation.label}**  ·  **Master** · ${d.coachCard ? `**${d.coachCard.name}**` : '*nenhum*'}`
  ].join('\n');

  const colecao = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### Coleção'),
      new TextDisplayBuilder().setContent(
        `**${d.owned}/${d.poolSize}** cartas\n${bar(d.owned, d.poolSize, 12)}\n-# ${d.remaining > 0 ? `Faltam **${d.remaining}** para fechar o binder.` : 'Você já tem todas as cartas.'}`
      )
    )
    .setButtonAccessory(
      btn(`${PREFIX}:${viewerId}:goto:collection`, 'Abrir binder', ButtonStyle.Primary)
    );

  const time = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### Time'),
      new TextDisplayBuilder().setContent(
        `**${d.teamRows.length}/11** em campo · média **Lv.${d.avgLevel || 0}**\n` +
        `Formação **${d.formation.label}**\n` +
        `Master: ${d.coachCard ? `**${d.coachCard.name}**` : '*não definido*'}` +
        (d.masterPassive ? `\n-# ${d.masterPassive}` : '')
      )
    )
    .setButtonAccessory(
      btn(`${PREFIX}:${viewerId}:goto:team`, 'Abrir time', ButtonStyle.Primary)
    );

  // Progressão por raridade
  const tiers = RARITY_ORDER.map(key => {
    const total = d.cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (!total) return null;
    const have = d.userCards.filter(uc => {
      const c = findCard(uc, d.cards);
      return c && c.position !== 'CO' && c.rarity === key;
    }).length;
    const em = RARITIES[key]?.emoji || '·';
    const label = RARITY_PT[key] || key;
    return `${em} **${label}** · ${bar(have, total, 8)} \`${have}/${total}\``;
  }).filter(Boolean);

  const coachTotal = d.cards.filter(c => c.position === 'CO').length;
  if (coachTotal) {
    const coachHave = d.userCards.filter(uc => findCard(uc, d.cards)?.position === 'CO').length;
    tiers.push(`🎩 **Masters** · ${bar(coachHave, coachTotal, 8)} \`${coachHave}/${coachTotal}\``);
  }

  const xpBlock = whoNeedsXpLines(d.userId, d.teamRows, 3) || 'Ninguém no onze precisa de XP agora.';
  const pulls = recentPullsLines(d.userId, 3) || 'Nenhum pull recente.';

  const { gallery, files } = buildGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.fullBinder ? 0x57f287 : accent())
    .addSectionComponents(headerSection(d))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeTruncate(status, 1800)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents(colecao, time);

  if (gallery) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Em destaque'))
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Progressão\n${tiers.join('\n') || '—'}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Quem precisa de XP\n${safeTruncate(xpBlock, 700)}`),
      new TextDisplayBuilder().setContent(`### Últimos pulls\n${safeTruncate(pulls, 700)}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Goal Bound · `/daily` · `/banners` · `/team` · `/collection`')
    );

  // Ações no rodapé
  const actions = [
    btn(`${PREFIX}:${viewerId}:details`, 'Campo e detalhes', ButtonStyle.Secondary),
    btn(`${PREFIX}:${viewerId}:goto:banners`, 'Banner', ButtonStyle.Secondary),
    btn(`${PREFIX}:${viewerId}:goto:daily`, 'Daily', ButtonStyle.Secondary)
  ];
  if (d.isSelf) {
    actions.push(btn(`${PREFIX}:${viewerId}:share`, 'Compartilhar', ButtonStyle.Success));
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(...actions.slice(0, 5)));

  return { container, files };
}

/** Segunda tela: campo + tiers + XP detalhado */
function buildDetails(d, viewerId) {
  const bySlot = new Map(d.teamRows.map(r => [r.slot, r]));
  const pitch = d.teamRows.length
    ? d.lines.map(line => {
        const cells = line.slots.map(slot => {
          const e = bySlot.get(slot);
          return e ? `${emojiTag(getEmojiForCard(e.cardId)) || '👤'} \`Lv.${e.level}\`` : '⬜';
        }).join('  ');
        return `**${line.name}**  ${cells}`;
      }).join('\n')
    : '_Campo vazio. Monte o onze em `/team`._';

  const tiers = RARITY_ORDER.map(key => {
    const total = d.cards.filter(c => c.rarity === key && c.position !== 'CO').length;
    if (!total) return null;
    const have = d.userCards.filter(uc => {
      const c = findCard(uc, d.cards);
      return c && c.position !== 'CO' && c.rarity === key;
    }).length;
    const em = RARITIES[key]?.emoji || '·';
    return `${em} **${RARITY_PT[key] || key}** · ${bar(have, total, 10)} \`${have}/${total}\``;
  }).filter(Boolean);

  const coachTotal = d.cards.filter(c => c.position === 'CO').length;
  if (coachTotal) {
    const coachHave = d.userCards.filter(uc => findCard(uc, d.cards)?.position === 'CO').length;
    tiers.push(`🎩 **Masters** · ${bar(coachHave, coachTotal, 10)} \`${coachHave}/${coachTotal}\``);
  }

  const xp = whoNeedsXpLines(d.userId, d.teamRows, 5) || 'Ninguém no onze precisa de XP agora.';
  const pulls = recentPullsLines(d.userId, 5) || 'Nenhum pull recente.';
  const { gallery, files } = buildGallery(d);

  const container = new ContainerBuilder()
    .setAccentColor(d.fullBinder ? 0x57f287 : accent())
    .addSectionComponents(headerSection(d))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Campo\n${safeTruncate(pitch, 1400)}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Progressão\n${tiers.join('\n') || '—'}\n\n**Binder** ${progressBar(d.owned, d.poolSize, 12)} **${d.binderPct}%**`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Quem precisa de XP\n${safeTruncate(xp, 1000)}`)
    );

  if (gallery) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Cartas do onze'))
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Últimos pulls\n${safeTruncate(pulls, 1000)}`)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(`${PREFIX}:${viewerId}:main`, 'Voltar', ButtonStyle.Primary),
        btn(`${PREFIX}:${viewerId}:goto:collection`, 'Binder', ButtonStyle.Secondary),
        btn(`${PREFIX}:${viewerId}:goto:team`, 'Time', ButtonStyle.Secondary)
      )
    );

  return { container, files };
}

function buildProfilePayload(targetUser, viewerId, view = 'main') {
  const d = loadData(targetUser, viewerId);
  return view === 'details' ? buildDetails(d, viewerId) : buildMain(d, viewerId);
}

async function sendBuilt(interaction, built, edit = false) {
  const payload = {
    components: [built.container],
    flags: MessageFlags.IsComponentsV2,
    files: built.files || []
  };
  if (edit || interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function openProfilePanel(interaction, userId, targetUser) {
  const built = buildProfilePayload(targetUser, userId, 'main');
  try {
    await sendBuilt(interaction, built, true);
  } catch (error) {
    logger.error('Erro ao abrir perfil', error.message);
    await interaction.followUp({
      components: [built.container],
      flags: MessageFlags.IsComponentsV2 | 64,
      files: built.files || []
    });
  }
}

module.exports = {
  buildProfilePayload,
  openProfilePanel,

  data: withPtBr(
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Mostra seu perfil — rank, iene, time, binder e progressao')
      .addUserOption(opt =>
        optionPtBr(
          opt.setName('user').setDescription('Ver o perfil de outra pessoa').setRequired(false),
          'Ver o perfil de outra pessoa'
        )
      ),
    'Mostra seu perfil — rank, iene, time, binder e progressao'
  ),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('user') || interaction.user;
      if (target.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Conta automática', 'Escolha uma pessoa para ver o perfil.')],
          flags: 64
        });
        return;
      }
      const built = buildProfilePayload(target, interaction.user.id, 'main');
      await sendBuilt(interaction, built);
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Erro no /profile', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', 'Não deu pra carregar o perfil.')],
            flags: 64
          });
        }
      } catch { /* ignore */ }
    }
  },

  async handleComponent(interaction) {
    const parts = String(interaction.customId || '').split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const dest = parts[3];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildStatusEmbed('WARNING', 'Não é seu painel', 'Abra o seu com **/profile**.')],
        flags: 64
      });
      return;
    }

    if (action === 'details' || action === 'main') {
      await interaction.deferUpdate();
      const built = buildProfilePayload(interaction.user, ownerId, action === 'details' ? 'details' : 'main');
      await sendBuilt(interaction, built, true);
      return;
    }

    if (action === 'share') {
      await interaction.deferUpdate();
      const built = buildProfilePayload(interaction.user, ownerId, 'main');
      try {
        if (interaction.channel?.send) {
          await interaction.channel.send({
            components: [built.container],
            flags: MessageFlags.IsComponentsV2,
            files: built.files || [],
            allowedMentions: { parse: [] }
          });
        } else {
          await interaction.followUp({
            components: [built.container],
            flags: MessageFlags.IsComponentsV2,
            files: built.files || []
          });
        }
      } catch (error) {
        logger.error('Erro ao compartilhar perfil', error.message);
        try {
          await interaction.followUp({
            embeds: [buildStatusEmbed('ERROR', 'Não deu pra compartilhar neste canal.')],
            flags: 64
          });
        } catch { /* ignore */ }
      }
      return;
    }

    if (action === 'goto') {
      await openDestination(interaction, dest, ownerId);
    }
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { RARITIES } = require('../services/rarities.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { formatDuration, progressBar, emojiTag, safeTruncate, brandFooter } = require('../utils/format.js');
const { getEmojiForCard } = require('../services/characterEmojis.js');
const { getProgressForXp } = require('../services/xpCurve.js');
const { maybeSendDmHint, notifyLevelUps } = require('../services/dmNotifier.js');
const { formatDupStatusLine } = require('../services/pullGrant.js');
const { isPrivileged } = require('../services/staff.js');
const {
  recordPull,
  isGateNotify,
  toggleGateNotify,
  getBannerPublicMessage,
  setBannerPublicMessage,
  clearBannerPublicMessage
} = require('../services/qolStore.js');
const { scheduleGateOpenDm } = require('../services/gateNotify.js');
const { poolCompleteHint } = require('../utils/qolText.js');
const { rollStandardWithPity } = require('../services/pityRoll.js');
const { buildStatusStrip } = require('../utils/statusStrip.js');
const { buildCtaRow } = require('../utils/nav.js');
const { t, rarityLabel } = require('../utils/i18n.js');
const { withPtBr } = require('../utils/slashLocale.js');
const { trySpendIene } = require('../services/atomicIene.js');
const { revealDelayMs } = require('../utils/revealTiming.js');
const {
  DEFAULT_BANNER,
  getBanner,
  cardsForBanner,
  rollTreinadoresCard,
  treinadoresOddsLine,
  padraoOddsLine
} = require('../services/banners.js');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');
const BANNERS_DIR = path.join(IMAGES_DIR, 'banners');
const SUMMON_COOLDOWN_MS = 60 * 1000;
const SUMMON_COST_IENE = 1;
const CUSTOM_ID_PREFIX = 'banners';
const EPHEMERAL = 64;

const BANNER_ART = { padrao: 'standard.gif', treinadores: 'coaches.gif' };
const HUB_ART = 'hub.gif';

function teaserFor(userId, rarity, isCoach) {
  if (isCoach) return { title: t(userId, 'teaser_coach_title'), description: t(userId, 'teaser_coach_desc') };
  if (rarity === 'EGOISTA') return { title: t(userId, 'teaser_ego_title'), description: t(userId, 'teaser_ego_desc') };
  if (rarity === 'NEW_GEN') return { title: t(userId, 'teaser_newgen_title'), description: t(userId, 'teaser_newgen_desc') };
  return { title: t(userId, 'teaser_locked_title'), description: t(userId, 'teaser_locked_desc') };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function parseCustomId(customId) {
  const parts = String(customId || '').split(':');
  return { prefix: parts[0], ownerId: parts[1], action: parts[2], bannerId: parts[3] || DEFAULT_BANNER, count: Math.max(1, parseInt(parts[4], 10) || 1) };
}

function nextSummonLine(userId, privileged) {
  if (privileged) return t(userId, 'next_ready');
  const readyUnix = Math.floor((Date.now() + SUMMON_COOLDOWN_MS) / 1000);
  return `⏱️ ${t(userId, 'next_pull')} <t:${readyUnix}:R>`;
}

function remainingFor(userId) {
  if (isPrivileged(userId)) return 0;
  return DataService.getSummonCooldownRemaining(userId, SUMMON_COOLDOWN_MS);
}

function collectionFooter(userId, owned, poolSize, privileged, banner) {
  const remaining = Math.max(0, poolSize - owned);
  const bar = progressBar(owned, poolSize, 8);
  const collectionPart = remaining > 0 ? t(userId, 'ban_footer_left', { bar, n: remaining }) : t(userId, 'ban_footer_done', { bar });
  return brandFooter(`${banner.emoji} ${banner.name} · ${collectionPart}`);
}

function resolveBannerArt(bannerId) {
  const name = BANNER_ART[bannerId];
  if (!name) return null;
  const full = path.join(BANNERS_DIR, name);
  if (!fs.existsSync(full)) return null;
  return { path: full, name };
}

function resolveHubArt() {
  const full = path.join(BANNERS_DIR, HUB_ART);
  if (!fs.existsSync(full)) return null;
  return { path: full, name: HUB_ART };
}

function buildHubRow(ownerId) {
  const notifyOn = isGateNotify(ownerId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:select:padrao`).setLabel(t(ownerId, 'ban_standard').slice(0, 80)).setEmoji('🏟️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:select:treinadores`).setLabel(t(ownerId, 'ban_coaches').slice(0, 80)).setEmoji('🧠').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:gatenotify`).setLabel((notifyOn ? t(ownerId, 'ban_gate_dm_on') : t(ownerId, 'ban_gate_dm_off')).slice(0, 80)).setEmoji('📬').setStyle(notifyOn ? ButtonStyle.Success : ButtonStyle.Secondary)
    )
  ];
}

function buildHubEmbed(ownerId, ieneBalance, privileged, remainingMs) {
  const strip = buildStatusStrip({ userId: ownerId, bannerId: 'padrao', remainingMs, ieneBalance, cost: SUMMON_COST_IENE });
  const lines = strip.split('\n').filter(l => !l.toLowerCase().includes('pity'));
  const art = resolveHubArt();
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.PRIMARY)
    .setTitle(`🎴 ${t(ownerId, 'ban_hub_title')}`)
    .setDescription(`${t(ownerId, 'ban_hub_pick')}\n\n🏟️ **${t(ownerId, 'ban_standard')}** — ${t(ownerId, 'ban_standard_desc')}\n🧠 **${t(ownerId, 'ban_coaches')}** — ${t(ownerId, 'ban_coaches_desc')}\n\n${lines.join('\n')}`)
    .setFooter({ text: brandFooter(t(ownerId, 'ban_private_panel')) })
    .setTimestamp();
  if (art) embed.setImage(`attachment://${art.name}`);
  return embed;
}

function buildBannerPanelEmbed(bannerId, ieneBalance, privileged, remainingMs, userId) {
  const banner = getBanner(bannerId);
  const odds = bannerId === 'treinadores' ? treinadoresOddsLine() : padraoOddsLine();
  const art = resolveBannerArt(bannerId);
  const strip = buildStatusStrip({ userId, bannerId, remainingMs, ieneBalance, cost: SUMMON_COST_IENE });
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.PRIMARY)
    .setTitle(`${banner.emoji} ${banner.name}`)
    .setDescription(`${banner.description}\n\n**${t(userId, 'ban_rates')}**\n${odds}\n\n${strip}`)
    .setFooter({ text: brandFooter(t(userId, 'ban_panel_footer')) })
    .setTimestamp();
  if (art) embed.setImage(`attachment://${art.name}`);
  return embed;
}

function buildBannerPanelRow(ownerId, bannerId, remainingMs, ieneBalance) {
  const privileged = isPrivileged(ownerId);
  const onCd = remainingMs > 0 && !privileged;
  const bal = ieneBalance ?? 0;
  const can1 = privileged || (!onCd && bal >= 1);
  let pullLabel;
  if (onCd) pullLabel = `⏱️ ${formatDuration(remainingMs)}`;
  else if (!privileged && bal < 1) pullLabel = `💰 ${t(ownerId, 'ban_need_iene')}`;
  else pullLabel = `🎲 ${t(ownerId, 'ban_roll')}`;
  const otherId = bannerId === 'treinadores' ? 'padrao' : 'treinadores';
  const other = getBanner(otherId);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:pull:${bannerId}:1`).setLabel(pullLabel.slice(0, 80)).setStyle(can1 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!can1)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:select:${otherId}`).setLabel(other.name.slice(0, 80)).setEmoji(other.emoji).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CUSTOM_ID_PREFIX}:${ownerId}:hub`).setLabel(t(ownerId, 'ban_all_pools').slice(0, 80)).setStyle(ButtonStyle.Secondary)
    )
  ];
  if (!privileged && bal < 1) rows.push(buildCtaRow(ownerId, 'no_iene'));
  return rows;
}

function rollCard(allCards, bannerId, userId) {
  const pool = cardsForBanner(allCards, bannerId);
  if (bannerId === 'treinadores') return { ...rollTreinadoresCard(pool), pityForced: false };
  return rollStandardWithPity(userId, pool);
}

function attachCardArt(card) {
  const files = [];
  let imageSource = null;

  if (card.localImage) {
    const localPath = path.join(IMAGES_DIR, card.localImage);
    if (fs.existsSync(localPath)) {
      const attachName = path.basename(card.localImage);
      files.push(new AttachmentBuilder(localPath, { name: attachName }));
      imageSource = `attachment://${attachName}`;
    } else {
      logger.warn(`Card art missing: ${localPath}`);
    }
  }

  return { files, imageSource, thumbnailSource: null };
}

function pullAuthor(interaction) {
  try {
    return { name: interaction.user.globalName || interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 64 }) };
  } catch {
    return { name: interaction.user.username };
  }
}

async function resolveChannel(interaction) {
  if (interaction.channel && typeof interaction.channel.send === 'function') return interaction.channel;
  if (!interaction.channelId) return null;
  try { return await interaction.client.channels.fetch(interaction.channelId); } catch { return null; }
}

async function publishPullToChannel(interaction, { embeds, files }) {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;
  const channel = await resolveChannel(interaction);
  if (!channel || typeof channel.send !== 'function') return { ok: false, reason: 'no_channel' };
  const prevId = getBannerPublicMessage(userId, channelId);
  if (prevId) {
    try { await channel.messages.delete(prevId); } catch { /* ignore */ }
    clearBannerPublicMessage(userId, channelId);
  }
  try {
    const sent = await channel.send({ embeds, files: files || [], allowedMentions: { parse: [] } });
    setBannerPublicMessage(userId, channelId, sent.id);
    return { ok: true };
  } catch (error) {
    logger.warn(`banners: could not post public pull (${error.message})`);
    return { ok: false, reason: error.message };
  }
}

async function restoreEphemeralPanel(interaction, ownerId, bannerId) {
  const remainingMs = remainingFor(ownerId);
  const ieneBalance = DataService.getIene(ownerId);
  const privileged = isPrivileged(ownerId);
  const files = [];
  const art = resolveBannerArt(bannerId);
  if (art) files.push(new AttachmentBuilder(art.path, { name: art.name }));
  await interaction.editReply({
    embeds: [buildBannerPanelEmbed(bannerId, ieneBalance, privileged, remainingMs, ownerId)],
    components: buildBannerPanelRow(ownerId, bannerId, remainingMs, ieneBalance),
    files
  });
}

async function showHub(interaction, ownerId) {
  const files = [];
  const art = resolveHubArt();
  if (art) files.push(new AttachmentBuilder(art.path, { name: art.name }));
  const ieneBalance = DataService.getIene(ownerId);
  const privileged = isPrivileged(ownerId);
  const remainingMs = remainingFor(ownerId);
  const payload = { embeds: [buildHubEmbed(ownerId, ieneBalance, privileged, remainingMs)], components: buildHubRow(ownerId), files };
  if (!interaction.deferred && !interaction.replied) { await interaction.reply({ ...payload, flags: EPHEMERAL }); return; }
  await interaction.editReply(payload);
}

async function showBannerPanel(interaction, ownerId, bannerId) {
  const remainingMs = remainingFor(ownerId);
  const ieneBalance = DataService.getIene(ownerId);
  const privileged = isPrivileged(ownerId);
  const files = [];
  const art = resolveBannerArt(bannerId);
  if (art) files.push(new AttachmentBuilder(art.path, { name: art.name }));
  const payload = { embeds: [buildBannerPanelEmbed(bannerId, ieneBalance, privileged, remainingMs, ownerId)], components: buildBannerPanelRow(ownerId, bannerId, remainingMs, ieneBalance), files };
  if (!interaction.deferred && !interaction.replied) { await interaction.reply({ ...payload, flags: EPHEMERAL }); return; }
  await interaction.editReply(payload);
}

async function safeEditOrFollow(interaction, payload, ephemeral = true) {
  const flags = ephemeral ? EPHEMERAL : undefined;
  const body = flags != null ? { ...payload, flags } : payload;
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply(body);
  } catch {
    await interaction.followUp({ ...payload, flags: EPHEMERAL });
  }
}

async function runPull(interaction, bannerId) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const privileged = isPrivileged(userId);
  const banner = getBanner(bannerId);
  const isCoachBanner = bannerId === 'treinadores';

  const allCards = DataService.loadCards();
  const pool = cardsForBanner(allCards, bannerId);
  if (!pool || pool.length === 0) {
    await safeEditOrFollow(interaction, { embeds: [buildStatusEmbed('ERROR', `⛔ ${t(userId, 'ban_pool_empty')}`, config.MESSAGES.POOL_EMPTY)], components: [], files: [] }, true);
    return;
  }

  DataService.ensureUser(userId, username);
  const poolIds = new Set(pool.map(c => c.id));
  const ownedInPool = DataService.getValidUserCards(userId, allCards).filter(c => poolIds.has(c.id)).length;
  const poolSize = pool.length;

  if (!privileged) {
    const remainingMs = DataService.getSummonCooldownRemaining(userId, SUMMON_COOLDOWN_MS);
    if (remainingMs > 0) {
      const time = formatDuration(remainingMs);
      const readyUnix = Math.floor((Date.now() + remainingMs) / 1000);
      const ieneBalance = DataService.getIene(userId);
      const body = t(userId, 'ban_gate_body', { time }) + `\n\n<t:${readyUnix}:R>`;
      await safeEditOrFollow(interaction, { embeds: [buildStatusEmbed('WARNING', `⏱️ ${t(userId, 'ban_gate_closed')}`, body)], components: buildBannerPanelRow(userId, bannerId, remainingMs, ieneBalance), files: [] }, true);
      return;
    }
  }

  let ieneBalance = DataService.getIene(userId);
  const cost = privileged ? 0 : SUMMON_COST_IENE;
  if (!privileged && ieneBalance < cost) {
    const remainingMs = remainingFor(userId);
    const body = `**${cost}** 💰\n${t(userId, 'balance')}: **${ieneBalance.toLocaleString('en-US')}**\n\n${t(userId, 'no_iene_cta')}`;
    await safeEditOrFollow(interaction, { embeds: [buildStatusEmbed('WARNING', `💰 ${t(userId, 'ban_not_enough')}`, body)], components: [...buildBannerPanelRow(userId, bannerId, remainingMs, ieneBalance), buildCtaRow(userId, 'no_iene')].slice(0, 5), files: [] }, true);
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    if (interaction.isMessageComponent()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: EPHEMERAL });
  }

  if (!privileged) {
    if (cost > 0) {
      const spent = trySpendIene(userId, cost);
      if (!spent.ok) {
        const remainingMs = remainingFor(userId);
        const body = `**${cost}** 💰\n${t(userId, 'balance')}: **${spent.balance.toLocaleString('en-US')}**\n\n${t(userId, 'no_iene_cta')}`;
        await interaction.editReply({ embeds: [buildStatusEmbed('WARNING', `💰 ${t(userId, 'ban_not_enough')}`, body)], components: [...buildBannerPanelRow(userId, bannerId, remainingMs, spent.balance), buildCtaRow(userId, 'no_iene')].slice(0, 5), files: [] });
        return;
      }
      ieneBalance = spent.balance;
    }

    const claim = DataService.tryClaimSummonCooldown(userId, SUMMON_COOLDOWN_MS);
    if (!claim.ok) {
      if (cost > 0) { DataService.addIene(userId, cost); ieneBalance = DataService.getIene(userId); }
      const remainingMs = claim.remainingMs || remainingFor(userId);
      const time = formatDuration(remainingMs);
      const readyUnix = Math.floor((Date.now() + remainingMs) / 1000);
      const body = t(userId, 'ban_gate_body', { time }) + `\n\n<t:${readyUnix}:R>`;
      await interaction.editReply({ embeds: [buildStatusEmbed('WARNING', `⏱️ ${t(userId, 'ban_gate_closed')}`, body)], components: buildBannerPanelRow(userId, bannerId, remainingMs, ieneBalance), files: [] });
      return;
    }
    scheduleGateOpenDm(interaction.client, userId, SUMMON_COOLDOWN_MS);
  }

  const author = pullAuthor(interaction);

  const { card: randomCard, rarity: rolledRarity, pityForced } = rollCard(allCards, bannerId, userId);
  const rarityInfo = RARITIES[rolledRarity] || RARITIES.LOCKED;
  const teaser = teaserFor(userId, rolledRarity, isCoachBanner);

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(isCoachBanner ? config.COLORS.PRIMARY : (RARITIES[rolledRarity] || RARITIES.LOCKED).color).setTitle(teaser.title).setDescription(`${teaser.description}\n\n${banner.emoji} **${banner.name}**`)],
    components: [],
    files: []
  });
  await sleep(revealDelayMs(rolledRarity, isCoachBanner));

  if (!randomCard) {
    const missEmbed = new EmbedBuilder().setColor(config.COLORS.WARNING).setAuthor(author).setTitle('⚠️').setDescription(`${banner.emoji} **${banner.name}**\n${nextSummonLine(userId, privileged)}`).setTimestamp();
    const posted = await publishPullToChannel(interaction, { embeds: [missEmbed], files: [] });
    if (!posted.ok) await interaction.editReply({ embeds: [missEmbed], components: buildBannerPanelRow(userId, bannerId, privileged ? 0 : remainingFor(userId), ieneBalance), files: [] });
    else await restoreEphemeralPanel(interaction, userId, bannerId);
    return;
  }

  const grant = DataService.addCardFromPull(userId, randomCard, rolledRarity);
  const alreadyOwned = !grant.isNew;
  recordPull(userId, { cardId: randomCard.id, name: randomCard.name, banner: bannerId, rarity: rolledRarity });
  const updatedOwnedInPool = DataService.getValidUserCards(userId, allCards).filter(c => poolIds.has(c.id)).length;
  const justCompleted = !alreadyOwned && ownedInPool < poolSize && updatedOwnedInPool === poolSize && poolSize > 0;
  const art = attachCardArt(randomCard);
  const cardProgress = getProgressForXp(DataService.getCardXp(userId, randomCard.id) || 0);
  const titleEmoji = emojiTag(getEmojiForCard(randomCard.id));
  const isCoach = randomCard.position === 'CO';

  let statusLine = justCompleted ? poolCompleteHint(bannerId, userId, allCards) : formatDupStatusLine(userId, grant, t);
  if (pityForced) statusLine += `\n${t(userId, 'soft_pity')}`;

  const bits = [statusLine];
  if (randomCard.catchphrase) bits.push('💬 *"' + safeTruncate(randomCard.catchphrase, 120) + '"*');
  bits.push('');
  bits.push(`${banner.emoji} **${banner.name}**`);
  bits.push(privileged ? t(userId, 'ban_free_line', { bal: ieneBalance.toLocaleString('en-US') }) : t(userId, 'ban_cost_line', { cost: SUMMON_COST_IENE, bal: ieneBalance.toLocaleString('en-US') }));
  bits.push(nextSummonLine(userId, privileged));

  const embed = new EmbedBuilder()
    .setColor(justCompleted ? config.COLORS.SUCCESS : alreadyOwned ? config.COLORS.WARNING : isCoach ? config.COLORS.PRIMARY : rarityInfo.color)
    .setAuthor(author)
    .setTitle(safeTruncate(titleEmoji ? `${titleEmoji} ${randomCard.name}` : randomCard.name, 256))
    .setDescription(safeTruncate(bits.join('\n'), 4096))
    .setImage(art.imageSource || null)
    .setFooter({ text: collectionFooter(userId, updatedOwnedInPool, poolSize, privileged, banner) })
    .setTimestamp();

  if (isCoach) embed.addFields({ name: t(userId, 'field_role'), value: t(userId, 'field_master'), inline: true });
  else {
    embed.addFields(
      { name: t(userId, 'field_rarity'), value: `${rarityInfo.emoji} **${rarityLabel(userId, rolledRarity)}**`, inline: true },
      { name: t(userId, 'field_role'), value: safeTruncate(randomCard.position || '—', 64), inline: true },
      { name: t(userId, 'field_level'), value: cardProgress.isMaxLevel ? `**${cardProgress.level}** MAX` : `**${cardProgress.level}**\n${progressBar(cardProgress.xpIntoCurrentLevel, cardProgress.xpNeededForNextLevel, 8)}`, inline: true }
    );
  }

  const posted = await publishPullToChannel(interaction, { embeds: [embed], files: art.files });
  if (!posted.ok) await interaction.editReply({ embeds: [embed], files: art.files, components: buildBannerPanelRow(userId, bannerId, privileged ? 0 : remainingFor(userId), ieneBalance) });
  else await restoreEphemeralPanel(interaction, userId, bannerId);

  if (grant.leveledUp) {
    try { await notifyLevelUps(interaction.user, [{ cardId: randomCard.id, cardName: randomCard.name, newLevel: grant.newLevel }]); } catch (_) {}
  }
  await maybeSendDmHint(interaction);
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder().setName('banners').setDescription('🎴 Banner — Standard / Coaches'),
    '🎴 Banner — Standard / Coaches'
  ),

  async execute(interaction) {
    try {
      DataService.ensureUser(interaction.user.id, interaction.user.username);
      await showHub(interaction, interaction.user.id);
      await maybeSendDmHint(interaction);
    } catch (error) {
      logger.error('Error in /banners command', error.message);
      try {
        const errEmbed = buildStatusEmbed('ERROR', '⛔', config.MESSAGES.ERROR_LOADING);
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errEmbed], flags: EPHEMERAL });
        else await interaction.reply({ embeds: [errEmbed], flags: EPHEMERAL });
      } catch (_) {}
    }
  },

  async handleComponent(interaction) {
    const { ownerId, action, bannerId } = parseCustomId(interaction.customId);
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ embeds: [buildStatusEmbed('WARNING', '🚫', t(ownerId, 'ban_open_self'))], flags: EPHEMERAL });
      return;
    }
    try {
      if (action === 'hub') { await interaction.deferUpdate(); await showHub(interaction, ownerId); return; }
      if (action === 'gatenotify') { await interaction.deferUpdate(); toggleGateNotify(ownerId); await showHub(interaction, ownerId); return; }
      if (action === 'select') { await interaction.deferUpdate(); await showBannerPanel(interaction, ownerId, bannerId === 'treinadores' ? 'treinadores' : 'padrao'); return; }
      if (action === 'ask' || action === 'go' || action === 'cancel') {
        const id = bannerId === 'treinadores' ? 'treinadores' : 'padrao';
        await interaction.deferUpdate();
        await showBannerPanel(interaction, ownerId, id);
        return;
      }
      if (action === 'pull') {
        const id = bannerId === 'treinadores' ? 'treinadores' : 'padrao';
        await runPull(interaction, id);
        return;
      }
      await interaction.deferUpdate();
    } catch (error) {
      logger.error('Error handling /banners component', error.message);
      try {
        const errEmbed = buildStatusEmbed('ERROR', '⛔', config.MESSAGES.ERROR_LOADING);
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errEmbed], flags: EPHEMERAL });
        else await interaction.reply({ embeds: [errEmbed], flags: EPHEMERAL });
      } catch (_) {}
    }
  }
};

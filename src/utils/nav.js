/**
 * Cross-panel navigation.
 *
 * Discord rule: MessageFlags.IsComponentsV2 messages CANNOT include embeds
 * (and vice-versa on the same edit). Nav/CTA therefore always uses followUp
 * so the source panel type is never mixed with the destination type.
 */
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const { t } = require('./i18n.js');

const DEST_KEYS = ['profile', 'collection', 'team', 'banners', 'daily', 'leaderboard'];

function destMeta(userId, key) {
  const map = {
    profile: { label: t(userId, 'nav_profile'), emoji: '🧬' },
    collection: { label: t(userId, 'nav_binder'), emoji: '📔' },
    team: { label: t(userId, 'nav_eleven'), emoji: '📋' },
    banners: { label: t(userId, 'nav_banner'), emoji: '🎴' },
    daily: { label: t(userId, 'nav_daily'), emoji: '💰' },
    leaderboard: { label: t(userId, 'nav_board'), emoji: '🏆' }
  };
  return map[key] || { label: key, emoji: '•' };
}

function buildNavSelect(ownerId, from, exclude = []) {
  const skip = new Set([from, ...exclude]);
  const options = DEST_KEYS
    .filter(key => !skip.has(key))
    .map(key => {
      const meta = destMeta(ownerId, key);
      return {
        label: meta.label,
        value: key,
        emoji: meta.emoji,
        description: t(ownerId, 'nav_open_cmd', {
          cmd: key === 'collection' ? 'collection' : key
        }).slice(0, 100)
      };
    });

  if (options.length === 0) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${from}:${ownerId}:nav`)
      .setPlaceholder(t(ownerId, 'nav_goto').slice(0, 100))
      .addOptions(options.slice(0, 25))
  );
}

function buildCtaRow(ownerId, kind) {
  if (kind === 'no_iene') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cta:${ownerId}:daily`)
        .setLabel(t(ownerId, 'cta_claim_daily').slice(0, 80))
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cta:${ownerId}:banners`)
        .setLabel(t(ownerId, 'cta_open_banner').slice(0, 80))
        .setEmoji('🎴')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (kind === 'empty_binder') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cta:${ownerId}:banners`)
        .setLabel(t(ownerId, 'cta_recruit').slice(0, 80))
        .setEmoji('🎴')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cta:${ownerId}:daily`)
        .setLabel(t(ownerId, 'cta_get_iene').slice(0, 80))
        .setEmoji('💰')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cta:${ownerId}:collection`)
      .setLabel(t(ownerId, 'cta_open_binder').slice(0, 80))
      .setEmoji('📔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cta:${ownerId}:banners`)
      .setLabel(t(ownerId, 'cta_need_cards').slice(0, 80))
      .setEmoji('🎴')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cta:${ownerId}:leaderboard`)
      .setLabel(t(ownerId, 'cta_board').slice(0, 80))
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary)
  );
}

function parseNavId(customId) {
  const parts = String(customId || '').split(':');
  return {
    command: parts[0] || '',
    ownerId: parts[1] || '',
    action: parts[2] || '',
    extra: parts.slice(3)
  };
}

function attachRows(container, rows) {
  for (const row of (rows || []).slice(0, 5)) {
    container.addActionRowComponents(row);
  }
  return container;
}

function boardBaseUrl() {
  const { getInfo } = require('../services/webServer.js');
  const web = getInfo();
  if (web.url) return web.url;
  const pub = process.env.PUBLIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (pub) {
    const raw = String(pub).trim().replace(/\/$/, '');
    const origin = raw.startsWith('http') ? raw : `https://${raw}`;
    return `${origin}/leaderboard`;
  }
  return null;
}

/**
 * Always followUp — never editReply across panel types.
 */
async function openDestination(interaction, dest, ownerId) {
  const { buildStatusEmbed } = require('./statusEmbed.js');

  if (interaction.user.id !== ownerId) {
    const payload = {
      embeds: [
        buildStatusEmbed(
          'WARNING',
          t(ownerId, 'panel_not_yours_title'),
          t(ownerId, 'panel_not_yours')
        )
      ],
      flags: 64
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch {
      /* already acked */
    }
  }

  const user = interaction.user;

  try {
    if (dest === 'profile') {
      const profile = require('../commands/profile.js');
      const { container } = profile.buildProfilePayload(user, ownerId);
      await interaction.followUp({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | 64
      });
      return;
    }

    if (dest === 'collection') {
      const collection = require('../commands/collection.js');
      const DataService = require('../services/DataService.js');
      DataService.ensureUser(ownerId, user.username);
      const result = collection.renderCollectionFor(
        ownerId,
        ownerId,
        user.username,
        user.displayAvatarURL(),
        0,
        true,
        'rarity',
        ''
      );
      if (result.isEmpty) {
        await interaction.followUp({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              t(ownerId, 'col_empty_title'),
              `${t(ownerId, 'empty_binder')}\n\n${t(ownerId, 'empty_binder_cta')}`
            )
          ],
          components: [buildCtaRow(ownerId, 'empty_binder')],
          flags: 64
        });
        return;
      }
      await interaction.followUp({
        components: [result.container],
        flags: MessageFlags.IsComponentsV2 | 64
      });
      return;
    }

    if (dest === 'team') {
      const team = require('../commands/team.js');
      const DataService = require('../services/DataService.js');
      DataService.ensureUser(ownerId, user.username);
      const { container, attachment, teamBySlot, formation } =
        await team.buildFormationDisplay(ownerId, user.username);
      const { resolveSlots } = require('../services/FieldRenderer.js');
      const slots = resolveSlots(formation.id);
      const rows = team.buildStateAComponents(ownerId, teamBySlot, slots);
      const full = attachRows(container, rows);
      await interaction.followUp({
        components: [full],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2 | 64
      });
      return;
    }

    if (dest === 'leaderboard' || dest === 'rank') {
      const { computeSquadScore, formatScore } = require('../services/squadScore.js');
      const base = boardBaseUrl();
      const url = base ? `${base}?user=${encodeURIComponent(ownerId)}` : null;
      const sp = computeSquadScore(ownerId);
      const power =
        sp.filled > 0
          ? t(ownerId, 'nav_rank_power', {
              score: formatScore(sp.score),
              filled: sp.filled
            })
          : t(ownerId, 'nav_rank_empty');
      const components = [];
      if (url) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setURL(url)
              .setLabel(t(ownerId, 'lb_open').slice(0, 80))
              .setEmoji('⚽')
          )
        );
      }
      await interaction.followUp({
        embeds: [
          buildStatusEmbed(
            'PRIMARY',
            t(ownerId, 'nav_rank_title'),
            url
              ? `${power}\n\n[${t(ownerId, 'lb_open')}](${url})`
              : power
          )
        ],
        components,
        flags: 64
      });
      return;
    }

    if (dest === 'banners' || dest === 'daily') {
      const title =
        dest === 'daily' ? t(ownerId, 'nav_daily_title') : t(ownerId, 'nav_banner_title');
      const body =
        dest === 'daily' ? t(ownerId, 'nav_daily_body') : t(ownerId, 'nav_banner_body');
      await interaction.followUp({
        embeds: [buildStatusEmbed('PRIMARY', title, body)],
        flags: 64
      });
    }
  } catch (err) {
    const logger = require('../logger/logger.js');
    logger.error('Error handling CTA/nav destination', err.message);
    try {
      await interaction.followUp({
        embeds: [buildStatusEmbed('ERROR', t(ownerId, 'err_loading'), err.message)],
        flags: 64
      });
    } catch { /* ignore */ }
  }
}

module.exports = {
  DEST_KEYS,
  buildNavSelect,
  buildCtaRow,
  parseNavId,
  openDestination
};

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const { brandFooter, emojiTag } = require('../utils/format.js');
const { getEmojiForCard } = require('./characterEmojis.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');

const LEVEL_MAX = 100;

const pendingDmHints = new Set();

function consumeDmHint(userId) {
  if (!pendingDmHints.has(userId)) return false;
  pendingDmHints.delete(userId);
  return true;
}

async function maybeSendDmHint(interaction) {
  if (!interaction?.user?.id) return;
  if (!consumeDmHint(interaction.user.id)) return;

  try {
    await interaction.followUp({
      embeds: [
        buildStatusEmbed(
          'WARNING',
          '\uD83D\uDDED DMs blocked',
          'A card ranked up, but Discord blocked the private message.\n\n' +
            'Allow **DMs from server members** (or open a DM with the bot) to get rank-up alerts.'
        )
      ],
      flags: 64
    });
  } catch (error) {
    logger.warn(`Failed to send DM-blocked hint to ${interaction.user.id}`, error.message);
  }
}

function lineFor(cardId, cardName, newLevel) {
  const icon = cardId != null ? emojiTag(getEmojiForCard(cardId)) : '';
  const prefix = icon ? `${icon} ` : '\uD83D\uDC51 ';
  if (newLevel >= LEVEL_MAX) {
    return `${prefix}**${cardName}** \u00b7 **Lv.${LEVEL_MAX}** MAX`;
  }
  return `${prefix}**${cardName}** \u00b7 **Lv.${newLevel}**`;
}

function buildOpenTeamRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`team:${userId}:fromdm`)
      .setLabel('Open Eleven')
      .setEmoji('\uD83D\uDCD0')
      .setStyle(ButtonStyle.Primary)
  );
}

async function notifyLevelUps(discordUser, levelUps) {
  if (!discordUser || !levelUps || levelUps.length === 0) return;

  const anyMax = levelUps.some(u => u.newLevel >= LEVEL_MAX);
  const single = levelUps.length === 1 ? levelUps[0] : null;

  let title;
  let description;

  if (single) {
    if (single.newLevel >= LEVEL_MAX) {
      title = `\uD83D\uDC51 ${single.cardName}`;
      description =
        `${lineFor(single.cardId, single.cardName, single.newLevel)}\n\n` +
        `_Peak form. Rotate the slot on **Eleven** if you want new XP targets._`;
    } else {
      title = `\uD83D\uDD3A ${single.cardName}`;
      description =
        `${lineFor(single.cardId, single.cardName, single.newLevel)}\n\n` +
        `_Only the eleven on **Eleven** keep climbing._`;
    }
  } else {
    title = anyMax
      ? `\uD83D\uDC51 ${levelUps.length} rank-ups`
      : `\uD83D\uDD3A ${levelUps.length} rank-ups`;

    const lines = levelUps
      .map(u => lineFor(u.cardId, u.cardName, u.newLevel))
      .join('\n');

    description =
      `${lines}\n\n` +
      (anyMax
        ? `_Someone hit MAX \u2014 rotate slots on **Eleven** if you want._`
        : `_Only fielded cards gain XP \u00b7 open **Eleven** to manage slots._`);
  }

  const embed = new EmbedBuilder()
    .setColor(anyMax ? (config.COLORS.SUCCESS || '#3DDC97') : (config.COLORS.GOLD || '#FFD166'))
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: brandFooter('Progress') })
    .setTimestamp();

  const components = [buildOpenTeamRow(discordUser.id)];

  try {
    await discordUser.send({ embeds: [embed], components });
    pendingDmHints.delete(discordUser.id);
  } catch (error) {
    logger.warn(`Could not send level-up DM to user ${discordUser.id}`, error.message);
    pendingDmHints.add(discordUser.id);
  }
}

module.exports = { notifyLevelUps, consumeDmHint, maybeSendDmHint };

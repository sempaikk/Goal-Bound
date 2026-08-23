const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config.js');
const logger = require('../logger/logger.js');
const DataService = require('../services/DataService.js');
const { getCoachId, setCoachId } = require('../services/coachStore.js');

/**
 * Resolve target by Discord User option, snowflake ID, or exact username
 * (login name — NOT display/global name).
 */
async function resolveTarget(client, interaction) {
  const userOpt = interaction.options.getUser('user');
  if (userOpt) return { user: userOpt, via: 'user' };

  const userId = interaction.options.getString('user_id')?.trim();
  if (userId) {
    try {
      const u = await client.users.fetch(userId);
      return { user: u, via: 'user_id' };
    } catch {
      return { error: `No Discord user with ID \`${userId}\`.` };
    }
  }

  const username = interaction.options.getString('username')?.trim().replace(/^@/, '');
  if (username) {
    const target = username.toLowerCase();

    for (const guild of client.guilds.cache.values()) {
      const cached = guild.members.cache.find(
        m => m.user.username.toLowerCase() === target
      );
      if (cached) return { user: cached.user, via: 'username' };
    }

    for (const guild of client.guilds.cache.values()) {
      try {
        const found = await guild.members.fetch({ query: username, limit: 25 });
        const hit = found.find(m => m.user.username.toLowerCase() === target);
        if (hit) return { user: hit.user, via: 'username' };
      } catch {
        /* ignore guilds we can't search */
      }
    }

    return {
      error:
        `Username \`${username}\` not found in any server the bot shares with them.\n` +
        `Use **user** (mention) or **user_id** (snowflake) instead.`
    };
  }

  return {
    error: 'Provide **user**, **user_id**, or **username** (Discord login name, not display name).'
  };
}

function findCards(query) {
  const cards = DataService.loadCards() || [];
  if (!query || query === 'all' || query === '*') {
    return { mode: 'all', cards };
  }

  const q = query.trim();
  const asId = Number(q);
  if (Number.isFinite(asId) && String(asId) === q) {
    const byId = cards.find(c => Number(c.id) === asId);
    if (byId) return { mode: 'one', cards: [byId] };
    return { error: `No card with id **${q}**.` };
  }

  const lower = q.toLowerCase();
  const exact = cards.filter(c => c.name.toLowerCase() === lower);
  if (exact.length === 1) return { mode: 'one', cards: exact };
  if (exact.length > 1) return { mode: 'one', cards: [exact[0]] };

  const partial = cards.filter(c => c.name.toLowerCase().includes(lower));
  if (partial.length === 1) return { mode: 'one', cards: partial };
  if (partial.length === 0) return { error: `No card matching \`${q}\`.` };
  return {
    error:
      `Several matches for \`${q}\`:\n` +
      partial
        .slice(0, 12)
        .map(c => `· **${c.id}** ${c.name}`)
        .join('\n') +
      (partial.length > 12 ? `\n· …+${partial.length - 12}` : '') +
      `\n\nUse the **id** or the full name.`
  };
}

function targetOptions(builder) {
  return builder
    .addUserOption(o =>
      o.setName('user').setDescription('Discord user (preferred)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('user_id').setDescription('Discord snowflake ID').setRequired(false)
    )
    .addStringOption(o =>
      o
        .setName('username')
        .setDescription('Exact Discord username (login), NOT display name')
        .setRequired(false)
    );
}

function failEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.COLORS.ERROR)
    .setTitle(title)
    .setDescription(description);
}

function warnEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.COLORS.WARNING)
    .setTitle(title)
    .setDescription(description);
}

/** If the removed card is the active master, clear it (formation → default). */
function clearMasterIfNeeded(userId, cardId) {
  try {
    const active = getCoachId(userId);
    if (active != null && Number(active) === Number(cardId)) {
      setCoachId(userId, null, DataService);
      return true;
    }
  } catch (error) {
    logger.warn('grant: could not clear master after remove', error.message);
  }
  return false;
}

function clearAllMasters(userId) {
  try {
    const active = getCoachId(userId);
    if (active != null) {
      setCoachId(userId, null, DataService);
      return true;
    }
  } catch (error) {
    logger.warn('grant: could not clear master after clear', error.message);
  }
  return false;
}

async function runGive(interaction, target, resolvedVia) {
  const cardQuery = interaction.options.getString('card', true);
  const found = findCards(cardQuery);
  if (found.error) {
    await interaction.editReply({ embeds: [failEmbed('Grant failed', found.error)] });
    return;
  }

  DataService.ensureUser(target.id, target.username);

  let added = 0;
  let already = 0;
  const addedNames = [];

  for (const card of found.cards) {
    if (DataService.userHasCard(target.id, card.id)) {
      already += 1;
      continue;
    }
    // Direct insert — no duplicate XP (admin grant, not a pull)
    DataService.addCard(target.id, card.id, card.name);
    added += 1;
    if (addedNames.length < 20) addedNames.push(card.name);
  }

  logger.success(
    `Grant by ${interaction.user.username} → ${target.username}`,
    `${added} new · ${already} already · mode=${found.mode}`
  );

  const who = `**${target.username}** (\`${target.id}\`)`;
  const list =
    addedNames.length > 0
      ? addedNames.map(n => `· ${n}`).join('\n') +
        (added > addedNames.length ? `\n· …+${added - addedNames.length}` : '')
      : '_none_';

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.SUCCESS)
    .setTitle(found.mode === 'all' ? 'Full roster grant' : 'Card grant')
    .setDescription(`Target: ${who}\nResolved via **${resolvedVia}**.`)
    .addFields(
      { name: 'Added', value: String(added), inline: true },
      { name: 'Already owned', value: String(already), inline: true },
      {
        name: 'Pool',
        value: found.mode === 'all' ? `all (${found.cards.length})` : found.cards[0].name,
        inline: true
      },
      { name: 'New cards', value: list.slice(0, 1000), inline: false }
    )
    .setFooter({
      text: 'Only missing cards are inserted — no duplicate XP on grant.'
    });

  await interaction.editReply({ embeds: [embed] });
}

async function runRemove(interaction, target, resolvedVia) {
  const cardQuery = interaction.options.getString('card', true);
  const found = findCards(cardQuery);
  if (found.error) {
    await interaction.editReply({ embeds: [failEmbed('Remove failed', found.error)] });
    return;
  }
  if (found.mode === 'all') {
    await interaction.editReply({
      embeds: [
        failEmbed(
          'Remove failed',
          'Use **`/grant clear`** to wipe the whole binder.\n**remove** is for one character (name or id).'
        )
      ]
    });
    return;
  }

  const card = found.cards[0];
  DataService.ensureUser(target.id, target.username);

  if (!DataService.userHasCard(target.id, card.id)) {
    await interaction.editReply({
      embeds: [
        warnEmbed(
          'Nothing to remove',
          `**${target.username}** does not own **${card.name}** (id ${card.id}).`
        )
      ]
    });
    return;
  }

  const result = DataService.removeCard(target.id, card.id);
  const masterCleared = clearMasterIfNeeded(target.id, card.id);

  logger.success(
    `Remove by ${interaction.user.username} → ${target.username}`,
    `${card.name} (#${card.id}) · slots=${result.clearedSlots} · masterCleared=${masterCleared}`
  );

  const who = `**${target.username}** (\`${target.id}\`)`;
  const notes = [];
  if (result.clearedSlots > 0) {
    notes.push(`Cleared **${result.clearedSlots}** team slot(s).`);
  }
  if (masterCleared) {
    notes.push('Active **master** was this card — master cleared (default formation).');
  }

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.WARNING)
    .setTitle('Card removed')
    .setDescription(
      `Target: ${who}\nResolved via **${resolvedVia}**.\n\n` +
        `Removed **${card.name}** (id **${card.id}**).` +
        (notes.length ? `\n\n${notes.join('\n')}` : '')
    )
    .setFooter({ text: 'Card deleted from binder and pitch if seated.' });

  await interaction.editReply({ embeds: [embed] });
}

async function runClear(interaction, target, resolvedVia) {
  DataService.ensureUser(target.id, target.username);

  const beforeCount = DataService.getUserCardCount(target.id);
  if (beforeCount === 0) {
    await interaction.editReply({
      embeds: [
        warnEmbed(
          'Nothing to clear',
          `**${target.username}** already has an empty binder.`
        )
      ]
    });
    return;
  }

  const result = DataService.clearAllCards(target.id);
  const masterCleared = clearAllMasters(target.id);

  logger.success(
    `Clear by ${interaction.user.username} → ${target.username}`,
    `cards=${result.cardsRemoved} · slots=${result.slotsCleared} · masterCleared=${masterCleared}`
  );

  const who = `**${target.username}** (\`${target.id}\`)`;
  const notes = [];
  if (result.slotsCleared > 0) {
    notes.push(`Cleared **${result.slotsCleared}** team slot(s).`);
  }
  if (masterCleared) {
    notes.push('Active **master** cleared (default formation).');
  }

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.WARNING)
    .setTitle('Binder wiped')
    .setDescription(
      `Target: ${who}\nResolved via **${resolvedVia}**.\n\n` +
        `Removed **${result.cardsRemoved}** card(s) from the binder.` +
        (notes.length ? `\n\n${notes.join('\n')}` : '')
    )
    .setFooter({ text: 'Full wipe — binder + pitch. Iene and cooldowns unchanged.' });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName('grant')
    .setDescription('🔒 [Owner] Give or remove cards from a player')
    .addSubcommand(sc =>
      targetOptions(
        sc
          .setName('give')
          .setDescription('Give one card or the full roster')
          .addStringOption(o =>
            o
              .setName('card')
              .setDescription('Card name or id — or "all" for every character')
              .setRequired(true)
          )
      )
    )
    .addSubcommand(sc =>
      targetOptions(
        sc
          .setName('remove')
          .setDescription('Remove one specific character from the binder')
          .addStringOption(o =>
            o
              .setName('card')
              .setDescription('Card name or id to remove')
              .setRequired(true)
          )
      )
    )
    .addSubcommand(sc =>
      targetOptions(
        sc
          .setName('clear')
          .setDescription('Remove ALL cards + clear the pitch for a player')
      )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      const sub = interaction.options.getSubcommand();
      const resolved = await resolveTarget(interaction.client, interaction);
      if (resolved.error) {
        await interaction.editReply({ embeds: [failEmbed('Grant failed', resolved.error)] });
        return;
      }

      const target = resolved.user;
      if (target.bot) {
        await interaction.editReply({
          embeds: [warnEmbed('Blocked', 'Bots cannot receive or lose cards.')]
        });
        return;
      }

      if (sub === 'give') {
        await runGive(interaction, target, resolved.via);
      } else if (sub === 'remove') {
        await runRemove(interaction, target, resolved.via);
      } else if (sub === 'clear') {
        await runClear(interaction, target, resolved.via);
      } else {
        await interaction.editReply({
          embeds: [failEmbed('Grant failed', `Unknown subcommand: ${sub}`)]
        });
      }
    } catch (error) {
      logger.error('Error in /grant', error.message);
      await interaction.editReply({
        embeds: [failEmbed('Grant failed', error.message || 'Unexpected error')]
      });
    }
  }
};

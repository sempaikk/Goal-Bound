const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const logger = require('../../logger/logger.js');
const config = require('../../config/config.js');
const DataService = require('../../services/DataService.js');
const { buildStatusEmbed } = require('../../utils/statusEmbed.js');
const { getCoachId, getFormationForCoach } = require('../../services/coachStore.js');
const { resolveSlots } = require('../../services/FieldRenderer.js');
const {
  filterSlotsForCard,
  canPlaySlot,
  positionMismatchMessage,
  POSITION_LABEL
} = require('../../services/positionEligibility.js');

function parseCardNameFromEmbeds(embeds) {
  if (!embeds || embeds.length === 0) return null;
  for (const emb of embeds) {
    const title = emb.title || '';
    const cleaned = title
      .replace(/<a?:\w+:\d+>/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[—–\-].*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2) return cleaned;
  }
  return null;
}

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Seat on team')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    try {
      const msg = interaction.targetMessage;
      if (!msg) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'No message', 'Could not read that message.')],
          flags: 64
        });
        return;
      }

      if (!msg.author?.bot) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Not a bot reveal', 'Use this on a **Goal Bound** card reveal message.')],
          flags: 64
        });
        return;
      }

      const nameGuess = parseCardNameFromEmbeds(msg.embeds);
      if (!nameGuess) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'No card found', 'Could not read a card name from that message.')],
          flags: 64
        });
        return;
      }

      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);
      const cards = DataService.loadCards();
      const card = cards.find(c => c.name.toLowerCase() === nameGuess.toLowerCase())
        || cards.find(c => c.name.toLowerCase().includes(nameGuess.toLowerCase()));

      if (!card) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Unknown card', `Could not match **${nameGuess}** to the pool.`)],
          flags: 64
        });
        return;
      }

      if (card.position === 'CO') {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Masters stay off-pitch', 'Assign masters with **Master** on `/team`.')],
          flags: 64
        });
        return;
      }

      if (!DataService.userHasCard(userId, card.id)) {
        await interaction.reply({
          embeds: [buildStatusEmbed('WARNING', 'Not in your binder', `You don't own **${card.name}**.`)],
          flags: 64
        });
        return;
      }

      const coachId = getCoachId(userId);
      const formation = getFormationForCoach(coachId);
      const slots = resolveSlots(formation.id);
      const allowed = filterSlotsForCard(card.position, slots);
      if (allowed.length === 0) {
        await interaction.reply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              'No valid roles',
              `**${card.name}** (${POSITION_LABEL[card.position] || card.position}) has no seats in **${formation.label}**.`
            )
          ],
          flags: 64
        });
        return;
      }

      const team = DataService.getTeam(userId);
      const filled = new Set(team.map(r => r.slot));

      const options = allowed.map(s => ({
        label: `${s.key} (${s.label})`.slice(0, 100),
        description: filled.has(s.key) ? 'Occupied — will replace' : 'Empty',
        value: s.key,
        emoji: filled.has(s.key) ? '✅' : '⬜'
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId(`team:${userId}:seatctx:${card.id}`)
        .setPlaceholder(`Seat ${card.name} at…`)
        .addOptions(options.slice(0, 25));

      const posLabel = POSITION_LABEL[card.position] || card.position;
      await interaction.reply({
        embeds: [
          buildStatusEmbed(
            'PRIMARY',
            `📋 Seat ${card.name}`,
            `**${posLabel}** · pick a role on **${formation.label}**.\n_Only positions matching this role are listed._`
          )
        ],
        components: [new ActionRowBuilder().addComponents(select)],
        flags: 64
      });
    } catch (error) {
      logger.error('Error in context Seat on team', error.message);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
            flags: 64
          });
        }
      } catch (_) { /* ignore */ }
    }
  }
};

const {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags
} = require('discord.js');
const logger = require('../logger/logger.js');
const config = require('../config/config.js');
const DataService = require('../services/DataService.js');
const { renderCard } = require('../services/cardRenderer.js');
const { buildStatusEmbed } = require('../utils/statusEmbed.js');
const { withPtBr } = require('../utils/slashLocale.js');

function findCard(cards, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const exact = cards.find(c => String(c.name).toLowerCase() === q);
  if (exact) return exact;
  const starts = cards.find(c => String(c.name).toLowerCase().startsWith(q));
  if (starts) return starts;
  return cards.find(c => String(c.name).toLowerCase().includes(q)) || null;
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('card')
      .setDescription('🃏 Preview a Goal Bound trading card (FUT-style)')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('Character name (e.g. Isagi, Sae, Barou)')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(40)
      ),
    '🃏 Prévia de uma carta Goal Bound (estilo FUT)'
  ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const userId = interaction.user.id;
      DataService.ensureUser(userId, interaction.user.username);

      const query = interaction.options.getString('name', true);
      const cards = DataService.loadCards() || [];
      const card = findCard(cards, query);

      if (!card) {
        await interaction.editReply({
          embeds: [
            buildStatusEmbed(
              'WARNING',
              'Card not found',
              `No character matches **${query}**.\nTry a name from the roster (e.g. **Isagi**, **Rin**, **Sae**).`
            )
          ]
        });
        return;
      }

      let level;
      if (DataService.userHasCard(userId, card.id)) {
        level = DataService.getCardLevel(userId, card.id) ?? 0;
      }

      const png = await renderCard(card, { level });
      if (!png) {
        await interaction.editReply({
          embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)]
        });
        return;
      }

      const fileName = `gb-card-${card.id}.png`;
      const file = new AttachmentBuilder(png, { name: fileName });

      const owned =
        level != null
          ? `\n_You own this card · **Lv.${level}**_`
          : '\n_Catalog preview — recruit with `/banners`_';

      await interaction.editReply({
        content: `**${card.name}** · ${card.position || '—'} · ${card.rarity || 'MASTER'}${owned}`,
        files: [file]
      });
    } catch (error) {
      logger.error('Error in /card', error.message);
      try {
        const payload = {
          embeds: [buildStatusEmbed('ERROR', config.MESSAGES.ERROR_LOADING)],
          flags: MessageFlags.Ephemeral
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload).catch(() =>
            interaction.followUp(payload)
          );
        } else {
          await interaction.reply(payload);
        }
      } catch {
        /* ignore */
      }
    }
  }
};

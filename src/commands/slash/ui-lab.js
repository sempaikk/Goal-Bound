const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags
} = require('discord.js');
const { withPtBr } = require('../../utils/slashLocale.js');
const { text, separator, section, statLine } = require('../../utils/arenaV2.js');

/**
 * Temporary visual laboratory for the Arena redesign.
 * This command intentionally has no domain logic and can be removed after the
 * visual system is approved. It exists to validate the V2 composition style
 * directly in Discord before migrating production commands.
 */
function buildPanel(interaction) {
  const user = interaction.user;
  const avatar = user.displayAvatarURL({ extension: 'png', size: 128 });

  return new ContainerBuilder()
    .setAccentColor(0x1687ff)
    .addTextDisplayComponents(
      text('# BLUE LOCK ARENA'),
      text('**Laboratório Visual · Components V2**\nUma primeira prova do novo sistema de interface do Arena.')
    )
    .addSeparatorComponents(separator())
    .addSectionComponents(
      section({
        title: `## ${user.displayName}`,
        body: '**PERFIL DO JOGADOR**\n`BRONZE I` · **PDL 0**\n\n' + statLine([
          '**Vitórias:** 0',
          '**Partidas:** 0',
          '**Taxa:** 0%'
        ]),
        imageURL: avatar,
        imageAlt: `Avatar de ${user.displayName}`
      })
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text('### VISÃO DO NOVO SISTEMA'),
      text('-# Hierarquia tipográfica com títulos, metadados e subtexto.\n-# Blocos separados por função, em vez de uma parede de texto.\n-# Imagem tratada como parte da interface.\n-# Ações agrupadas somente quando realmente necessárias.'),
      text('**Coleção** · **Perfil** · **Arena** · **Loja**\n`Cada superfície terá sua própria composição, mantendo o mesmo DNA visual.`')
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ui-lab-approved')
          .setLabel('Explorar conceito')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ui-lab-secondary')
          .setLabel('Comparar visual')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ui-lab-disabled')
          .setLabel('Em desenvolvimento')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    )
    .addTextDisplayComponents(
      text('-# Protótipo visual · não altera dados do jogador e não representa ainda o layout final.')
    );
}

module.exports = {
  data: withPtBr(
    new SlashCommandBuilder()
      .setName('ui-lab')
      .setDescription('Exibe um protótipo visual do novo sistema de interface do Arena.'),
    'Exibe um protótipo visual do novo sistema de interface do Arena.'
  ),

  async execute(interaction) {
    await interaction.reply({
      components: [buildPanel(interaction)],
      flags: MessageFlags.IsComponentsV2
    });
  }
};

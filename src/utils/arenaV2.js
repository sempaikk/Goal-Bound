const {
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

/**
 * Visual language shared by Blue Lock Arena Components V2 panels.
 * Keep domain logic out of this module: it only composes visual primitives.
 */
function text(content) {
  return new TextDisplayBuilder().setContent(String(content || ''));
}

function separator(spacing = SeparatorSpacingSize.Small) {
  return new SeparatorBuilder().setDivider(true).setSpacing(spacing);
}

function section({ title, body, imageURL, imageAlt = '' }) {
  const builder = new SectionBuilder().addTextDisplayComponents(
    text(title),
    text(body)
  );

  if (imageURL) {
    builder.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(imageURL)
        .setDescription(imageAlt || title || 'Imagem')
    );
  }

  return builder;
}

function metric(label, value) {
  return `**${label}:** ${value}`;
}

function statLine(items) {
  return items.filter(Boolean).join('  ·  ');
}

module.exports = {
  text,
  separator,
  section,
  metric,
  statLine
};

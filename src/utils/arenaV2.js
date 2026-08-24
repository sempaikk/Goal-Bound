const {
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

/**
 * Shared Components V2 primitives for Goal Bound (Arena-style density).
 * No domain logic — only layout helpers.
 *
 * Reference layout (Blue Lock Arena catalog):
 *   Container + accent
 *   Header Section (title + subtitle | thumbnail)
 *   Compact filter/sort controls
 *   Numbered list rows (text left | card thumb right)
 *   Muted page footer + pagination
 */

function text(content) {
  return new TextDisplayBuilder().setContent(String(content ?? ''));
}

function separator(spacing = SeparatorSpacingSize.Small) {
  return new SeparatorBuilder().setDivider(true).setSpacing(spacing);
}

function separatorLarge() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large);
}

/**
 * Section: 1–3 text lines + required accessory (thumbnail URL or button builder).
 */
function section({ title, body, footnote, imageURL, imageAlt, button }) {
  const lines = [];
  if (title) lines.push(text(title));
  if (body) lines.push(text(body));
  if (footnote) lines.push(text(footnote));
  if (!lines.length) lines.push(text('\u200b'));

  const builder = new SectionBuilder().addTextDisplayComponents(...lines.slice(0, 3));

  if (button) {
    builder.setButtonAccessory(button);
  } else if (imageURL) {
    builder.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(imageURL)
        .setDescription(String(imageAlt || title || 'Arte').slice(0, 100))
    );
  }

  return builder;
}

/** Catalog-style header: # Title + short blurb | featured thumb */
function headerSection({ title, subtitle, hint, imageURL, imageAlt }) {
  return section({
    title: title.startsWith('#') ? title : `# ${title}`,
    body: subtitle || undefined,
    footnote: hint ? `-# ${hint}` : undefined,
    imageURL,
    imageAlt
  });
}

/**
 * List row for catalog/binder:
 *   **1. Name**
 *   POS · OVR · Lv.x · pin
 */
function listRow({ index, name, detail, imageURL, imageAlt }) {
  const title = `**${index}. ${name}**`;
  const body = detail || '\u200b';
  if (imageURL) {
    return section({
      title,
      body,
      imageURL,
      imageAlt: imageAlt || name
    });
  }
  return {
    texts: [text(`${title}\n${body}`)]
  };
}

function metric(label, value) {
  return `**${label}:** ${value}`;
}

function statLine(items) {
  return items.filter(Boolean).join('  ·  ');
}

/** Muted secondary line (-# …) */
function muted(content) {
  return text(`-# ${String(content ?? '')}`);
}

module.exports = {
  text,
  separator,
  separatorLarge,
  section,
  headerSection,
  listRow,
  metric,
  statLine,
  muted
};

/**
 * Slash command description helpers.
 *
 * Discord shows description_localizations based on the *client* language,
 * NOT the bot's /profile language preference. That mismatch confuses players,
 * so these helpers are intentionally no-ops: slash text stays English always.
 * Panel copy still follows t(userId) + qolStore locale.
 */
function withPtBr(builder, _ptDescription) {
  return builder;
}

function optionPtBr(option, _ptDescription) {
  return option;
}

module.exports = { withPtBr, optionPtBr };

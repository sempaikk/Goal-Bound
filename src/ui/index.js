/**
 * UI layer barrel — preferred path:
 *   const { t, buildNavSelect } = require('../ui');
 */
module.exports = {
  ...require('../utils/i18n.js'),
  ...require('../utils/nav.js'),
  ...require('../utils/statusEmbed.js'),
  ...require('../utils/statusStrip.js'),
  ...require('../utils/format.js'),
  ...require('../utils/slashLocale.js')
};

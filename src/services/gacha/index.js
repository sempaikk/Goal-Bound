/** Gacha domain — banners, rarities, pity. */
module.exports = {
  ...require('./rarities.js'),
  ...require('./pityRoll.js'),
  ...require('./banners.js')
};

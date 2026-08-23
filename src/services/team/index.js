/**
 * Team domain barrel — preferred import path going forward:
 *   require('../services/team')
 *
 * Implementation files still live next to this folder (or under services/)
 * until full physical moves; shims keep old requires working.
 */
module.exports = {
  coachStore: require('../coachStore.js'),
  formations: require('../formations.js'),
  teamQoL: require('../teamQoL.js'),
  FieldRenderer: require('../FieldRenderer.js')
};

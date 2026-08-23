/**
 * Squad preview lines for profile embeds.
 * Adapts to the active shape when possible.
 */
const { getFormationForCoach } = require('../services/formations.js');
const { getCoachId } = require('../services/coachStore.js');

const DEFAULT_LINES = [
  { emoji: '\uD83D\uDDE1\uFE0F', name: 'Attack', slots: ['LW', 'ST', 'RW'] },
  { emoji: '\uD83C\uDFAE', name: 'Midfield', slots: ['LM', 'CM', 'RM'] },
  { emoji: '\uD83D\uDEE1\uFE0F', name: 'Defense', slots: ['LB', 'CB1', 'CB2', 'RB'] },
  { emoji: '\uD83E\uDD45', name: 'Goalkeeper', slots: ['GK'] }
];

const LINES_BY_SHAPE = {
  '4-3-3': DEFAULT_LINES,
  '4-2-3-1': [
    { emoji: '\uD83D\uDDE1\uFE0F', name: 'Attack', slots: ['LW', 'CAM', 'RW', 'ST'] },
    { emoji: '\uD83C\uDFAE', name: 'Midfield', slots: ['CDM1', 'CDM2'] },
    { emoji: '\uD83D\uDEE1\uFE0F', name: 'Defense', slots: ['LB', 'CB1', 'CB2', 'RB'] },
    { emoji: '\uD83E\uDD45', name: 'Goalkeeper', slots: ['GK'] }
  ],
  '4-4-2': [
    { emoji: '\uD83D\uDDE1\uFE0F', name: 'Attack', slots: ['ST1', 'ST2'] },
    { emoji: '\uD83C\uDFAE', name: 'Midfield', slots: ['LM', 'CM1', 'CM2', 'RM'] },
    { emoji: '\uD83D\uDEE1\uFE0F', name: 'Defense', slots: ['LB', 'CB1', 'CB2', 'RB'] },
    { emoji: '\uD83E\uDD45', name: 'Goalkeeper', slots: ['GK'] }
  ],
  '3-5-2': [
    { emoji: '\uD83D\uDDE1\uFE0F', name: 'Attack', slots: ['ST1', 'ST2'] },
    { emoji: '\uD83C\uDFAE', name: 'Midfield', slots: ['LWB', 'CM1', 'CM2', 'CM3', 'RWB'] },
    { emoji: '\uD83D\uDEE1\uFE0F', name: 'Defense', slots: ['CB1', 'CB2', 'CB3'] },
    { emoji: '\uD83E\uDD45', name: 'Goalkeeper', slots: ['GK'] }
  ]
};

function getSquadLines(userId) {
  if (!userId) return DEFAULT_LINES;
  try {
    const coachId = getCoachId(userId);
    const formation = getFormationForCoach(coachId);
    return LINES_BY_SHAPE[formation.id] || DEFAULT_LINES;
  } catch {
    return DEFAULT_LINES;
  }
}

module.exports = {
  DEFAULT_LINES,
  LINES_BY_SHAPE,
  getSquadLines,
  /** @deprecated use getSquadLines(userId) */
  LINES: DEFAULT_LINES
};

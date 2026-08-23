// ============================================================
// Curva de XP - lógica pura de progressão de nível das cartas.
//
// Não depende de banco de dados nem de nada do Discord de propósito -
// é só matemática, testável isolada (ver notas do plano: "passo 1,
// mais fácil/isolado primeiro"). Quem vai USAR isso (o rastreio de
// call/mensagem, o DataService) entra em passos seguintes.
//
// Regra do jogo (decidida na conversa com o dono do bot):
//  - Toda carta nova começa no nível 0 (LEVEL_MIN) e o teto é 100
//    (LEVEL_MAX) - igual já era antes, só que agora começando do zero
//    em vez de travado em 50.
//  - Só as 11 cartas escaladas no /team no momento ganham XP: cada
//    minuto em call = 10 XP pra CADA UMA das 11 (não dividido entre
//    elas), e o mesmo vale a cada 10 mensagens enviadas.
//  - A fórmula de custo por nível foi calibrada pra maxar 1 carta
//    levar ~um mês e meio de dedicação bem ativa (~2h de call por dia)
//    - não trivial, mas alcançável. Números antigos (antes dessa
//    calibragem) davam anos pra maxar, o que não fazia sentido pra um
//    bot de Discord.
// ============================================================

const LEVEL_MIN = 0;
const LEVEL_MAX = 100;

// custo(nível) = floor(BASE * nível^EXP) - quanto XP é preciso ganhar
// pra subir DE (nível-1) PRA nível. Esses dois números são o "dial"
// principal de dificuldade - suba BASE ou EXP pra deixar mais lento,
// abaixe pra deixar mais rápido. Com esses valores: nível 1 custa 4 XP
// (sobe quase na hora), nível 50 custa 531 XP, nível 100 custa 1264 XP,
// e o total acumulado de 0 até 100 é ~56.800 XP (~47 dias de call
// contínua de 2h/dia, a 10 XP/min).
const XP_CURVE_BASE = 4;
const XP_CURVE_EXPONENT = 1.25;

/**
 * Quanto XP é necessário pra subir do nível anterior pro nível
 * informado (o "custo" daquele degrau específico, não acumulado).
 * @param {number} level Nível de destino (1 a 100 - não faz sentido pro nível 0, que é o início)
 * @returns {number}
 */
function xpCostForLevel(level) {
  if (level <= 0) return 0;
  return Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
}

// Tabela pré-calculada (uma vez só, no carregamento do módulo) do XP
// TOTAL acumulado necessário pra alcançar cada nível partindo do zero.
// cumulativeXp[N] = quanto XP total (desde o nível 0) uma carta
// precisa ter acumulado pra estar no nível N.
// Calcular isso uma vez e reaproveitar é bem mais barato do que somar
// em loop toda vez que alguém ganha XP (o que acontece a cada
// minuto de call, pra até 11 cartas de cada jogador ativo).
const cumulativeXp = [0];
for (let level = 1; level <= LEVEL_MAX; level++) {
  cumulativeXp.push(cumulativeXp[level - 1] + xpCostForLevel(level));
}

/** Quanto XP total (acumulado desde o nível 0) uma carta no nível MAX (100) tem. */
const TOTAL_XP_TO_MAX = cumulativeXp[LEVEL_MAX];

/**
 * Quanto XP total (desde o nível 0) é necessário pra uma carta estar
 * EXATAMENTE no nível informado.
 * @param {number} level 0 a 100
 * @returns {number}
 */
function totalXpForLevel(level) {
  const clamped = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(level)));
  return cumulativeXp[clamped];
}

/**
 * Dado um total de XP acumulado (o que fica salvo no banco por
 * carta), calcula em qual nível isso coloca a carta agora, e quanto
 * XP falta pro próximo nível - usado pra desenhar barra de progresso
 * e pra decidir se um "level up" aconteceu depois de ganhar XP.
 *
 * @param {number} totalXp XP acumulado total da carta (nunca negativo)
 * @returns {{
 *   level: number,
 *   totalXp: number,
 *   currentLevelXp: number,
 *   xpIntoCurrentLevel: number,
 *   xpNeededForNextLevel: number,
 *   isMaxLevel: boolean
 * }}
 */
function getProgressForXp(totalXp) {
  const xp = Math.max(0, Math.floor(totalXp));

  // Já no teto - não precisa nem procurar, evita loop desnecessário
  // toda vez que uma carta maxada ganha mais XP (que passa a não
  // fazer nada, só fica "perdido" - decisão consciente, mais simples
  // que guardar excedente pra nunca usar).
  if (xp >= TOTAL_XP_TO_MAX) {
    return {
      level: LEVEL_MAX,
      totalXp: TOTAL_XP_TO_MAX,
      currentLevelXp: cumulativeXp[LEVEL_MAX],
      xpIntoCurrentLevel: 0,
      xpNeededForNextLevel: 0,
      isMaxLevel: true
    };
  }

  // Busca binária na tabela pré-calculada em vez de percorrer nível a
  // nível - com até 11 cartas ganhando XP por jogador ativo a cada
  // minuto de call, isso roda com bastante frequência e vale a pena
  // ser O(log n) em vez de O(n).
  let low = LEVEL_MIN;
  let high = LEVEL_MAX;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (cumulativeXp[mid] <= xp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const level = low;
  const xpIntoCurrentLevel = xp - cumulativeXp[level];
  const xpNeededForNextLevel = cumulativeXp[level + 1] - cumulativeXp[level];

  return {
    level,
    totalXp: xp,
    currentLevelXp: cumulativeXp[level],
    xpIntoCurrentLevel,
    xpNeededForNextLevel,
    isMaxLevel: false
  };
}

/**
 * Aplica um ganho de XP a um total já existente e informa se isso
 * cruzou uma (ou mais) fronteira de nível - é o que o rastreio de
 * call/mensagem (passos futuros) vai chamar depois de somar XP no
 * banco, pra saber se deve avisar o jogador de um level up.
 *
 * @param {number} previousTotalXp XP total ANTES do ganho
 * @param {number} xpGained Quanto XP foi ganho agora (sempre positivo)
 * @returns {{
 *   newTotalXp: number,
 *   previousLevel: number,
 *   newLevel: number,
 *   leveledUp: boolean,
 *   levelsGained: number
 * }}
 */
function applyXpGain(previousTotalXp, xpGained) {
  const before = getProgressForXp(previousTotalXp);
  const newTotalXp = Math.min(TOTAL_XP_TO_MAX, Math.max(0, previousTotalXp) + Math.max(0, xpGained));
  const after = getProgressForXp(newTotalXp);

  return {
    newTotalXp,
    previousLevel: before.level,
    newLevel: after.level,
    leveledUp: after.level > before.level,
    levelsGained: after.level - before.level
  };
}

module.exports = {
  LEVEL_MIN,
  LEVEL_MAX,
  XP_CURVE_BASE,
  XP_CURVE_EXPONENT,
  TOTAL_XP_TO_MAX,
  xpCostForLevel,
  totalXpForLevel,
  getProgressForXp,
  applyXpGain
};

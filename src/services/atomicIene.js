/**
 * Atomic Iene debit — single connection via DataService.
 * UPDATE … WHERE iene >= cost so parallel spends cannot both succeed.
 */
const DataService = require('./DataService.js');

function getBalance(userId) {
  return DataService.getIene(userId);
}

/**
 * @param {string} userId
 * @param {number} amount positive amount to spend
 * @returns {{ ok: boolean, balance: number }}
 */
function trySpendIene(userId, amount) {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  if (cost === 0) {
    return { ok: true, balance: DataService.getIene(userId) };
  }
  return DataService.trySpendIene(userId, cost);
}

function refundIene(userId, amount) {
  const add = Math.max(0, Math.round(Number(amount) || 0));
  if (add === 0) return DataService.getIene(userId);
  return DataService.addIene(userId, add);
}

module.exports = { trySpendIene, refundIene, getBalance };

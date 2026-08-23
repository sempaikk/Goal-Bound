const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  SUCCESS: '✅',
  WARN: '⚠️',
  ERROR: '❌'
};

// Ordem de prioridade dos níveis, do menos ao mais importante.
const LEVEL_PRIORITY = { DEBUG: 0, INFO: 1, SUCCESS: 1, WARN: 2, ERROR: 3 };

// Nível mínimo que será realmente impresso. Por padrão mostra tudo
// (igual ao comportamento original), mas dá pra deixar mais silencioso
// em produção definindo LOG_LEVEL no .env (ex: LOG_LEVEL=WARN pra
// mostrar só avisos e erros - útil se o bot estiver com uso pesado e
// você quiser reduzir a quantidade de escrita no console/nos logs do PM2).
const MIN_LEVEL = LEVEL_PRIORITY[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVEL_PRIORITY.DEBUG;

class Logger {
  log(level, message, data = '') {
    if ((LEVEL_PRIORITY[level] ?? 0) < MIN_LEVEL) return;

    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const icon = LOG_LEVELS[level] || '•';
    const msg = data ? `${icon} [${timestamp}] ${message} ${data}` : `${icon} [${timestamp}] ${message}`;
    
    console.log(msg);
  }

  debug(msg, data) { this.log('DEBUG', msg, data); }
  info(msg, data) { this.log('INFO', msg, data); }
  success(msg, data) { this.log('SUCCESS', msg, data); }
  warn(msg, data) { this.log('WARN', msg, data); }
  error(msg, data) { this.log('ERROR', msg, data); }
}

module.exports = new Logger();

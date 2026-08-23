const { EmbedBuilder } = require('discord.js');
const config = require('../config/config.js');
const logger = require('../logger/logger.js');
const { brandFooter } = require('./format.js');

/**
 * Monta um embed de "status" (erro, aviso, etc) com cor e marca
 * consistentes, em vez de cada comando escrever
 * `new EmbedBuilder().setColor(...)` na mão toda vez.
 *
 * Significado de cada cor, pra manter consistência em todo o bot:
 *   ERROR   (vermelho) - algo deu errado de verdade (exceção, falha)
 *   WARNING (laranja)  - precisa de atenção, mas não é uma falha
 *                         (cooldown, ação bloqueada, aviso de estado)
 *   SUCCESS (verde)    - confirmação de algo que deu certo/completo
 *   PRIMARY (rosa)     - informação neutra, sem conotação boa/ruim
 *
 * Sempre com timestamp + footer da marca - assim toda resposta de
 * status parece parte do mesmo produto.
 *
 * IMPORTANTE: esta função é chamada de dentro de blocos catch em todo
 * o bot. Se ela mesma lançasse exceção com um "type" inválido, o catch
 * que estava tentando reportar o erro original quebraria também.
 * Por isso NUNCA lança erro: type desconhecido cai em ERROR.
 * @param {'ERROR'|'WARNING'|'SUCCESS'|'PRIMARY'} type
 * @param {string} title
 * @param {string} [description]
 * @returns {EmbedBuilder}
 */
function buildStatusEmbed(type, title, description) {
  let color = config.COLORS[type];
  if (!color) {
    logger.warn(`buildStatusEmbed: type inválido "${type}", usando ERROR como fallback`);
    color = config.COLORS.ERROR;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(String(title || 'Something happened').slice(0, 256))
    .setFooter({ text: brandFooter() })
    .setTimestamp();

  if (description) embed.setDescription(String(description).slice(0, 4096));

  return embed;
}

module.exports = { buildStatusEmbed };

const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../logger/logger.js');

function walkCommandFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkCommandFiles(full, list);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      list.push(full);
    }
  }
  return list;
}

class CommandLoader {
  /**
   * When `slash/` or `context/` exist, only those folders are loaded
   * (canonical layout). Root `commands/*.js` stay as implementation files
   * required by the thin re-exports — they are NOT registered twice.
   */
  loadCommands(commandsPath) {
    const commands = new Collection();
    const slashDir = path.join(commandsPath, 'slash');
    const contextDir = path.join(commandsPath, 'context');
    const useLayout = fs.existsSync(slashDir) || fs.existsSync(contextDir);

    let files = [];
    if (useLayout) {
      if (fs.existsSync(slashDir)) walkCommandFiles(slashDir, files);
      if (fs.existsSync(contextDir)) walkCommandFiles(contextDir, files);
      logger.info(`Loading commands from slash/ + context/ (${files.length} file(s))…`);
    } else {
      files = walkCommandFiles(commandsPath);
      logger.info(`Loading commands from ${commandsPath} (${files.length} file(s))…`);
    }

    files.forEach(filePath => {
      const rel = path.relative(commandsPath, filePath);

      let command;
      try {
        try {
          delete require.cache[require.resolve(filePath)];
        } catch { /* ignore */ }
        command = require(filePath);
      } catch (error) {
        logger.error(`Failed to load command file: ${rel}`, error.message);
        return;
      }

      if (!command.data || !command.execute) {
        logger.warn(`Invalid command: ${rel} — missing data or execute`);
        return;
      }

      const name = command.data.name;
      if (commands.has(name)) {
        logger.warn(`Duplicate command name "${name}" from ${rel} — keeping first`);
        return;
      }

      commands.set(name, command);
      const isSlash = !command.data.type;
      logger.success(`Command loaded: ${isSlash ? '/' : ''}${name} (${rel})`);
    });

    logger.success(`${commands.size} command(s) loaded successfully`);
    return commands;
  }
}

module.exports = new CommandLoader();

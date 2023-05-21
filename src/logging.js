class DummyLogger {
  log(...args) {}
  debug(...args) {}
  info(...args) {}
  warn(...args) {}
  error(...args) {}
}

class PrefixedLogger {
  constructor(logger, prefix) {
    this.logger = logger;
    this.prefix = prefix;
  }

  log(message, ...args) {
    this.logger.log(`${this.prefix}${message}`, ...args);
  }

  debug(message, ...args) {
    this.logger.debug(`${this.prefix}${message}`, ...args);
  }

  info(message, ...args) {
    this.logger.info(`${this.prefix}${message}`, ...args);
  }

  warn(message, ...args) {
    this.logger.warn(`${this.prefix}${message}`, ...args);
  }

  error(message, ...args) {
    this.logger.error(`${this.prefix}${message}`, ...args);
  }
}

export { DummyLogger, PrefixedLogger };

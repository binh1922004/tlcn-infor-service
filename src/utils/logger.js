import winston from 'winston';

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  const tag = level.toUpperCase();
  return `${timestamp} [${tag}] ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY/MM/DD HH:mm:ss.SSSSSS' }),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Convenience shorthands
export const log = (...args) => logger.info(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
export const logError = (...args) => logger.error(args.map(a => (a instanceof Error ? a.stack : typeof a === 'object' ? JSON.stringify(a) : a)).join(' '));
export const logWarn = (...args) => logger.warn(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
export const logDebug = (...args) => logger.debug(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));

export default logger;

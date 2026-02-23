/**
 * Structured Logger for ArchibaldTitan Server
 * 
 * Provides levelled logging with timestamps, module tags, and JSON output
 * in production. Respects LOG_LEVEL environment variable.
 * 
 * Levels: debug < info < warn < error < silent
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const LEVEL_COLORS: Record<string, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

const currentLevel = (): LogLevel => {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVEL_ORDER[env] !== undefined ? env : 'info';
};

const isProd = () => process.env.NODE_ENV === 'production';

function formatMessage(level: string, module: string, message: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  if (isProd()) {
    // JSON structured logging for production (Cloud Run, Railway, etc.)
    return JSON.stringify({ ts, level, module, msg: message, ...data });
  }
  // Human-readable for development
  const color = LEVEL_COLORS[level] || '';
  const tag = module ? `[${module}]` : '';
  const extra = data ? ` ${JSON.stringify(data)}` : '';
  return `${color}${ts} ${level.toUpperCase().padEnd(5)}${RESET} ${tag} ${message}${extra}`;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

/**
 * Create a scoped logger for a specific module.
 * 
 * Usage:
 *   const log = createLogger('ChatRouter');
 *   log.info('Stream started', { conversationId: 42 });
 *   log.error('Failed to process', { error: err.message });
 */
export function createLogger(module: string) {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) console.log(formatMessage('debug', module, message, data));
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) console.log(formatMessage('info', module, message, data));
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) console.warn(formatMessage('warn', module, message, data));
    },
    error(message: string, data?: Record<string, unknown>) {
      if (shouldLog('error')) console.error(formatMessage('error', module, message, data));
    },
  };
}

/** Default logger for quick use */
export const log = createLogger('Titan');

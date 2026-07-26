import pino from 'pino'

/**
 * Pino-based structured logger for server-side agent and API flows.
 * Uses pino-pretty in development for human-readable output with timestamps and module tags.
 * In production outputs newline-delimited JSON.
 */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '[{module}] {msg}',
        },
      }
    : undefined,
})

/**
 * Returns a child logger scoped to a specific module.
 * All call sites use logger.info/warn/error/debug(module, message, data?).
 * @param module - The module name tag to include in every log line.
 */
function childFor(module: string) {
  return baseLogger.child({ module })
}

export const logger = {
  info:  (module: string, message: string, data?: unknown) => childFor(module).info(data ?? {}, message),
  debug: (module: string, message: string, data?: unknown) => childFor(module).debug(data ?? {}, message),
  warn:  (module: string, message: string, data?: unknown) => childFor(module).warn(data ?? {}, message),
  error: (module: string, message: string, data?: unknown) => childFor(module).error(data ?? {}, message),
}

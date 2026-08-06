/**
 * Universal logger for server-side agent and API flows.
 * Uses pino in Node environments (dev with pino-pretty), and falls back to a
 * console-based logger on runtimes where Node streams are unavailable (Cloudflare Workers).
 */
const isWorker =
  typeof (globalThis as any).caches !== 'undefined' && typeof (globalThis as any).Cloudflare !== 'undefined'

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function fmt(module: string, message: string, data?: unknown): string {
  const meta = data ? ` ${JSON.stringify(data)}` : ''
  return `[${timestamp()}] [${module}] ${message}${meta}`
}

const consoleImpl = {
  info: (module: string, message: string, data?: unknown) => console.log(fmt(module, message, data)),
  debug: (module: string, message: string, data?: unknown) => console.debug(fmt(module, message, data)),
  warn: (module: string, message: string, data?: unknown) => console.warn(fmt(module, message, data)),
  error: (module: string, message: string, data?: unknown) => console.error(fmt(module, message, data)),
}

let pinoImpl: typeof consoleImpl | null = null

async function initPino() {
  if (pinoImpl) return
  const pino = (await import('pino')).default
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
  const childFor = (module: string) => baseLogger.child({ module })
  pinoImpl = {
    info: (module, message, data) => childFor(module).info(data ?? {}, message),
    debug: (module, message, data) => childFor(module).debug(data ?? {}, message),
    warn: (module, message, data) => childFor(module).warn(data ?? {}, message),
    error: (module, message, data) => childFor(module).error(data ?? {}, message),
  }
}

export const logger: {
  info: (module: string, message: string, data?: unknown) => void
  debug: (module: string, message: string, data?: unknown) => void
  warn: (module: string, message: string, data?: unknown) => void
  error: (module: string, message: string, data?: unknown) => void
} = new Proxy(consoleImpl, {
  get(_target, prop: string) {
    if (isWorker) {
      return consoleImpl[prop as keyof typeof consoleImpl]
    }
    void initPino()
    return (...args: unknown[]) => {
      const impl = pinoImpl ?? consoleImpl
      return (impl as any)[prop](...args)
    }
  },
})

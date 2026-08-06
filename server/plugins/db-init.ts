import { initDatabase } from '~~/server/db'

/**
 * Global middleware: initializes the database (D1 on Workers, better-sqlite3
 * locally) before any request is handled. This avoids relying on plugin timing
 * differences across runtimes.
 */
export default defineNitroPlugin(async () => {
  await initDatabase()
})

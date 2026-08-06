import { initDatabase } from '~~/server/db'

/**
 * Global middleware: guarantees the database (D1 on Workers, better-sqlite3
 * locally) is initialized before any handler runs.
 */
export default defineEventHandler(async () => {
  await initDatabase()
})

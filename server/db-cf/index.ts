import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

// Nitro cloudflare_module sets `globalThis.__env__ = env` in the fetch handler
// BEFORE middleware/handlers run. Drizzle's D1 client is created synchronously,
// so we can expose `db` as a Proxy that resolves to the real client on access.

let client: any = null
let rawDb: any = null

function getSyncClient(): any {
  if (client) return client
  const env = (globalThis as any).__env__ as Record<string, unknown> | undefined
  const d1 = env?.DB as any
  if (!d1) {
    throw new Error('D1 binding "DB" not found. Ensure wrangler.toml binds it.')
  }
  client = drizzle(d1, { schema })
  rawDb = null
  return client
}

export async function initDatabase() {
  return getSyncClient()
}

export async function getDb() {
  return getSyncClient()
}

export function isCf() {
  return true
}

// Proxy: `db.select()`, `db.query.x.y()`, `db.insert()`, etc. all delegate to the
// real client which is created lazily on first access (after __env__ is set).
export const db: any = new Proxy({}, {
  get(_target, prop: string | symbol) {
    const real = getSyncClient()
    const value = real[prop as any]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export const rawDbProxy: any = new Proxy({}, {
  get() {
    return rawDb
  },
})

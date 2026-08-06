import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const dataDir = path.resolve(process.cwd(), '.data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sqlite = new Database(path.join(dataDir, 'hackathon.db'))
sqlite.pragma('journal_mode = WAL')

sqlite.exec(`
CREATE TABLE IF NOT EXISTS rocks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rock_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  FOREIGN KEY (rock_id) REFERENCES rocks(id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  owner TEXT NOT NULL,
  deadline TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  rock_id TEXT NOT NULL,
  sprint_id TEXT NOT NULL,
  monto TEXT NOT NULL DEFAULT '0',
  tipo TEXT NOT NULL DEFAULT 'gasto',
  created_at TEXT NOT NULL,
  FOREIGN KEY (rock_id) REFERENCES rocks(id),
  FOREIGN KEY (sprint_id) REFERENCES sprints(id)
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rock_id TEXT,
  temp_id TEXT
);
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);
CREATE TABLE IF NOT EXISTS cuotas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  frecuencia TEXT NOT NULL,
  monto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  ultimo_pago TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
`)

// Safely adds columns for existing databases where the table was created earlier.
function safeAlter(sql: string) {
  try {
    sqlite.exec(sql)
  } catch {
    // Column already exists; safe to ignore.
  }
}

safeAlter('ALTER TABLE documents ADD COLUMN rock_id TEXT')
safeAlter('ALTER TABLE documents ADD COLUMN temp_id TEXT')
safeAlter("ALTER TABLE sprints ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'")
safeAlter("ALTER TABLE tasks ADD COLUMN monto TEXT NOT NULL DEFAULT '0'")
safeAlter("ALTER TABLE tasks ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto'")

export const db = drizzle(sqlite, { schema })
export const rawDb = sqlite

export async function initDatabase() {
  return db
}

export function isCf() {
  return false
}

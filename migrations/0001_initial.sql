-- Migration: initial schema for control-finanzas
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
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL
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
  embedding TEXT NOT NULL
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

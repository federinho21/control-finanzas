import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const rocks = sqliteTable('rocks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  deadline: text('deadline').notNull(),
  status: text('status').notNull().$type<'active' | 'completed' | 'blocked'>(),
  createdAt: text('created_at').notNull()
})

export const sprints = sqliteTable('sprints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  rockId: text('rock_id').notNull(),
  status: text('status').notNull().$type<'planned' | 'in_progress' | 'completed' | 'on_hold'>(),
  createdAt: text('created_at').notNull()
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  owner: text('owner').notNull(),
  deadline: text('deadline').notNull(),
  priority: text('priority').notNull().$type<'high' | 'medium' | 'low'>(),
  status: text('status').notNull().$type<'pending' | 'in_progress' | 'completed' | 'on_hold'>(),
  rockId: text('rock_id').notNull(),
  sprintId: text('sprint_id').notNull(),
  createdAt: text('created_at').notNull()
})

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
  rockId: text('rock_id'), // Linked after plan approval; null while provisional
  tempId: text('temp_id') // Client-generated UUID for provisional documents
})

export const documentChunks = sqliteTable('document_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: text('embedding').notNull()
})

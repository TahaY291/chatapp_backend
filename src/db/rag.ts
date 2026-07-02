import {
    uuid, text, integer, timestamp,
    pgTable, pgEnum, index, vector
} from "drizzle-orm/pg-core";
import { users } from "./schema";
import { customType } from "drizzle-orm/pg-core";

export const fileStatusEnum = pgEnum("file_status_enum", [
    'processing',
    'ready',
    'failed'
])

const tsvector = customType<{data: string}>({
    dataType(){
        return 'tsvector'
    }
})

export const userFiles = pgTable('user_files', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileUrl: text('file_url').notNull(),
    originalName: text('original_name').notNull(),
    fileSize: integer('file_size'),
    status: fileStatusEnum('status').default('processing'),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
}, (table) => [
    index('idx_user_files_user').on(table.userId),
    index('idx_user_files_status').on(table.status),
])

export const fileChunks = pgTable('file_chunks', {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id').notNull().references(() => userFiles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 768 }), // match your embedding model
    chunkIndex: integer('chunk_index').notNull(),
    contentSearch : tsvector('content_search'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_file_chunks_file').on(table.fileId),
    index('idx_file_chunks_user').on(table.userId),
])

export const fileConversations = pgTable('file_conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull().references(() => userFiles.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_chat_llm_user').on(table.userId),
    index('idx_chat_llm_file').on(table.fileId),
])
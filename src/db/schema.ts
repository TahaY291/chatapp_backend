import { AnyPgColumn } from "drizzle-orm/pg-core";
import {
    pgEnum, uuid, text, boolean, timestamp, primaryKey,
    pgTable, index, uniqueIndex
} from "drizzle-orm/pg-core";

export const conversationTypeEnum = pgEnum("conversation_type_enum", ["direct", "group"])
export const participantRoleEnum = pgEnum("participant_role_enum", ["admin", "member"])
export const messageTypeEnum = pgEnum("message_type_enum", ['text', 'image', 'video', 'audio', 'file', 'system'])
export const messageStatusEnum = pgEnum("message_status_enum", ['sent', 'delivered', 'read'])

export const users = pgTable('users', {
    id: uuid("id").primaryKey().defaultRandom(), 
    username: text('username').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    about: text('about').default('Hey, I am chatting'),
    isOnline: boolean("is_online").default(false),
    lastSeen: timestamp("last_seen"),

    isVerified: boolean("is_verified").default(false),
    verifyOTP: text("verify_otp"),
    verifyOTPExpiry: timestamp("verify_otp_expiry"),

    resetOTP: text("reset_otp"),
    resetOTPExpiry: timestamp("reset_otp_expiry"),

    createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
    index("idx_users_username").on(table.username),
    index("idx_users_is_online").on(table.isOnline),
    index("idx_users_email").on(table.email),
])
export const contacts = pgTable('contacts', {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid('contact_id').notNull().references(() => users.id, { onDelete: "cascade" }),
    nickname: text('nickname'),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index("idx_contacts_owner").on(table.ownerId),
    uniqueIndex('idx_contacts_unique').on(table.ownerId, table.contactId)
])

export const conversation = pgTable('conversation', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: conversationTypeEnum('type').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    description: text('description'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
    index("idx_conversations_type").on(table.type),
    index("idx_conversations_created_by").on(table.createdBy),
    index("idx_conversations_updated_at").on(table.updatedAt)
])

export const conversationParticipants = pgTable('conversation_participants', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => conversation.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: "cascade" }),
    role: participantRoleEnum('role').default('member'),
    joinedAt: timestamp('joined_at').defaultNow(),
    leftAt: timestamp('left_at'),
    isMuted: boolean('is_muted').default(false)
}, (table) => [
    index("idx_participants_coversation").on(table.conversationId),
    index("idx_participants_user").on(table.userId),
    uniqueIndex("idx_participants_unique").on(table.conversationId, table.userId),
    index("idx_participants_active").on(table.leftAt)
])

export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => conversation.id, { onDelete: "cascade" }),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    type: messageTypeEnum('type').default('text'),
    content: text('content'),
    mediaUrl: text('media_url'),
    replyToId: uuid("reply_to_id").references((): AnyPgColumn => messages.id),
    isDeleted: boolean("is_deleted").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_sender").on(table.senderId),
    index("idx_messages_created_at").on(table.createdAt),
    uniqueIndex("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
    index("idx_message_reply").on(table.replyToId)
])

export const messageStatus = pgTable('message_status', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: "cascade" }),
    status: messageStatusEnum('status').default('sent'),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
    index("idx_message_status_message").on(table.messageId),
    index("idx_message_status_user").on(table.userId),
    uniqueIndex("idx_message_status_unique").on(table.messageId, table.userId),
    index("idx_message_status_status").on(table.status)
])

export const blockedUsers = pgTable('blocked_users', {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index("idx_blocked_blocker").on(table.blockerId),
    uniqueIndex("idx_blocked_unique").on(table.blockerId, table.blockedId),
])

export const refreshTokens = pgTable('refresh_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
    index('idx_refresh_tokens_user').on(table.userId),
    index('idx_refresh_tokens_token').on(table.token)
])
import { and, eq, or, count, desc, ne, inArray } from "drizzle-orm";
import { db } from "../db";
import { blockedUsers, contacts, conversation, conversationParticipants, messages, messageStatus, users } from "../db/schema";
import { asyncHandler } from "../lib/asyncHandler";
import { Request, Response } from "express";
import { ApiError } from "../lib/ApiError";
import { ApiResponse } from "../lib/ApiResponse";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { io, onlineUsers } from "../index";
import { alias } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm";

export const insertMessage = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, content, replyToId } = req.body
    const senderId = req.user!.id

    if (!conversationId) throw new ApiError(400, "Conversation ID is required")
    // if (!content || !req.file) throw new ApiError(400, "Message content or file is required")

    const [participantsArr, repliedMessageArr] = await Promise.all([
        db.select({ userId: conversationParticipants.userId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.conversationId, conversationId)),

        replyToId
            ? db.select({ id: messages.id })
                .from(messages)
                .where(and(
                    eq(messages.id, replyToId),
                    eq(messages.conversationId, conversationId)
                ))
            : Promise.resolve([])
    ])
    if (participantsArr.length === 0) throw new ApiError(404, "Conversation not found")

    const isMember = participantsArr.some(p => p.userId === senderId)
    if (!isMember) throw new ApiError(403, "You are not a member of this conversation")

    const receiver = participantsArr.find(p => p.userId !== senderId)
    if (!receiver) throw new ApiError(404, "Receiver not found")

    if (replyToId && !repliedMessageArr[0]) {
        throw new ApiError(404, "Replied message not found in this conversation")
    }

    let messageType: "text" | "image" | "video" | "audio" | "file" = "text"

    if (req.file) {
        if (req.file.mimetype.startsWith("image/"))      messageType = "image"
        else if (req.file.mimetype.startsWith("video/")) messageType = "video"
        else if (req.file.mimetype.startsWith("audio/")) messageType = "audio"
        else                                              messageType = "file"
    }

    const [newMessage] = await db
        .insert(messages)
        .values({
            conversationId,
            senderId,
            content:    content    || null,
            mediaUrl:   req.file   ? "uploading" : null,
            type:       messageType,
            replyToId:  replyToId  || null,
        })
        .returning()

    const receiverSocketId = onlineUsers.get(receiver.userId)
    if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive-message", newMessage)
    }    res.status(201).json(new ApiResponse(201, newMessage, "Message sent successfully"))

    Promise.all([
        db.insert(messageStatus).values({
            messageId: newMessage.id,
            userId:    receiver.userId,
            status:    "sent",
        }),
        db.update(conversation)
            .set({ updatedAt: new Date() })
            .where(eq(conversation.id, conversationId))
    ]).catch(err => console.error("Post-response DB ops failed:", err))

    if (req.file) {
        const fileBuffer = req.file.buffer

        uploadOnCloudinary(fileBuffer, "messages")
            .then(async (result) => {
                if (!result) {
                    console.error("Cloudinary upload returned null")
                    return
                }

                const [updatedMessage] = await db
                    .update(messages)
                    .set({ mediaUrl: result.secure_url })
                    .where(eq(messages.id, newMessage.id))
                    .returning()

                const senderSocketId = onlineUsers.get(senderId)

                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("message-updated", updatedMessage)
                }
                if (senderSocketId) {
                    io.to(senderSocketId).emit("message-updated", updatedMessage)
                }
            })
            .catch(err => console.error("Cloudinary upload failed:", err))
    }
})

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params.conversationId as string
    const senderId = req.user!.id

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;


    const participant = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, senderId)
            )
        )

    if (!participant[0]) {
        throw new ApiError(403, "You are not a participant of this conversation")
    }

    const otherParticipantArr = await db.select().from(conversationParticipants).where(and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, senderId)
    ))
    const otherParticipantId = otherParticipantArr[0].userId

    const isBlockedArr = await db.select().from(blockedUsers).where(
        or(
            and(
                eq(blockedUsers.blockerId, senderId),
                eq(blockedUsers.blockedId, otherParticipantId)
            ),
            and(
                eq(blockedUsers.blockerId, otherParticipantId),
                eq(blockedUsers.blockedId, senderId)
            ),
        )
    )
    const isBlocked = isBlockedArr[0]



    const conversationMessages = await db
        .select({
            id: messages.id,
            content: messages.content,
            mediaUrl: messages.mediaUrl,
            type: messages.type,
            isDeleted: messages.isDeleted,
            replyToId: messages.replyToId,
            createdAt: messages.createdAt,
            senderId: messages.senderId,

            senderUsername: users.username,
            senderAvatar: users.avatarUrl,
            nickname: contacts.nickname,
        })
        .from(messages)
        .innerJoin(
            users,
            eq(messages.senderId, users.id)
        )
        .leftJoin(contacts,
            and(
                eq(contacts.ownerId, senderId),
                eq(contacts.contactId, users.id)
            )
        )
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt)  // oldest first like WhatsApp
        .limit(limit)
        .offset(offset)


    // get total count for frontend to know total pages
    const totalMessages = await db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))


    const total = totalMessages[0].count
    const totalPages = Math.ceil(Number(total) / limit)

    return res.status(200).json(
        new ApiResponse(200, {
            messages: conversationMessages,
            isBlocked: isBlocked ? true : false,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        }, "Messages fetched successfully")
    )

})


export const getConversations = asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = req.user!.id

    const myParticipation = alias(conversationParticipants, "my_participation")
    const otherParticipation = alias(conversationParticipants, "other_participation")

   // step 1 — max createdAt per conversation
const latestPerConversation = db
    .select({
        conversationId: messages.conversationId,
        maxCreatedAt: sql<Date>`MAX(${messages.createdAt})`.as("max_created_at")
    })
    .from(messages)
    .groupBy(messages.conversationId)
    .as("latest_per_conversation")

// step 2 — join back to get the full message row
const lastMessageSubquery = db
    .select({
        conversationId: messages.conversationId,
        content: messages.content,
        type: messages.type,
        createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(
        latestPerConversation,
        and(
            eq(messages.conversationId, latestPerConversation.conversationId),
            eq(messages.createdAt, latestPerConversation.maxCreatedAt)
        )
    )
    .as("last_message")

    const unreadCountSubquery = db
        .select({
            conversationId: messages.conversationId,
            unreadCount: sql<number>`COUNT(*)`.as("unread_count"),
        })
        .from(messages)
        .innerJoin(
            messageStatus,
            and(
                eq(messageStatus.messageId, messages.id),
                eq(messageStatus.userId, currentUserId),
            )
        )
        .where(
            and(
                ne(messages.senderId, currentUserId),
                ne(messageStatus.status, "read")
            )
        )
        .groupBy(messages.conversationId)
        .as("unread_count")

    // ── main query ────────────────────────────────────────────────
    const conversations = await db
        .select({
            conversationId: conversation.id,
            updatedAt: conversation.updatedAt,
            type: conversation.type,

            otherUserId: users.id,
            otherUsername: users.username,
            otherAvatarUrl: users.avatarUrl,
            otherIsOnline: users.isOnline,

            // ✅ how current user saved the other person
            nickname: contacts.nickname,

            lastMessage: lastMessageSubquery.content,
            lastMessageType: lastMessageSubquery.type,
            lastMessageAt: lastMessageSubquery.createdAt,
            unreadCount: sql<number>`COALESCE(${unreadCountSubquery.unreadCount}, 0)`,
        })
        .from(myParticipation)
        .innerJoin(conversation, eq(myParticipation.conversationId, conversation.id))
        .innerJoin(
            otherParticipation,
            and(
                eq(otherParticipation.conversationId, conversation.id),
                ne(otherParticipation.userId, currentUserId)
            )
        )
        .innerJoin(users, eq(users.id, otherParticipation.userId))
        .leftJoin(
            contacts,
            and(
                eq(contacts.ownerId, currentUserId),
                eq(contacts.contactId, users.id)
            )
        )
        .leftJoin(lastMessageSubquery, eq(lastMessageSubquery.conversationId, conversation.id))
        .leftJoin(unreadCountSubquery, eq(unreadCountSubquery.conversationId, conversation.id))
        .where(eq(myParticipation.userId, currentUserId))
        .orderBy(desc(conversation.updatedAt))


    return res.status(200).json(
        new ApiResponse(200, conversations, "Conversations fetched successfully")
    )
})
export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = req.user!.id
    const messageId = req.params.messageId as string

    // find message
    const messageArr = await db.select().from(messages).where(eq(messages.id, messageId))
    const message = messageArr[0]

    if (!message) {
        throw new ApiError(404, "Message not found")
    }

    // only sender can delete their own message
    if (message.senderId !== currentUserId) {
        throw new ApiError(403, "You can only delete your own messages")
    }

    // soft delete — just mark as deleted, don't remove from DB
    await db.update(messages)
        .set({ isDeleted: true })
        .where(eq(messages.id, messageId))

    // emit socket event so receiver sees "This message was deleted" instantly
    const conversationParticipantsArr = await db
        .select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, message.conversationId))

    conversationParticipantsArr.forEach((participant) => {
        if (participant.userId !== currentUserId) {
            const receiverSocketId = onlineUsers.get(participant.userId)
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("message:deleted", { messageId })
            }
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Message deleted successfully")
    )
})

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const currentUserId = req.user!.id
    const { conversationId } = req.params as { conversationId: string }

    const unreadMessages = await db
        .select({ messageId: messageStatus.messageId })
        .from(messageStatus)
        .innerJoin(messages, eq(messages.id, messageStatus.messageId))
        .where(
            and(
                eq(messages.conversationId, conversationId),
                eq(messageStatus.userId, currentUserId),
                ne(messageStatus.status, "read")
            )
        )

    if (unreadMessages.length === 0) {
        return res.status(200).json(
            new ApiResponse(200, null, "No unread messages")
        )
    }

    // update all to read
    const unreadMessageIds = unreadMessages.map((m) => m.messageId)

    await db.update(messageStatus)
        .set({
            status: "read",
            updatedAt: new Date()
        })
        .where(
            and(
                inArray(messageStatus.messageId, unreadMessageIds),
                eq(messageStatus.userId, currentUserId)
            )
        )

    // emit to sender that their messages were read (double blue tick)
    const conversationParticipantsArr = await db
        .select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId))

    conversationParticipantsArr.forEach((participant) => {
        if (participant.userId !== currentUserId) {
            const senderSocketId = onlineUsers.get(participant.userId)
            if (senderSocketId) {
                io.to(senderSocketId).emit("message:read", {
                    conversationId,
                    readBy: currentUserId,
                    messageIds: unreadMessageIds
                })
            }
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Messages marked as read")
    )
})
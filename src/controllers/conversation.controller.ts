import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { db } from "../db";
import { conversation, conversationParticipants, users } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiResponse } from "../lib/ApiResponse";
import { ApiError } from "../lib/ApiError";
import { redisClient } from "../lib/redis";
import { alias } from "drizzle-orm/pg-core";

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id
    const { participantId } = req.body

    if (!participantId) {
        throw new ApiError(400, "Participant ID is required")
    }

    if (participantId === userId) {
        throw new ApiError(400, "You cannot start a conversation with yourself")
    }


    const myParticipation = alias(conversationParticipants, "my_participation")
    const otherParticipation = alias(conversationParticipants, "other_participation")

    const existingConversationArr = await db
        .select({ id: conversation.id })
        .from(conversation)
        .innerJoin(
            myParticipation,
            and(
                eq(myParticipation.conversationId, conversation.id),
                eq(myParticipation.userId, userId)
            )
        )
        .innerJoin(otherParticipation,
            and(
                eq(otherParticipation.conversationId, conversation.id),
                eq(otherParticipation.userId, participantId)
            )
        )
        .where(
            eq(conversation.type, "direct")
        )
        .limit(1)

        const existingConversation = existingConversationArr[0]

    const otherUserArr = await db.select().from(users).where(
        eq(users.id, participantId)
    )

    if (!otherUserArr[0]) {
        throw new ApiError(404, "User not found")
    }

    if (existingConversation) {
        return res.status(200).json(
            new ApiResponse(200, {
                conversationId: existingConversation.id,
                otherUsername: otherUserArr[0].username,
                otherAvatarUrl: otherUserArr[0].avatarUrl ?? null,
                nickname: null,
                lastMessage: "",
                lastMessageAt: new Date().toISOString(),
                unreadCount: 0,
                otherIsOnline: false,
            }, "Conversation already exists")
        )
    }

    const [newConversation] = await db
        .insert(conversation)
        .values({
            type: "direct",
            createdBy: userId
        })
        .returning()

    await db.insert(conversationParticipants).values([
        { conversationId: newConversation.id, userId: userId },
        { conversationId: newConversation.id, userId: participantId },
    ])

    await redisClient.del(`conversations:${userId}`);
    await redisClient.del(`conversations:${participantId}`);

    return res.status(201).json(
        new ApiResponse(201, {
            conversationId: newConversation.id,
            otherUsername: otherUserArr[0].username,
            otherAvatarUrl: otherUserArr[0].avatarUrl ?? null,
            nickname: null,
            lastMessage: "",
            lastMessageAt: newConversation.createdAt?.toISOString?.() ?? new Date().toISOString(),
            unreadCount: 0,
            otherIsOnline: false,
        }, "Conversation created successfully")
    )
})
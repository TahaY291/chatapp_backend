import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { db } from "../db";
import { conversation, conversationParticipants } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiResponse } from "../lib/ApiResponse";
import { ApiError } from "../lib/ApiError";

export const createConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id
    const { participantId } = req.body

    if (!participantId) {
        throw new ApiError(400, "Participant ID is required")
    }

    if (participantId === userId) {
        throw new ApiError(400, "You cannot start a conversation with yourself")
    }

    // check if direct conversation already exists between these two users
    const existingConversation = await db
        .select({ id: conversation.id })
        .from(conversation)
        .innerJoin(
            conversationParticipants,
            eq(conversationParticipants.conversationId, conversation.id)
        )
        .where(
            and(
                eq(conversation.type, "direct"),
                eq(conversationParticipants.userId, userId)
            )
        )
        .then(rows => {
            return rows.find(async (row) => {
                const other = await db
                    .select()
                    .from(conversationParticipants)
                    .where(
                        and(
                            eq(conversationParticipants.conversationId, row.id),
                            eq(conversationParticipants.userId, participantId)
                        )
                    )
                return other.length > 0
            })
        })

    if (existingConversation) {
        // conversation already exists — just return it
        return res.status(200).json(
            new ApiResponse(200, { conversationId: existingConversation.id }, "Conversation already exists")
        )
    }

    // create new conversation
   const [newConversation] = await db
    .insert(conversation)
    .values({ 
        type: "direct",
        createdBy: userId    // ← add this
    })
    .returning()

    // add both participants
    await db.insert(conversationParticipants).values([
        { conversationId: newConversation.id, userId: userId },
        { conversationId: newConversation.id, userId: participantId },
    ])

    return res.status(201).json(
        new ApiResponse(201, {
            conversationId: newConversation.id,
            type: newConversation.type,
        }, "Conversation created successfully")
    )
})
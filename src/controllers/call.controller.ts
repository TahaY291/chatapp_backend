import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { db } from "../db";
import { calls,  conversationParticipants } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";

export const callInitiate = asyncHandler(async (req: Request , res: Response)=> {
    const callerId = req.user!.id
    const { conversationId , type , receiverId}  = req.body

    const checkUserBelongToConversationArr = await db.select().from(conversationParticipants).where(and(
        eq(conversationParticipants.conversationId , conversationId),
        eq(conversationParticipants.userId , callerId)
    ))

    const checkUserBelongToConversation = checkUserBelongToConversationArr[0]

    if (!checkUserBelongToConversation) {
        throw new ApiError(400 , 'Caller not belong to this conversation')
    }

    await db.insert(calls).values({
        callerId: callerId,
        receiverId: receiverId,
        conversationId: conversationId,
        type: type,
        status: "missed",
        startedAt: null,
        endedAt: null,
        duration: null,
    })

})

export const acceptCall = asyncHandler(async (req, res)=> {
    const callId = req.params.callId as string
    const userId = req.user!.id

    const checkReceiverArr = await db.select().from(calls).where(and(
        eq(calls.id , callId),
        eq(calls.receiverId, userId)
    ))

    const checkReceiver = checkReceiverArr[0]
    if (!checkReceiver) {
        throw new ApiError(403 , "You are not reciever of this call")
    }

    

})
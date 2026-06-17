import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { db } from "../db";
import { callParticipants, calls, conversation, conversationParticipants, users } from "../db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";
import { onlineUsers } from '../index';
import { io } from "../index";
import { ApiResponse } from "../lib/ApiResponse";
import { alias } from "drizzle-orm/pg-core";
import { count } from "drizzle-orm";

export const callInitiate = asyncHandler(async (req: Request, res: Response) => {
    const callerId = req.user!.id
    const { conversationId, callType } = req.body

    const isCallerParticipantArr = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, callerId)
            )
        )

    if (!isCallerParticipantArr[0]) {
        throw new ApiError(403, "You are not allowed to make this call")
    }

    // fetch caller info — needed for the incoming call notification
    const callerArr = await db.select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
    }).from(users).where(eq(users.id, callerId))

    const caller = callerArr[0]
    if (!caller) throw new ApiError(404, "Caller not found")

    const allParticipantsArr = await db.select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId))

    const conversationArr = await db.select()
        .from(conversation)
        .where(eq(conversation.id, conversationId))

    const isDirectCall = conversationArr[0].type === "direct"

    const otherParticipant = allParticipantsArr.find(p => p.userId !== callerId)
    const receiverId = isDirectCall ? otherParticipant?.userId || null : null

    const newCallArr = await db.insert(calls).values({
        callerId,
        receiverId,
        conversationId,
        type: callType,
        status: "missed",
        startedAt: null,
        endedAt: null,
        duration: null,
    }).returning()

    const newCall = newCallArr[0]

    allParticipantsArr.forEach(participant => {
        if (participant.userId !== callerId) {
            const socketId = onlineUsers.get(participant.userId)
            if (socketId) {
                io.to(socketId).emit("call:incoming", {
                    callId: newCall.id,
                    callerId,
                    callerName: caller.username,      // ← add this
                    callerAvatar: caller.avatarUrl,    // ← add this
                    type: callType,
                    conversationId
                })
            }
        }
    })

    return res.status(201).json(
        new ApiResponse(201, { callId: newCall.id, callerId }, "Call initiated successfully")
    )
})
export const acceptCall = asyncHandler(async (req, res) => {
    const callId = req.params.callId as string
    const userId = req.user!.id

    const callExistArr = await db.select().from(calls).where(and(
        eq(calls.id, callId),
    ))

    if (!callExistArr[0]) {
        throw new ApiError(404 , "Call not found")
    }

    if (callExistArr[0].status !== "missed") {
        throw new ApiError(403 , "Call already ended")
    }

    if (callExistArr[0].receiverId !== userId && callExistArr[0].receiverId !== null ) {
        throw new ApiError(403 , "You are not allowed to accept this call")
    }
    
    if (callExistArr[0].receiverId === null ) {
        const checkUserIsParticipant  = await db.select().from(conversationParticipants).where(
            and(
                eq(conversationParticipants.conversationId , callExistArr[0].conversationId),
                eq(conversationParticipants.userId , userId)
            )
        )
        if (!checkUserIsParticipant[0]) {
            throw new ApiError(403 , "You are not allowed to accept this call")
        }
    }

await db.update(calls).set({
    status: "completed",
    startedAt: new Date()
}).where(eq(calls.id, callId))

await db.insert(callParticipants).values({
    callId,
    userId,
    joinedAt: new Date()
}).onConflictDoNothing()
if (!callExistArr[0].receiverId) {
    await db.insert(callParticipants).values({
        callId,
        userId: callExistArr[0].callerId,
        joinedAt: new Date()
    }).onConflictDoNothing()
}

const callerSocketId = onlineUsers.get(callExistArr[0].callerId)
if (callerSocketId) {
    io.to(callerSocketId).emit("call:accepted", { callId })
}

return res.status(200).json(
    new ApiResponse(200, { callId }, "Call accepted successfully")
)
})
export const rejectCall = asyncHandler(async (req, res) => {
    const callId = req.params.callId as string
    const userId = req.user!.id

    const callExistArr = await db.select().from(calls).where(and(
        eq(calls.id, callId),
    ))

    if (!callExistArr[0]) {
        throw new ApiError(404 , "Call not found")
    }

    if (callExistArr[0].status !== "missed") {
        throw new ApiError(403 , "Call already ended")
    }

    if (callExistArr[0].receiverId !== userId && callExistArr[0].receiverId !== null ) {
        throw new ApiError(403 , "You are not allowed to reject this call")
    }
    
    if (callExistArr[0].receiverId === null ) {
        const checkUserIsParticipant  = await db.select().from(conversationParticipants).where(
            and(
                eq(conversationParticipants.conversationId , callExistArr[0].conversationId),
                eq(conversationParticipants.userId , userId)
            )
        )
        if (!checkUserIsParticipant[0]) {
            throw new ApiError(403 , "You are not allowed to reject this call")
        }
    }

await db.update(calls).set({
    status: "rejected",
    startedAt: null ,
    endedAt: null,
    duration: null
}).where(eq(calls.id, callId))

const callerSocketId = onlineUsers.get(callExistArr[0].callerId)
if (callerSocketId) {
    io.to(callerSocketId).emit("call:rejected", { callId })
}

return res.status(200).json(
    new ApiResponse(200, { callId }, "Call rejected")
)
})
export const endedCall = asyncHandler(async (req : Request , res:Response)=>{
    const callId = req.params.callId as string
    const userId = req.user!.id

    const callExistArr = await db.select().from(calls).where(and(
        eq(calls.id, callId),
    ))

    if (!callExistArr[0]) {
        throw new ApiError(404 , "Call not found")
    }
        const call = callExistArr[0]

    if (call.status !== "completed") {
        throw new ApiError(400 , "Call is not active")
    }


if (call.receiverId) {

    if (call.callerId !== userId && call.receiverId !== userId) {
            throw new ApiError(403, "You are not part of this call")
    }
    const duration = Math.floor(
        (Date.now() - call.startedAt!.getTime()) / 1000
    )
    await db.update(calls)
        .set({ endedAt: new Date(), duration })
        .where(eq(calls.id, callId))

        // when one persone end the call it will be ended for the other user too
    const otherUserId = userId === call.callerId 
        ? call.receiverId 
        : call.callerId

    const otherSocketId = onlineUsers.get(otherUserId)
    if (otherSocketId) {
        io.to(otherSocketId).emit("call:ended", { callId, duration })
    }

} else {

        const userIsParticipantArr = await db.select()
            .from(callParticipants)
            .where(
                and(
                    eq(callParticipants.callId, callId),
                    eq(callParticipants.userId, userId)
                )
            )

        if (!userIsParticipantArr[0]) {
            throw new ApiError(403, "You are not part of this call")
        }
           await db.update(callParticipants)
            .set({ leftAt: new Date() })
            .where(
                and(
                    eq(callParticipants.callId, callId),
                    eq(callParticipants.userId, userId)
                )
            )

             const stillInCall = await db.select()
            .from(callParticipants)
            .where(
                and(
                    eq(callParticipants.callId, callId),
                    isNull(callParticipants.leftAt)
                )
            )

             if (stillInCall.length <= 1) {
            const duration = Math.floor(
                (Date.now() - call.startedAt!.getTime()) / 1000
            )

              await db.update(calls)
                .set({ endedAt: new Date(), duration })
                .where(eq(calls.id, callId))

                  const allCallParticipants = await db.select()
                .from(callParticipants)
                .where(eq(callParticipants.callId, callId))

            allCallParticipants.forEach(p => {
                const socketId = onlineUsers.get(p.userId)
                if (socketId) {
                    io.to(socketId).emit("call:ended", { callId, duration })
                }
            })
        }else{
             stillInCall.forEach(p => {
                const socketId = onlineUsers.get(p.userId)
                if (socketId) {
                    io.to(socketId).emit("call:participant-left", {
                        callId,
                        userId
                    })
                }
            })
        }}

         return res.status(200).json(
        new ApiResponse(200, null, "Call ended successfully")
    )
})
export const getUserCallHistory = asyncHandler(async(req: Request, res: Response)=>{
    const userId = req.user!.id

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const offset = (page - 1) * limit

    const caller = alias(users , "caller")
    const receiver = alias(users , "receiver")

    const callHistory = await db.select({
         callId:           calls.id,
        type:             calls.type,
        status:           calls.status,
        startedAt:        calls.startedAt,
        endedAt:          calls.endedAt,
        duration:         calls.duration,
        createdAt:  calls.createdAt,
        conversationId:   calls.conversationId,

        callerId:         calls.callerId,
        callerUsername:   caller.username,
        callerAvatar:     caller.avatarUrl,

        receiverId:       calls.receiverId,
        receiverUsername: receiver.username,
        receiverAvatar:   receiver.avatarUrl,
    }).from(calls)
    .innerJoin(caller , eq(calls.callerId , caller.id))
    .leftJoin(receiver, eq(calls.receiverId , receiver.id))
    .where(or(
        eq(calls.callerId , userId),
        eq(calls.receiverId , userId)
    ))
    .orderBy(desc(calls.createdAt))
    .limit(limit)
    .offset(offset)


    const totalCalls = await db
        .select({ count: count() })
        .from(calls)
        .where(
            or(
                eq(calls.callerId, userId),
                eq(calls.receiverId, userId)
            )
        )

         const total = totalCalls[0].count
    const totalPages = Math.ceil(Number(total) / limit)

    return res.status(200).json(
        new ApiResponse(200, {
            calls: callHistory,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        }, "Call history fetched successfully")
    )
})
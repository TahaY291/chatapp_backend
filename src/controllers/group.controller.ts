import { Request, Response } from "express";
import { db } from "../db";
import { conversation, conversationParticipants, messages, messageStatus, users } from "../db/schema";
import { ApiError } from "../lib/ApiError";
import { ApiResponse } from "../lib/ApiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary";
import { GroupInput } from "../validator/group.validator";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { io, onlineUsers } from "../index";
import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";


export const createGroup = asyncHandler(async (req: Request, res: Response) => {
    const { name, description, groupMembersArr } = req.body as GroupInput
    const groupAdminId = req.user!.id

    if (groupMembersArr.length <= 0) {
        throw new ApiError(400, "Add members to the group")
    }
    let result = null
    if (req.file) {
        result = await uploadOnCloudinary(req.file.buffer, "avatar")
        if (!result) {
            throw new ApiError(500, "Failed to upload avatar url")
        }
    }

    const groupConversation = await db.insert(conversation).values({
        name: name,
        avatarUrl: result?.secure_url ?? null,
        description: description,
        createdBy: groupAdminId,
        type: "group"
    }).returning()

    const group = groupConversation[0]

    await db.insert(conversationParticipants).values([{
        conversationId: group.id,
        userId: groupAdminId,
        role: "admin"
    }, ...groupMembersArr.map((memberId) => ({
        conversationId: group.id,
        userId: memberId,
        role: "member" as const
    }))
    ])

    groupMembersArr.forEach((memberId: string) => {
        const socketId = onlineUsers.get(memberId)
        if (socketId) {
            io.to(socketId).emit("group:created", {
                groupId: group.id,
                groupName: group.name,
                addedBy: groupAdminId
            })
        }
    })

    return res.status(201).json(new ApiResponse(201, group, "Group create successfuly"))

})

export const sendMessageToGroup = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params.conversationId as string
    const { content } = req.body
    const userId = req.user!.id

    if (!content && !req.file) {
        throw new ApiError(400, "Message content or file is required")
    }

    let result = null
    let messageType = 'text'
    if (req.file) {
        result = await uploadOnCloudinary(req.file.buffer, "messageFile")
        if (req.file.mimetype.startsWith("image/")) messageType = "image"
        else if (req.file.mimetype.startsWith("video/")) messageType = "video"
        else if (req.file.mimetype.startsWith("audio/")) messageType = "audio"
        else messageType = "file"
    }
    const participantArr = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, userId)
            )
        )

    if (!participantArr[0]) {
        throw new ApiError(403, "You are not a participant of this group")
    }

    const messageArr = await db.insert(messages).values({
        conversationId: conversationId,
        content: content,
        mediaUrl: result?.secure_url ?? null,
        senderId: userId,
        type: messageType as any
    }).returning()

    const message = messageArr[0]

    await db.update(conversation).set({
        updatedAt: new Date()
    }).where(
        eq(conversation.id, conversationId)
    )

    const allParticipants = await db.select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId))

    const statusValues = allParticipants.filter(p => p.userId !== userId).map(p => ({
        messageId: message.id,
        userId: p.userId,
        status: 'sent' as const
    }))

    if (statusValues.length > 0) {
        await db.insert(messageStatus).values(statusValues)
    }


    allParticipants.forEach(participant => {
        if (participant.userId !== userId) {
            const socketId = onlineUsers.get(participant.userId)
            if (socketId) {
                io.to(socketId).emit("receive-message", message)
            }
        }
    })

    return res.status(201).json(
        new ApiResponse(201, message, "Message sent successfully")
    )

})

export const addMemberToGroup = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, membersIdArr } = req.body;
    const userId = req.user!.id

    const userIsAdminArr = await db.select().from(conversationParticipants).where(
        and(
            eq(conversationParticipants.role, "admin"),
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId)
        )
    )

    const userIsAdmin = userIsAdminArr[0]

    if (!userIsAdmin) {
        throw new ApiError(403, "Only admin is allowed to the add the member")
    }

    await db.insert(conversationParticipants).values(
        membersIdArr.map((memberId: string) => ({
            conversationId: conversationId,
            userId: memberId,
            role: "member" as const
        }))
    ).onConflictDoNothing()

    membersIdArr.forEach((memberId: string) => {
        const socketId = onlineUsers.get(memberId)
        if (socketId) {
            io.to(socketId).emit("group:member-added", {
                conversationId,
                addedBy: userId
            })
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Members added successfully")
    )


})

export const removeMemberFromGroup = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, memberIdArr } = req.body
    const userId = req.user!.id

    const isUserAdminArr = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.role, "admin"),
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, userId)
            )
        )

    if (!isUserAdminArr[0]) {
        throw new ApiError(403, "Only admin is allowed to remove any member")
    }

    if (memberIdArr.includes(userId)) {
        throw new ApiError(400, "Admin cannot remove themselves — use leaveGroup instead")
    }

    await db.delete(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                inArray(conversationParticipants.userId, memberIdArr)
            )
        )

    memberIdArr.forEach((memberId: string) => {
        const socketId = onlineUsers.get(memberId)
        if (socketId) {
            io.to(socketId).emit("group:member-removed", {
                conversationId,
                removedBy: userId
            })
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Members removed successfully")
    )
})

export const memberLeavesGroup = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params.conversationId as string  // ✅
    const userId = req.user!.id

    const isUserParticipantArr = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, userId)
            )
        )

    const isUserParticipant = isUserParticipantArr[0]
    if (!isUserParticipant) {
        throw new ApiError(404, "You are not a part of this group")
    }

    if (isUserParticipant.role === "admin") {
        const otherParticipants = await db.select()
            .from(conversationParticipants)
            .where(
                and(
                    eq(conversationParticipants.conversationId, conversationId),
                    ne(conversationParticipants.userId, userId)
                )
            )

        // no members left — delete group
        if (otherParticipants.length === 0) {
            await db.delete(conversation)
                .where(eq(conversation.id, conversationId))
            return res.status(200).json(
                new ApiResponse(200, null, "Group deleted as no members remaining")
            )
        }

        const randomIndex = Math.floor(Math.random() * otherParticipants.length)
        const newAdmin = otherParticipants[randomIndex]

        await db.update(conversationParticipants)
            .set({ role: "admin" })
            .where(
                and(
                    eq(conversationParticipants.conversationId, conversationId),
                    eq(conversationParticipants.userId, newAdmin.userId)
                )
            )
    }

    // remove from group
    await db.delete(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, userId)
            )
        )

    const remainingParticipants = await db.select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId))

    remainingParticipants.forEach(participant => {
        const socketId = onlineUsers.get(participant.userId)
        if (socketId) {
            io.to(socketId).emit("group:member-left", {
                conversationId,
                userId
            })
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "You have left the group successfully")
    )
})

export const updateGroupDetails = asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params.conversationId as string
    const { name, description } = req.body
    const userId = req.user!.id

    if (!name && !description && !req.file) {
        throw new ApiError(400, "At least one field must be provided to update")
    }

    const isUserAdminArr = await db.select()
        .from(conversationParticipants)
        .where(
            and(
                eq(conversationParticipants.role, "admin"),
                eq(conversationParticipants.conversationId, conversationId),
                eq(conversationParticipants.userId, userId)
            )
        )

    if (!isUserAdminArr[0]) {
        throw new ApiError(403, "Only admin can update group details")
    }

    const existingConversationArr = await db.select()
        .from(conversation)
        .where(eq(conversation.id, conversationId))
    const existingConversation = existingConversationArr[0]

    if (!existingConversation) {
        throw new ApiError(404, "Group not found")
    }

    let avatarUrl = existingConversation.avatarUrl
    if (req.file) {
        if (existingConversation.avatarUrl) {
            const publicId = existingConversation.avatarUrl.split("/").pop()?.split('.')[0]
            if (publicId) await deleteFromCloudinary(`avatars/${publicId}`)
        }
        const result = await uploadOnCloudinary(req.file.buffer, "avatars")
        if (!result) throw new ApiError(500, "Failed to upload avatar")
        avatarUrl = result.secure_url
    }

    await db.update(conversation)
        .set({
            name: name ?? existingConversation.name,
            description: description ?? existingConversation.description,
            avatarUrl: avatarUrl
        })
        .where(eq(conversation.id, conversationId))

    const allParticipants = await db.select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId))

    allParticipants.forEach(participant => {
        const socketId = onlineUsers.get(participant.userId)
        if (socketId) {
            io.to(socketId).emit("group:updated", {
                conversationId,
                updatedBy: userId
            })
        }
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Group updated successfully")
    )
})

export const getAllGroups = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id

    const myParticipation = alias(conversationParticipants, "my_participation")

    const lastMessageSubquery = db.select(
        {
            conversationId: messages.conversationId,
            content: messages.content,
            type: messages.type,
            createdAt: messages.createdAt,
        }
    ).from(messages).where(
        eq(
            messages.createdAt,
            db
                .select({ maxDate: sql`MAX(${messages.createdAt})` })
                .from(messages)
                .where(eq(messages.conversationId, messages.conversationId))
        )
    ).as('last_message')

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
                eq(messageStatus.userId, userId),
            )
        )
        .where(
            and(
                ne(messages.senderId, userId),
                ne(messageStatus.status, "read")
            )
        )
        .groupBy(messages.conversationId)
        .as("unread_count")

    const memberCountSubquery = db.select({
        conversationId: conversationParticipants.conversationId,
        memberCount: sql<number> `Count(*)`.as("member_count")
    })
        .from(conversationParticipants)
        .groupBy(conversationParticipants.conversationId)
        .as('member_count')

    const groups = await db.select({
        conversationId: conversation.id,
        name: conversation.name,
        avatarUrl: conversation.avatarUrl,
        description: conversation.description,
        updatedAt: conversation.updatedAt,
        type: conversation.type,

        lastMessage: lastMessageSubquery.content,
        lastMessageType: lastMessageSubquery.type,
        lastMessageAt: lastMessageSubquery.createdAt,

        unreadCount: sql<number>`COALESCE(${unreadCountSubquery.unreadCount}, 0)`,

        memberCount: sql<number>`COALESCE(${memberCountSubquery.memberCount}, 0)`,
    }).from(myParticipation)
        .innerJoin(
            conversation,
            and(
                eq(myParticipation.conversationId, conversation.id),
                eq(conversation.type, "group")
            )
        )
        .leftJoin(
            lastMessageSubquery,
            eq(lastMessageSubquery.conversationId, conversation.id)
        )
        .leftJoin(
            unreadCountSubquery,
            eq(unreadCountSubquery.conversationId, conversation.id)
        )
        .leftJoin(
            memberCountSubquery,
            eq(memberCountSubquery.conversationId, conversation.id)
        )
        .where(eq(myParticipation.userId, userId))
        .orderBy(desc(conversation.updatedAt))

    return res.status(200).json(
        new ApiResponse(200, groups, "Groups fetched successfully")
    )

})
// getGroupMessages
// ❌ deleteGroup

export const getGroupMessages = asyncHandler(async(req: Request , res: Response)=>{
    const conversationId = req.params.conversationId as string
    const userId = req.user!.id

    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 50
    const offset = (page - 1) * limit;

    const participant = await db.select()
    .from(conversationParticipants)
    .where(
        and(
            eq(conversationParticipants.conversationId , conversationId),
            eq(conversationParticipants.userId , userId)
        )
    )

    if (!participant[0]) {
        throw new ApiError(403 , "You are not the participant of this conversation")
    }

    const groupConversation = await db.select({
        content: messages.content,
        mediaUrl: messages.mediaUrl,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        type: messages.type,
        replyToId: messages.replyToId,
        isDeleted: messages.isDeleted,

        
    }).from(messages)
    .innerJoin(
        users,
        eq(messages.senderId , users.id)
    )
    .where(
            eq(messages.conversationId , conversationId)
    )
})
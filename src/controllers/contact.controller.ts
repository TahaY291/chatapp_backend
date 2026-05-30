import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { db } from "../db";
import { contacts } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../lib/ApiError";
import { ApiResponse } from "../lib/ApiResponse";

export const saveContact = asyncHandler(async (req: Request, res: Response) => {
    const { contactId, nickname } = req.body
    const userId = req.user!.id

    const checkIsUserAlreadySavedArr = await db.select()
        .from(contacts)
        .where(
            and(
                eq(contacts.ownerId, userId),
                eq(contacts.contactId, contactId)
            )
        )

    if (checkIsUserAlreadySavedArr[0]) {
        throw new ApiError(400, "User already in your contact list")
    }

    await db.insert(contacts).values({
        contactId: contactId,
        ownerId: userId,
        nickname: nickname || null
    })

    return res.status(201).json(
        new ApiResponse(201, null, "User saved successfully in your contacts") 
    )
})

export const updateNickname = asyncHandler(async (req: Request, res: Response) => {
    const contactId = req.params.contactId as string
    const { nickname } = req.body
    const userId = req.user!.id

    const contactExistArr = await db.select()
        .from(contacts)
        .where(
            and(
                eq(contacts.contactId, contactId),
                eq(contacts.ownerId, userId)
            )
        )

    if (!contactExistArr[0]) {
        throw new ApiError(404, "Contact not found")
    }

    const updatedContact = await db.update(contacts)
        .set({ nickname: nickname })
        .where(
            and(
                eq(contacts.contactId, contactId),
                eq(contacts.ownerId, userId)
            )
        )
        .returning()

    return res.status(200).json(
        new ApiResponse(200, updatedContact[0], "Contact nickname updated successfully")
    )
})

export const deleteContact = asyncHandler(async (req: Request, res: Response) => {
    const contactId = req.params.contactId as string
    const userId = req.user!.id

    const contactExistArr = await db.select()
        .from(contacts)
        .where(
            and(
                eq(contacts.contactId, contactId),
                eq(contacts.ownerId, userId)
            )
        )

    if (!contactExistArr[0]) {
        throw new ApiError(404, "Contact not found")
    }

    await db.delete(contacts).where(
        and(
            eq(contacts.contactId, contactId),
            eq(contacts.ownerId, userId)
        )
    )

    return res.status(200).json(
        new ApiResponse(200, null, "Contact deleted successfully") 
    )
})
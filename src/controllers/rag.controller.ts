import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { askLLM, chunkText, embeddText, searchChunks } from "../utils/rag";
import { db } from "../db";
import { fileChunks, fileConversations, userFiles } from "../db/rag";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { and, eq } from "drizzle-orm";
import { io, onlineUsers } from "../index";



export const ingestPdfFile = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id

    if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' })
        return
    }

    if (req.file.mimetype !== 'application/pdf') {
        res.status(400).json({ message: 'Only PDF files are allowed' })
        return
    }

    const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>
    const data = await pdfParse(req.file.buffer)
    const text = data.text

    if (!text || text.trim() === '') {
        res.status(400).json({ message: 'Could not extract text from this PDF' })
        return
    }
    const cloudinaryResponse = await uploadOnCloudinary(req.file.buffer)
    const fileUrl = cloudinaryResponse.secure_url

    const [fileRecord] = await db.insert(userFiles).values({
        userId,
        fileUrl: fileUrl,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        status: 'processing'
    }).returning()

    const chunks = await chunkText(text, 500, 50)

    for (const chunk of chunks) {
        const embedding = await embeddText(chunk.content)

        await db.insert(fileChunks).values({
            fileId: fileRecord.id,
            userId,
            content: chunk.content,
            embedding: embedding,
            chunkIndex: chunk.index,
        })
    }

    await db.update(userFiles)
        .set({ status: 'ready' })
        .where(eq(userFiles.id, fileRecord.id))

    res.status(201).json({
        message: 'File uploaded and processed successfully',
        file: {
            id: fileRecord.id,
            originalName: fileRecord.originalName,
            status: 'ready'
        }
    })
})

export const query = asyncHandler(async (req: Request, res: Response) => {
    const { question, fileId } = req.body
    const userId = req.user!.id

    if (!question || !fileId) {
        res.status(400).json({ message: 'question and fileId are required' })
        return
    }

    const [chat] = await db.insert(fileConversations).values({
        userId,
        fileId,
        question
    }).returning()

    const embeddedQuestion = await embeddText(question)
    const chunks = await searchChunks(embeddedQuestion, 5, userId, fileId)

    if (chunks.length === 0) {
        res.status(404).json({ message: 'No relevant content found for this question' })
        return
    }

    const socketId = onlineUsers.get(userId)

    const answer = await askLLM(question, chunks, (token) => {
        if (socketId) {
            io.to(socketId).emit('rag:token', { token })
        }
    })

    await db.update(fileConversations)
        .set({ answer })
        .where(eq(fileConversations.id, chat.id))

    if (socketId) {
        io.to(socketId).emit('rag:done', { chatId: chat.id })
    }

    res.status(200).json({ message: 'done' })
})


export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
    const fileId = req.params.fileId as string
    const userId = req.user!.id

    const [file] = await db.select()
        .from(userFiles)
        .where(
            and(
                eq(userFiles.id, fileId),
                eq(userFiles.userId, userId)
            )
        )

    if (!file) {
        res.status(404).json({ message: 'File not found' })
        return
    }

    await db.delete(userFiles)
        .where(eq(userFiles.id, fileId))

    res.status(200).json({ message: 'File deleted successfully' })
})

export const getFileConversations = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id

    const conversations = await db.select()
        .from(fileConversations)
        .where(
                eq(fileConversations.userId, userId)
        )
        .orderBy(fileConversations.createdAt)

    res.status(200).json({ conversations })
})
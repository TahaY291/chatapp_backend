import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { askLLM, chunkText, embeddText, extractTextFromPdf, generateSummary, rerankChunks, rewriteQuery, searchChunks } from "../utils/rag";
import { db } from "../db";
import { fileChunks, fileConversations, fileStatusEnum, userFiles } from "../db/rag";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { and, eq } from "drizzle-orm";
import { io, onlineUsers } from "../index";
import { sql } from "drizzle-orm";



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

    const text = await extractTextFromPdf(req.file.buffer)

    if (!text || text.trim() === '') {
        res.status(400).json({ message: 'Could not extract text from this PDF' })
        return
    }


    const [fileRecord] = await db.insert(userFiles).values({
        userId,
        fileUrl: null,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        status: 'processing'
    }).returning()

    // chunk + embed + store — main priority
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

    // mark as ready — user can now ask questions
    await db.update(userFiles)
        .set({ status: 'ready' })
        .where(eq(userFiles.id, fileRecord.id))

    // send response immediately — do not wait for background tasks
    res.status(201).json({
        message: 'File uploaded and processed successfully',
        file: {
            id: fileRecord.id,
            originalName: fileRecord.originalName,
            status: 'ready'
        }
    })

    // background tasks — fire and forget
    // no await — these run after response is sent
    Promise.all([
        // cloudinary upload
        uploadOnCloudinary(req.file!.buffer)
            .then(async (cloudinaryResponse) => {
                if (cloudinaryResponse) {
                    await db.update(userFiles)
                        .set({ fileUrl: cloudinaryResponse.secure_url })
                        .where(eq(userFiles.id, fileRecord.id))
                }
            }),


        generateSummary(text)
            .then(async (summary) => {
                if (summary) {
                    await db.update(userFiles)
                        .set({ summary })
                        .where(eq(userFiles.id, fileRecord.id))
                }
            })
    ]).catch(err => console.error('Background tasks failed:', err))
})
export const query = asyncHandler(async (req: Request, res: Response) => {
    const { question, fileId } = req.body
    const userId = req.user!.id

    if (!question || !fileId) {
        res.status(400).json({ message: 'question and fileId are required' })
        return
    }

    // save original question immediately
    const [chat] = await db.insert(fileConversations).values({
        userId,
        fileId,
        question
    }).returning()

    // fetch summary for query rewriting
    const [file] = await db.select({ summary: userFiles.summary })
        .from(userFiles)
        .where(eq(userFiles.id, fileId))

    // rewrite only if summary exists — otherwise use original
    const queryForRetrieval = file?.summary
        ? await rewriteQuery(question, file.summary)
        : question

        console.log("Better question",queryForRetrieval)
        console.log("original question",question)

    // embed rewritten question for better retrieval
    const embeddedQuestion = await embeddText(queryForRetrieval)
    const chunks = await searchChunks(embeddedQuestion, question, 10, userId, fileId)

    if (chunks.length === 0) {
        res.status(404).json({ message: 'No relevant content found for this question' })
        return
    }

    const rerankedChunks = await rerankChunks(queryForRetrieval, chunks, 5)

    const socketId = onlineUsers.get(userId)

    function getToken(token: string) {
        if (socketId) {
            io.to(socketId).emit('rag:token', { token })
        }
    }

    const answer = await askLLM(question, rerankedChunks, getToken)

    // save answer
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
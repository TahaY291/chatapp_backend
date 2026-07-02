import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Ollama } from "ollama";
import { db } from "../db";
import { fileChunks } from "../db/rag";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { CohereClient } from "cohere-ai";



const ollama = new Ollama()
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY })
export const chunkText = async (text: string, chunkSize: number, chunkOverlap: number) => {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '.', ' ', '']
    })

    const chunks = await splitter.createDocuments([text])

    return chunks.map((chunk, index) => ({
        index,
        content: chunk.pageContent,
        charCount: chunk.pageContent.length
    }))
}

export const embeddText = async (text: string) => {
    const embeddings = await ollama.embeddings({
        model: 'nomic-embed-text',
        prompt: text
    })

    return embeddings.embedding
}


export const searchChunks = async (
    questionEmbedding: number[],
    question: string,
    topN: number = 10,
    userId: string,
    fileId: string
) => {
    const vectorStr = JSON.stringify(questionEmbedding)

    const vectorResults = await db.select({
        id: fileChunks.id,
        content: fileChunks.content,
        chunkIndex: fileChunks.chunkIndex,
    })
    .from(fileChunks)
    .where(
        and(
            eq(fileChunks.fileId, fileId),
            eq(fileChunks.userId, userId)
        )
    )
    .orderBy(sql`embedding <=> ${vectorStr}::vector`)
    .limit(20)
    console.log("vector results", vectorResults)
    const keywordResults = await db.select({
        id: fileChunks.id,
        content: fileChunks.content,
        chunkIndex: fileChunks.chunkIndex,
    })
    .from(fileChunks)
    .where(
        and(
            eq(fileChunks.fileId, fileId),
            eq(fileChunks.userId, userId),
            sql`content_search @@ plainto_tsquery('english', ${question})`
        )
    )
    .orderBy(sql`ts_rank(content_search, plainto_tsquery('english', ${question})) DESC`)
    .limit(20)

        console.log("keyword results", keywordResults)

    const scores = new Map<string, { content: string; score: number }>()
    console.log("score", scores)
    
    vectorResults.forEach((row, index) => {
        const rrfScore = 1 / (index + 60)
        scores.set(row.id, { content: row.content, score: rrfScore })
    })

    keywordResults.forEach((row, index) => {
        const rrfScore = 1 / (index + 60)
        const existing = scores.get(row.id)
        if (existing) {
            existing.score += rrfScore
        } else {
            scores.set(row.id, { content: row.content, score: rrfScore })
        }
    })

    const merged = Array.from(scores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, topN)
        .map(([id, { content }]) => ({ id, content }))

    return merged
}

export const askLLM = async (question: string, chunks: { content: string }[], onToken: (token: string) => void) => {
    const context = chunks
        .map((c, i) => `Chunk ${i + 1}:\n${c.content}`)
        .join('\n\n')

    const response = await ollama.chat({
        model: 'llama3.2',
        messages: [
            {
                role: 'system',
                content: `You are a helpful assistant answering questions about an uploaded document.

Rules:
1. Factual questions (what does the document say, when, who, how much, list X) — answer using ONLY the context below. If the specific fact is not present, say "I don't have enough information in this document to answer that."
2. Judgement questions (rate, evaluate, what do you think, is this good, summarize your opinion, would you recommend) — these ask for YOUR assessment. Use the context as the basis for your reasoning and give a real opinion. Never refuse these by saying the document "doesn't include a rating" — the document is the evidence, your job is to evaluate it.
3. Off-topic questions unrelated to the document or its content — answer normally using your own knowledge.

Example: if asked "rate this resume out of 10," look at the skills, experience, and projects in the context, then give an actual number with reasoning. Do not say the document lacks a rating field.

CONTEXT:
${context}`
            },
            {
                role: 'user',
                content: question
            }
        ],
        stream: true
    })

    let fullAnswer = ''

    for await (const chunk of response) {
        const token = chunk.message.content
        fullAnswer += token
        onToken(token)
    }

    return fullAnswer
}


export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const uint8Array = new Uint8Array(buffer)
    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
        fullText += pageText + '\n'
    }

    return fullText
}
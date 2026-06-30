import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Ollama } from "ollama";
import { db } from "../db";
import { fileChunks } from "../db/rag";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";


const ollama = new Ollama()
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
    question: number[],
    topN: number = 5,
    userId: string,
    fileId: string
) => {
    const vectorStr = JSON.stringify(question)

    const result = await db.select({
        content: fileChunks.content,
    }).from(fileChunks).where(
        and(
            eq(fileChunks.fileId, fileId),
            eq(fileChunks.userId, userId)
        )
    ).orderBy(sql`embedding <=> ${vectorStr}::vector`)
        .limit(topN)

    return result
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
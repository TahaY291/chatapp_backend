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
                content: `You are a helpful assistant. Answer the user's question using ONLY the context provided below. 
If the answer is not in the context, say "I don't have enough information to answer this."
Do not use your own knowledge.

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
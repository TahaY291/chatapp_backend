import * as dotenv from 'dotenv'
dotenv.config()

import { embeddText, searchChunks, rerankChunks, askLLM, rewriteQuery, judgeAnswer } from './utils/rag'
import { db } from './db'
import { userFiles } from './db/rag'
import { eq } from 'drizzle-orm'

const testCases = [
    { question: "What is the GitHub profile link?", expected: "github.com/TahaY291" },
    { question: "What university is he studying at?", expected: "Virtual University of Pakistan" },
    { question: "What semester is he currently in?", expected: "8th Semester" },
    { question: "What was the client's business for the freelance project?", expected: "Local garage / auto-parts store in Faisalabad" },
    { question: "By how much did he reduce product lookup time in the garage project?", expected: "60%" },
    { question: "What technologies did he use for real time communication?", expected: "WebRTC and Socket.io" },
    { question: "How did he implement the RAG feature in Converse?", expected: "PDF ingestion and chunking with LangChain, embeddings with Ollama, cosine similarity retrieval stored in PostgreSQL via pgvector" },
    { question: "What problem did he solve in the WebRTC implementation?", expected: "Diagnosed and fixed a signaling race condition by targeting receivers via socket ID instead of room broadcast" },
    { question: "What databases has he worked with?", expected: "PostgreSQL with Drizzle ORM and pgvector, MongoDB with Mongoose" },
    { question: "What is he currently learning?", expected: "AWS, Docker, CI/CD pipelines, GraphQL" },
    { question: "Is he ready for a remote job?", expected: "Yes, CV explicitly states open to remote opportunities worldwide and has delivered real client work independently" },
    { question: "How strong is his AI/RAG experience compared to a typical junior developer?", expected: "Stronger than average, built complete RAG pipeline with pgvector streaming and hybrid search" },
    { question: "Would you recommend him for a full stack role?", expected: "Yes, covers frontend backend database real time and AI integration with real shipped projects" },
    { question: "What is his current salary expectation?", expected: "Not enough information in this document" },
    { question: "Has he worked with React Native or mobile development?", expected: "Not enough information in this document" },
]

const FILE_ID = '16e49b92-b05d-4cee-a5fa-22c67df5c2d8'
const USER_ID = 'adbff78b-c1b0-482a-88ab-02424ed1b778'

async function runEval() {
    console.log('\n🔍 Starting RAG Evaluation...\n')

    const [file] = await db.select({ summary: userFiles.summary })
        .from(userFiles)
        .where(eq(userFiles.id, FILE_ID))

    const summary = file?.summary || ''

    const results: {
        question: string
        expected: string
        actual: string
        score: number
        pass: boolean
    }[] = []

    for (let i = 0; i < testCases.length; i++) {
        const { question, expected } = testCases[i]
        console.log(`Running test ${i + 1}/${testCases.length}: "${question}"`)

        try {
            const queryForRetrieval = summary
                ? await rewriteQuery(question, summary)
                : question

            const embeddedQuestion = await embeddText(queryForRetrieval)

            const chunks = await searchChunks(embeddedQuestion, question, 15, USER_ID, FILE_ID)

            const rerankedChunks = chunks.length > 0
                ? await rerankChunks(queryForRetrieval, chunks, 7)
                : []
            const actual = await askLLM(question, rerankedChunks, () => {})

            const score = await judgeAnswer(question, expected, actual)
            const pass = score >= 3

            results.push({ question, expected, actual, score, pass })
            console.log(`  Score: ${score}/5 ${pass ? '✓' : '✗'}\n`)

        } catch (err) {
            console.error(`  Failed: ${err}\n`)
            results.push({ question, expected, actual: 'ERROR', score: 0, pass: false })
        }
    }

    // --- print summary table ---
    console.log('\n' + '='.repeat(80))
    console.log('EVALUATION REPORT')
    console.log('='.repeat(80))

    results.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.question}`)
        console.log(`   Expected: ${r.expected}`)
        console.log(`   Actual:   ${r.actual.slice(0, 150)}...`)
        console.log(`   Score:    ${r.score}/5 ${r.pass ? '✅ PASS' : '❌ FAIL'}`)
    })

    const passed = results.filter(r => r.pass).length
    const total = results.length
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / total

    console.log('\n' + '='.repeat(80))
    console.log(`SUMMARY`)
    console.log('='.repeat(80))
    console.log(`Total:    ${total} questions`)
    console.log(`Passed:   ${passed}/${total} (${Math.round(passed/total*100)}%)`)
    console.log(`Average:  ${avgScore.toFixed(1)}/5`)
    console.log('='.repeat(80) + '\n')

    process.exit(0)
}

runEval().catch(console.error)
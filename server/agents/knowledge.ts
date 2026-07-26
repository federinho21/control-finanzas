import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { searchDocuments } from './tools/rag-tools'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'
import { logger } from '~~/server/utils/logger'

/**
 * Answers user questions using RAG (Retrieval-Augmented Generation) by searching documents and generating a response.
 * @param query - The user's question
 * @returns An AI-generated answer based on document context, or a message if no documents are found
 */
export async function answerWithRag(query: string) {
  logger.info('Knowledge', `RAG query: "${query.slice(0, 80)}"`)

  const matches = await searchDocuments(query, 3)
  logger.info('Knowledge', `found ${matches.length} chunk(s) - top score=${matches[0]?.score.toFixed(3) ?? 'n/a'}`)

  if (matches.length === 0) {
    return 'No document context found yet. Upload a .txt or .pdf file to enable RAG answers.'
  }

  const ragSection = matches.length > 0
    ? matches
        .map((m, index) => `Source ${index + 1} (score ${m.score.toFixed(3)}):\n${m.chunkText}`)
        .join('\n\n')
    : ''

  const apiKey = useGeminiApiKey()

  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    temperature: 0.2
  })

  const response = await model.invoke(`
Answer in concise, and following the same language as the question. If uncertain, say so clearly.

Question:
${query}

Context:
${ragSection}
`)

  logger.info('Knowledge', 'RAG answer generated')
  return String(response.content)
}

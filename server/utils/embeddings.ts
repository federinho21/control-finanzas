import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'
import { useGeminiApiKey } from '~~/server/composables/useGeminiApiKey'

let embeddingsClient: GoogleGenerativeAIEmbeddings | null = null

/**
 * Returns a cached Gemini embeddings client configured with the active API key.
 * @returns Shared embeddings client instance.
 * @throws Propagates client initialization errors when configuration is invalid.
 */
function getClient() {
  const apiKey = useGeminiApiKey()

  if (!embeddingsClient) {
    embeddingsClient = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: 'models/gemini-embedding-001'
    })
  }

  return embeddingsClient
}

/**
 * Generates an embedding vector for a text query using the configured provider.
 * @param text Input text to embed.
 * @returns Numeric embedding vector representing semantic content.
 * @throws Propagates provider errors when embedding generation fails.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient()
  return client.embedQuery(text)
}

/**
 * Computes cosine similarity between two numeric vectors.
 * @param a First embedding vector.
 * @param b Second embedding vector.
 * @returns Similarity score between 0 and 1 for valid non-zero vectors, otherwise 0.
 * @throws Does not throw; invalid dimensions or zero norms return 0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0
  }

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    const valueA = a[i]!
    const valueB = b[i]!
    dot += valueA * valueB
    normA += valueA * valueA
    normB += valueB * valueB
  }

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

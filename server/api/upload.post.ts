import { createError, eventHandler, readMultipartFormData } from 'h3'
import { db } from '~~/server/db'
import { documentChunks, documents } from '~~/server/db/schema'
import { chunkText } from '~~/server/utils/chunker'
import { embedText } from '~~/server/utils/embeddings'
import { logger } from '~~/server/utils/logger'
import { extractTextFromFile } from '~~/server/utils/pdf-parser'

/**
 * Handles POST /api/upload to ingest a document, chunk its text, and store embeddings.
 * @param event Nitro event containing multipart form-data with file and optional tempId fields.
 * @returns Object with upload status, created document id, chunk count, and optional tempId.
 * @throws {H3Error} Throws a 400 error when file parsing, validation, or persistence fails.
 */
export default eventHandler(async (event) => {
  try {
    const form = await readMultipartFormData(event)
    const file = form?.find((item) => item.name === 'file' && item.filename)
    const tempIdField = form?.find((item) => item.name === 'tempId' && !item.filename)
    const tempId = tempIdField?.data ? Buffer.from(tempIdField.data).toString('utf8').trim() || null : null

    if (!file?.data || !file.filename) {
      throw new Error('No file uploaded')
    }

    logger.info('Upload', `file="${file.filename}" size=${file.data.byteLength}B`)

    const text = await extractTextFromFile(Buffer.from(file.data), file.filename)
    if (!text.trim()) {
      throw new Error('The uploaded file has no readable content')
    }
    logger.info('Upload', `text extracted length=${text.length} chars`)

    // Store the full extracted text in documents.content as a single string.
    // This is an audit record of exactly what was parsed from the original file,
    // and allows future re-chunking/re-embedding (e.g., model or chunk changes)
    // without requiring the user to upload the file again. RAG reads documentChunks only.
    const inserted = await db
      .insert(documents)
      .values({
        filename: file.filename,
        content: text,
        tempId,
        createdAt: new Date().toISOString()
      })
      .returning({ id: documents.id })

    const documentId = inserted[0]?.id
    if (!documentId) {
      throw new Error('Could not create document record')
    }

    // Split text into overlapping chunks with RecursiveCharacterTextSplitter.
    // Each chunk is embedded and saved in documentChunks as the
    // searchable unit used by RAG retrieval.
    const chunks = await chunkText(text)
    logger.info('Upload', `chunked into ${chunks.length} chunks`)

    for (const chunk of chunks) {
      const embedding = await embedText(chunk)
      await db.insert(documentChunks).values({
        documentId,
        chunkText: chunk,
        embedding: JSON.stringify(embedding)
      })
    }

    logger.info('Upload', `embeddings stored documentId=${documentId}`)

    return {
      ok: true,
      filename: file.filename,
      documentId,
      chunks: chunks.length,
      tempId: tempId ?? undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})

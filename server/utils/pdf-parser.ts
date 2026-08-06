/**
 * Extracts plain text from supported uploaded file types.
 * The PDF parser is lazy-loaded so it never blocks Worker startup.
 * @param buffer File contents as a binary buffer.
 * @param filename Original filename used to infer parser strategy.
 * @returns Extracted UTF-8 text content from the file.
 * @throws Throws when file extension is unsupported or parsing fails.
 */
export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return buffer.toString('utf8')
  }

  if (lower.endsWith('.pdf')) {
    const { PDFLoader } = await import('@langchain/community/document_loaders/fs/pdf')
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    const loader = new PDFLoader(new Blob([arrayBuffer]))
    const docs = await loader.load()
    return docs.map(d => d.pageContent).join('\n')
  }

  throw new Error('Unsupported file type. Please upload .txt, .md, or .pdf')
}

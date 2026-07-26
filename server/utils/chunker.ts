import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

/**
 * Splits plain text into overlapping chunks for downstream embedding and retrieval.
 * Separators are ordered from highest to lowest semantic granularity, covering both
 * markdown structure (headings, horizontal rules) and prose (sentences, clauses, words).
 * @param text Source text to split into chunks.
 * @param chunkSize Maximum number of characters per chunk.
 * @param chunkOverlap Number of overlapping characters between adjacent chunks.
 * @returns Non-empty chunk strings preserving source order.
 * @throws Propagates splitter errors when document creation fails.
 */
export async function chunkText(text: string, chunkSize = 1200, chunkOverlap = 200): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: [
      '\n# ', '\n## ', '\n### ', '\n#### ', // markdown headings
      '\n---',                               // markdown horizontal rule
      '\n\n',                                // paragraphs
      '\n',                                  // lines
      '. ', '? ', '! ', '; ',               // sentence / clause boundaries
      ' ', '',                               // words / characters (last resort)
    ],
  })
  const docs = await splitter.createDocuments([text])
  return docs.map(doc => doc.pageContent).filter(chunk => chunk.trim().length > 0)
}

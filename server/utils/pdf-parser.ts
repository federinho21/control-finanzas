import { FinanceError } from '../repositories/finance-model'

export function validateFile(buffer: Buffer, filename: string, mime: string) {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new FinanceError(413, 'File must be between 1 byte and 5 MB.')
  if (!filename || filename.length > 180 || /[\x00-\x1f/\\]/.test(filename)) throw new FinanceError(400, 'Invalid filename.')
  const extension = filename.toLowerCase().split('.').pop()
  if (extension === 'pdf') {
    if (mime !== 'application/pdf' || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new FinanceError(400, 'Invalid PDF signature or MIME type.')
  } else if (extension === 'txt' || extension === 'csv' || extension === 'md') {
    if (!(extension === 'csv' ? ['text/csv', 'text/plain', 'application/csv'] : extension === 'md' ? ['text/markdown', 'text/plain'] : ['text/plain']).includes(mime)) throw new FinanceError(400, 'Invalid text MIME type.')
    if (buffer.includes(0)) throw new FinanceError(400, 'Binary content is not allowed.')
    try { new TextDecoder('utf-8', { fatal: true }).decode(buffer) } catch { throw new FinanceError(400, 'Text must use UTF-8.') }
  } else throw new FinanceError(400, 'Only PDF, TXT, CSV and Markdown files are allowed.')
}

export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  if (!filename.toLowerCase().endsWith('.pdf')) return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  const parse = (await import('pdf-parse/lib/pdf-parse.js')).default
  const result = await parse(buffer, { max: 20 })
  if (result.numpages > 20) throw new FinanceError(413, 'PDF files are limited to 20 pages.')
  return result.text
}

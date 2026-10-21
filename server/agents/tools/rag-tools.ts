import { getDocumentRepository } from '../../repositories/documents'
export function searchDocuments(uid: string, query: string, limit = 3) { return getDocumentRepository().search(uid, query, limit) }
export function summarizeDocument(uid: string, documentId: string) { return getDocumentRepository().summary(uid, documentId) }

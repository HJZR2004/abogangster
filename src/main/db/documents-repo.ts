import type { DocumentRecord, DocumentScope, DocumentStatus } from '@shared/types'
import type { Db } from './database'
import { transaction } from './database'
import { blobToVector, newId, num, nowIso, str, strOrNull, vectorToBlob, type Row } from './util'

function toDocument(row: Row): DocumentRecord {
  return {
    id: str(row, 'id'),
    scope: str(row, 'scope') as DocumentScope,
    caseId: strOrNull(row, 'case_id'),
    path: str(row, 'path'),
    relPath: str(row, 'rel_path'),
    fileName: str(row, 'file_name'),
    ext: str(row, 'ext'),
    size: num(row, 'size'),
    mtimeMs: num(row, 'mtime_ms'),
    status: str(row, 'status') as DocumentStatus,
    error: strOrNull(row, 'error'),
    charCount: num(row, 'char_count'),
    chunkCount: num(row, 'chunk_count'),
    embeddedChunkCount: num(row, 'embedded_count'),
    description: str(row, 'description'),
    indexedAt: strOrNull(row, 'indexed_at'),
    createdAt: str(row, 'created_at')
  }
}

const DOC_SELECT = /* sql */ `
  SELECT d.id, d.scope, d.case_id, d.path, d.rel_path, d.file_name, d.ext, d.size, d.mtime_ms, d.hash, d.status,
    d.error, d.char_count, d.chunk_count, d.description, d.indexed_at, d.created_at,
    (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL) AS embedded_count
  FROM documents d
`

export interface DocumentLocation {
  scope: DocumentScope
  caseId: string | null
  path: string
  relPath: string
  fileName: string
  ext: string
}

export interface ChunkWithEmbedding {
  id: number
  documentId: string
  text: string
  embedding: Float32Array
}

export interface DocumentFilter {
  caseId: string | null
  includeLibrary: boolean
}

/** SQL condition selecting documents for a filter. Expects the documents table aliased as `d`. */
export function filterSql(filter: DocumentFilter): { sql: string; params: (string | number)[] } {
  if (filter.caseId === null) return { sql: `d.scope = 'library'`, params: [] }
  if (filter.includeLibrary) return { sql: `(d.case_id = ? OR d.scope = 'library')`, params: [filter.caseId] }
  return { sql: `d.case_id = ?`, params: [filter.caseId] }
}

export class DocumentsRepo {
  constructor(private readonly db: Db) {}

  list(caseId: string | null): DocumentRecord[] {
    const rows = (
      caseId === null
        ? this.db.prepare(`${DOC_SELECT} WHERE d.scope = 'library' ORDER BY d.rel_path COLLATE NOCASE`).all()
        : this.db.prepare(`${DOC_SELECT} WHERE d.case_id = ? ORDER BY d.rel_path COLLATE NOCASE`).all(caseId)
    ) as Row[]
    return rows.map(toDocument)
  }

  get(id: string): DocumentRecord | null {
    const row = this.db.prepare(`${DOC_SELECT} WHERE d.id = ?`).get(id) as Row | undefined
    return row ? toDocument(row) : null
  }

  getByPath(path: string): (DocumentRecord & { hash: string | null }) | null {
    const row = this.db.prepare(`${DOC_SELECT} WHERE d.path = ?`).get(path) as Row | undefined
    return row ? { ...toDocument(row), hash: strOrNull(row, 'hash') } : null
  }

  getMany(ids: string[]): DocumentRecord[] {
    return ids.map((id) => this.get(id)).filter((d): d is DocumentRecord => d !== null)
  }

  /** All known paths under a scope root, used to detect deleted files. */
  pathsFor(scope: DocumentScope, caseId: string | null): string[] {
    const rows = (
      scope === 'library'
        ? this.db.prepare(`SELECT path FROM documents WHERE scope = 'library'`).all()
        : this.db.prepare(`SELECT path FROM documents WHERE case_id = ?`).all(caseId)
    ) as Row[]
    return rows.map((r) => str(r, 'path'))
  }

  /** Inserts the document if new, or updates its location. Returns its id. */
  upsertLocation(loc: DocumentLocation): string {
    const existing = this.db.prepare('SELECT id FROM documents WHERE path = ?').get(loc.path) as Row | undefined
    if (existing) {
      const id = str(existing, 'id')
      this.db
        .prepare('UPDATE documents SET scope = ?, case_id = ?, rel_path = ?, file_name = ?, ext = ? WHERE id = ?')
        .run(loc.scope, loc.caseId, loc.relPath, loc.fileName, loc.ext, id)
      return id
    }
    const id = newId()
    this.db
      .prepare(
        `INSERT INTO documents (id, scope, case_id, path, rel_path, file_name, ext, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`
      )
      .run(id, loc.scope, loc.caseId, loc.path, loc.relPath, loc.fileName, loc.ext, nowIso())
    return id
  }

  setStatus(id: string, status: DocumentStatus, error: string | null, stat?: { size: number; mtimeMs: number }): void {
    if (stat) {
      this.db
        .prepare(
          `UPDATE documents SET status = ?, error = ?, size = ?, mtime_ms = ?, hash = NULL, content = '', char_count = 0,
             chunk_count = 0 WHERE id = ?`
        )
        .run(status, error, stat.size, stat.mtimeMs, id)
      this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
    } else {
      this.db.prepare('UPDATE documents SET status = ?, error = ? WHERE id = ?').run(status, error, id)
    }
  }

  /** Only the file timestamp changed (same content): keep the index as is. */
  touchFile(id: string, stat: { size: number; mtimeMs: number }): void {
    this.db.prepare('UPDATE documents SET size = ?, mtime_ms = ? WHERE id = ?').run(stat.size, stat.mtimeMs, id)
  }

  /** Atomically replaces the chunks of a document and marks it as indexed. */
  replaceChunks(
    id: string,
    chunks: string[],
    info: { hash: string; content: string; size: number; mtimeMs: number }
  ): void {
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
      const insert = this.db.prepare('INSERT INTO chunks (document_id, ordinal, text) VALUES (?, ?, ?)')
      chunks.forEach((text, i) => insert.run(id, i, text))
      this.db
        .prepare(
          `UPDATE documents SET status = 'indexado', error = NULL, hash = ?, content = ?, char_count = ?, chunk_count = ?,
             size = ?, mtime_ms = ?, indexed_at = ? WHERE id = ?`
        )
        .run(info.hash, info.content, info.content.length, chunks.length, info.size, info.mtimeMs, nowIso(), id)
    })
  }

  setDescription(id: string, description: string): void {
    this.db.prepare('UPDATE documents SET description = ? WHERE id = ?').run(description, id)
  }

  deleteByPath(path: string): DocumentRecord | null {
    const doc = this.getByPath(path)
    if (doc) this.db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id)
    return doc
  }

  /** Deletes every document whose path starts with `prefix` (a removed folder). */
  deleteByPrefix(prefix: string): number {
    const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`)
    const result = this.db.prepare(`DELETE FROM documents WHERE path LIKE ? ESCAPE '\\'`).run(`${escaped}%`)
    return Number(result.changes)
  }

  /** Full extracted text of a document ('' if not indexed yet). */
  content(id: string): string {
    const row = this.db.prepare('SELECT content FROM documents WHERE id = ?').get(id) as Row | undefined
    return row ? str(row, 'content') : ''
  }

  // --- Embeddings ---------------------------------------------------------

  /** Chunks that still need an embedding for `model`, restricted to allowed documents. */
  chunksMissingEmbedding(model: string, limit: number, excludeLocalOnly: boolean): { id: number; text: string }[] {
    const localOnlyClause = excludeLocalOnly
      ? `AND NOT EXISTS (SELECT 1 FROM cases k WHERE k.id = d.case_id AND k.local_only = 1)`
      : ''
    const rows = this.db
      .prepare(
        `SELECT c.id, c.text FROM chunks c JOIN documents d ON d.id = c.document_id
         WHERE (c.embedding IS NULL OR c.embedding_model IS NOT ?) ${localOnlyClause}
         ORDER BY c.id LIMIT ?`
      )
      .all(model, limit) as Row[]
    return rows.map((r) => ({ id: num(r, 'id'), text: str(r, 'text') }))
  }

  saveEmbeddings(model: string, items: { id: number; embedding: number[] }[]): void {
    transaction(this.db, () => {
      const stmt = this.db.prepare('UPDATE chunks SET embedding = ?, embedding_model = ? WHERE id = ?')
      for (const item of items) stmt.run(vectorToBlob(item.embedding), model, item.id)
    })
  }

  embeddedChunks(filter: DocumentFilter, model: string): ChunkWithEmbedding[] {
    const where = filterSql(filter)
    const rows = this.db
      .prepare(
        `SELECT c.id, c.document_id, c.text, c.embedding FROM chunks c JOIN documents d ON d.id = c.document_id
         WHERE ${where.sql} AND c.embedding IS NOT NULL AND c.embedding_model = ?`
      )
      .all(...where.params, model) as Row[]
    const result: ChunkWithEmbedding[] = []
    for (const r of rows) {
      const embedding = blobToVector(r['embedding'])
      if (embedding) result.push({ id: num(r, 'id'), documentId: str(r, 'document_id'), text: str(r, 'text'), embedding })
    }
    return result
  }
}

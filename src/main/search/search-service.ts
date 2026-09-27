import type { DocumentScope, SearchHit } from '@shared/types'
import type { Embedder } from '../ai/ai-service'
import type { Db } from '../db/database'
import { filterSql, type DocumentFilter, type DocumentsRepo } from '../db/documents-repo'
import { num, str, type Row } from '../db/util'
import { errorMessage } from '../errors'
import { createLogger } from '../logger'

const log = createLogger('search')

/** Very common Spanish words that add noise to keyword search. */
const STOPWORDS = new Set(
  (
    'a al algo ante antes como con contra cual cuando de del desde donde dos e el ella ellas ellos en entre era es esa ' +
    'ese eso esta este esto estos fue ha han hasta hay la las le les lo los mas me mi mis muy no nos o para pero por que ' +
    'quien se ser si sin sobre son su sus tambien te tiene todo tu un una uno unos y ya yo cual cuales qué cómo cuál dónde'
  ).split(' ')
)

/**
 * Turns free text into a safe FTS5 query: words are quoted (no syntax injection),
 * prefix-matched (Spanish inflections) and OR-ed (ranking by bm25 does the rest).
 */
export function buildFtsQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2 && !STOPWORDS.has(w))
  const unique = [...new Set(words)].slice(0, 24)
  if (unique.length === 0) return null
  return unique.map((w) => `"${w}"*`).join(' OR ')
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Reciprocal Rank Fusion: combines ranked lists without comparing their raw scores. */
export function reciprocalRankFusion(lists: number[][], k = 60): Map<number, number> {
  const scores = new Map<number, number>()
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)))
  }
  return scores
}

export interface SearchOptions extends DocumentFilter {
  limit?: number
  /** Restrict results to these documents. */
  documentIds?: string[]
}

/**
 * Hybrid search over a case (and optionally the library):
 * keyword search (SQLite FTS5, bm25) + semantic search (cosine over stored embeddings), fused with RRF.
 * Semantic search is skipped silently when no embedder is available.
 */
export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly documents: DocumentsRepo,
    private readonly embedderFor: (restricted: boolean) => Embedder | null
  ) {}

  private keywordSearch(query: string, opts: SearchOptions, limit: number): number[] {
    const fts = buildFtsQuery(query)
    if (!fts) return []
    const where = filterSql(opts)
    const docFilter = opts.documentIds?.length ? `AND d.id IN (${opts.documentIds.map(() => '?').join(',')})` : ''
    const rows = this.db
      .prepare(
        `SELECT c.id FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN documents d ON d.id = c.document_id
         WHERE chunks_fts MATCH ? AND ${where.sql} ${docFilter}
         ORDER BY bm25(chunks_fts) LIMIT ?`
      )
      .all(fts, ...where.params, ...(opts.documentIds ?? []), limit) as Row[]
    return rows.map((r) => num(r, 'id'))
  }

  private async semanticSearch(query: string, opts: SearchOptions, restricted: boolean, limit: number): Promise<number[]> {
    const embedder = this.embedderFor(restricted)
    if (!embedder) return []
    let candidates = this.documents.embeddedChunks(opts, embedder.key)
    if (opts.documentIds?.length) {
      const allowed = new Set(opts.documentIds)
      candidates = candidates.filter((c) => allowed.has(c.documentId))
    }
    if (candidates.length === 0) return []
    try {
      const [queryVector] = await embedder.embed([query])
      if (!queryVector) return []
      return candidates
        .map((c) => ({ id: c.id, score: cosineSimilarity(queryVector, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((c) => c.id)
    } catch (err) {
      log.warn('Búsqueda semántica no disponible, se usa solo búsqueda por palabras:', errorMessage(err))
      return []
    }
  }

  async search(query: string, opts: SearchOptions, restricted: boolean): Promise<SearchHit[]> {
    const limit = opts.limit ?? 8
    const pool = Math.max(limit * 3, 20)
    const [keyword, semantic] = await Promise.all([
      Promise.resolve(this.keywordSearch(query, opts, pool)),
      this.semanticSearch(query, opts, restricted, pool)
    ])
    const fused = reciprocalRankFusion([keyword, semantic])
    const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    if (ranked.length === 0) return []
    return this.hydrate(ranked)
  }

  private hydrate(ranked: [number, number][]): SearchHit[] {
    const ids = ranked.map(([id]) => id)
    const rows = this.db
      .prepare(
        `SELECT c.id, c.text, d.id AS document_id, d.file_name, d.rel_path, d.scope
         FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Row[]
    const byId = new Map(rows.map((r) => [num(r, 'id'), r]))
    return ranked
      .map(([id, score]) => {
        const r = byId.get(id)
        if (!r) return null
        return {
          chunkId: id,
          documentId: str(r, 'document_id'),
          fileName: str(r, 'file_name'),
          relPath: str(r, 'rel_path'),
          scope: str(r, 'scope') as DocumentScope,
          text: str(r, 'text'),
          score
        }
      })
      .filter((h): h is SearchHit => h !== null)
  }
}

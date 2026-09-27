import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import type { DocumentScope, IndexingStatus } from '@shared/types'
import type { Embedder } from '../ai/ai-service'
import type { DocumentsRepo } from '../db/documents-repo'
import { UserError, errorMessage } from '../errors'
import { createLogger } from '../logger'
import { isIgnoredFile, isInside } from '../workspace'
import { chunkText } from './chunker'
import { SUPPORTED_EXTENSIONS, extensionOf, extractText, unsupportedReason } from './extract'

const log = createLogger('indexer')

/** Files we list (even if unreadable) so the user sees why they are not used. */
const LISTED_UNSUPPORTED = new Set(['.doc', '.rtf', '.odt', '.jpg', '.jpeg', '.png'])

const EMBED_BATCH = 32
const EMBED_RETRY_MS = 5 * 60_000

/** A folder whose files are indexed under one scope (a case folder or the library). */
export interface IndexRoot {
  dir: string
  scope: DocumentScope
  caseId: string | null
}

export interface IndexerDeps {
  documents: DocumentsRepo
  /** Embedder allowed for unrestricted content, or null if semantic search is off. */
  embedder: () => Embedder | null
  /** True when all content must stay local (global privacy switch). */
  globallyRestricted: () => boolean
  onStatus?: (status: IndexingStatus) => void
  onChanged?: (caseId: string | null) => void
}

type Job = { kind: 'file'; path: string; force: boolean } | { kind: 'scan'; root: IndexRoot }

/**
 * Keeps the SQLite index in sync with the files on disk.
 *
 * Pipeline per file: stat -> hash -> extract text -> chunk -> store (FTS updated by triggers).
 * Embeddings are computed afterwards in the background (`backfillEmbeddings`), so documents
 * are searchable by keywords immediately even when the embedding model is slow or offline.
 */
export class Indexer {
  private readonly roots = new Map<string, IndexRoot>()
  private readonly jobs: Job[] = []
  private readonly queuedFiles = new Map<string, Job>()
  private running = false
  private currentFile: string | null = null
  private idleWaiters: (() => void)[] = []
  private changedScopes = new Set<string | null>()
  private flushTimer: NodeJS.Timeout | null = null
  private embeddingPausedUntil = 0

  constructor(private readonly deps: IndexerDeps) {}

  addRoot(root: IndexRoot): void {
    this.roots.set(root.dir, root)
  }

  removeRoot(dir: string): void {
    this.roots.delete(dir)
  }

  getRoots(): IndexRoot[] {
    return [...this.roots.values()]
  }

  /** The most specific root containing `path`. */
  rootFor(path: string): IndexRoot | null {
    let best: IndexRoot | null = null
    for (const root of this.roots.values()) {
      if (isInside(root.dir, path) && (!best || root.dir.length > best.dir.length)) best = root
    }
    return best
  }

  status(): IndexingStatus {
    return { pending: this.jobs.length, running: this.running, currentFile: this.currentFile }
  }

  scan(root: IndexRoot): void {
    this.push({ kind: 'scan', root })
  }

  scanAll(): void {
    for (const root of this.roots.values()) this.scan(root)
  }

  enqueue(path: string, force = false): void {
    const existing = this.queuedFiles.get(path)
    if (existing && existing.kind === 'file') {
      existing.force ||= force
      return
    }
    const job: Job = { kind: 'file', path, force }
    this.queuedFiles.set(path, job)
    this.push(job)
  }

  /** A file was deleted from disk. */
  remove(path: string): void {
    const doc = this.deps.documents.deleteByPath(path)
    if (doc) this.markChanged(doc.caseId)
  }

  /** A folder was deleted from disk. */
  removeFolder(dir: string): void {
    const root = this.rootFor(dir)
    const prefix = dir.endsWith(sep) ? dir : `${dir}${sep}`
    if (this.deps.documents.deleteByPrefix(prefix) > 0) this.markChanged(root?.caseId ?? null)
  }

  /** Resolves when the queue is empty (used by tests and shutdown). */
  idle(): Promise<void> {
    if (!this.running && this.jobs.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private push(job: Job): void {
    this.jobs.push(job)
    this.emitStatus()
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.jobs.length > 0) {
        const job = this.jobs.shift()!
        try {
          if (job.kind === 'scan') await this.runScan(job.root)
          else {
            this.queuedFiles.delete(job.path)
            await this.processFile(job.path, job.force)
          }
        } catch (err) {
          log.error('Error inesperado en el indexador', err)
        }
        this.emitStatus()
      }
      await this.backfillEmbeddings()
    } finally {
      this.running = false
      this.currentFile = null
      this.emitStatus()
      this.flushChanged()
      const waiters = this.idleWaiters
      this.idleWaiters = []
      waiters.forEach((w) => w())
    }
  }

  private async runScan(root: IndexRoot): Promise<void> {
    const onDisk = new Set<string>()
    for await (const file of walk(root.dir)) {
      const ext = extensionOf(file)
      if (!SUPPORTED_EXTENSIONS.has(ext) && !LISTED_UNSUPPORTED.has(ext)) continue
      onDisk.add(file)
      const known = this.deps.documents.getByPath(file)
      if (!known || known.status === 'pendiente') {
        this.enqueue(file)
        continue
      }
      try {
        const st = await stat(file)
        if (st.size !== known.size || Math.abs(st.mtimeMs - known.mtimeMs) > 1) this.enqueue(file)
      } catch {
        // Vanished between listing and stat; handled below as deleted.
        onDisk.delete(file)
      }
    }
    for (const path of this.deps.documents.pathsFor(root.scope, root.caseId)) {
      if (isInside(root.dir, path) && !onDisk.has(path) && !this.rootIsMoreSpecific(root, path)) this.remove(path)
    }
  }

  /** Avoids a parent root deleting documents that belong to a nested root. */
  private rootIsMoreSpecific(root: IndexRoot, path: string): boolean {
    const owner = this.rootFor(path)
    return owner !== null && owner.dir !== root.dir
  }

  private async processFile(path: string, force: boolean): Promise<void> {
    const root = this.rootFor(path)
    if (!root || isIgnoredFile(path)) return
    const ext = extensionOf(path)
    if (!SUPPORTED_EXTENSIONS.has(ext) && !LISTED_UNSUPPORTED.has(ext)) return

    let st
    try {
      st = await stat(path)
      if (!st.isFile()) return
    } catch {
      this.remove(path)
      return
    }

    this.currentFile = basename(path)
    this.emitStatus()

    const docs = this.deps.documents
    const id = docs.upsertLocation({
      scope: root.scope,
      caseId: root.caseId,
      path,
      relPath: relative(root.dir, path),
      fileName: basename(path),
      ext
    })
    const fileStat = { size: st.size, mtimeMs: st.mtimeMs }

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      docs.setStatus(id, 'no_soportado', unsupportedReason(path), fileStat)
      this.markChanged(root.caseId)
      return
    }

    try {
      const buffer = await readFile(path)
      const hash = createHash('sha256').update(buffer).digest('hex')
      const known = docs.getByPath(path)
      if (!force && known?.status === 'indexado' && known.hash === hash) {
        docs.touchFile(id, fileStat)
        return
      }
      const content = await extractText(path)
      docs.replaceChunks(id, chunkText(content), { hash, content, ...fileStat })
      log.info(`Indexado: ${path}`)
    } catch (err) {
      const message = err instanceof UserError ? err.message : `No se pudo procesar: ${errorMessage(err)}`
      if (!(err instanceof UserError)) log.error(`Error indexando ${path}`, err)
      docs.setStatus(id, 'error', message, fileStat)
    }
    this.markChanged(root.caseId)
  }

  /** Recomputes missing/stale embeddings in the background (e.g. after a model change). */
  refreshEmbeddings(): void {
    this.embeddingPausedUntil = 0
    void this.drain()
  }

  /**
   * Computes missing embeddings in batches. On a provider error (e.g. Ollama closed) it stops
   * and waits EMBED_RETRY_MS before trying again, so the UI does not look permanently busy.
   */
  private async backfillEmbeddings(): Promise<void> {
    if (Date.now() < this.embeddingPausedUntil) return
    const embedder = this.deps.embedder()
    if (!embedder) return
    if (!embedder.isLocal && this.deps.globallyRestricted()) return
    const excludeLocalOnly = !embedder.isLocal
    let total = 0
    for (;;) {
      if (this.jobs.length > 0) return // New files first; drain() will call us again.
      const batch = this.deps.documents.chunksMissingEmbedding(embedder.key, EMBED_BATCH, excludeLocalOnly)
      if (batch.length === 0) break
      this.currentFile = `Preparando búsqueda inteligente (${total} fragmentos)`
      this.emitStatus()
      try {
        const vectors = await embedder.embed(batch.map((c) => c.text))
        this.deps.documents.saveEmbeddings(
          embedder.key,
          batch.map((c, i) => ({ id: c.id, embedding: vectors[i] ?? [] })).filter((x) => x.embedding.length > 0)
        )
        total += batch.length
      } catch (err) {
        log.warn('No se pudieron calcular embeddings; se reintentará más tarde:', errorMessage(err))
        this.embeddingPausedUntil = Date.now() + EMBED_RETRY_MS
        return
      }
    }
    if (total > 0) {
      log.info(`Embeddings calculados: ${total}`)
      for (const root of this.roots.values()) this.markChanged(root.caseId)
    }
  }

  private emitStatus(): void {
    this.deps.onStatus?.(this.status())
  }

  private markChanged(caseId: string | null): void {
    this.changedScopes.add(caseId)
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flushChanged(), 800)
  }

  private flushChanged(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    const scopes = [...this.changedScopes]
    this.changedScopes.clear()
    for (const caseId of scopes) this.deps.onChanged?.(caseId)
  }
}

/** Recursively yields files under `dir`, skipping hidden folders and temp files. */
export async function* walk(dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && !isIgnoredFile(full)) yield full
  }
}

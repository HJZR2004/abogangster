import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Embedder } from '../src/main/ai/ai-service'
import { createRepos, openDatabase, type Db, type Repos } from '../src/main/db'
import { Indexer } from '../src/main/ingestion/indexer'
import { SearchService } from '../src/main/search/search-service'
import { tempDir } from './helpers'

/** Toy embedding: one dimension per concept, so synonyms land close together. */
const CONCEPTS: string[][] = [
  ['pago', 'pagó', 'transferencia', 'dinero', 'liquidó', 'abono'],
  ['obra', 'construcción', 'bodega', 'cimentación'],
  ['perro', 'gato', 'mascota']
]
function fakeEmbedder(isLocal: boolean, calls: string[][] = []): Embedder {
  return {
    key: 'fake:concepts',
    isLocal,
    embed: async (values) => {
      calls.push(values)
      return values.map((v) => {
        const text = v.toLowerCase()
        return CONCEPTS.map((words) => words.filter((w) => text.includes(w)).length + 0.01)
      })
    }
  }
}

let db: Db
let repos: Repos
let root: string
let cleanup: () => void

beforeEach(() => {
  const t = tempDir()
  cleanup = t.cleanup
  root = t.dir
  db = openDatabase(join(root, 'test.db'))
  repos = createRepos(db, join(root, 'Plantillas'))
})

afterEach(() => {
  db.close()
  cleanup()
})

function makeCase(title: string, localOnly: boolean): { id: string; dir: string } {
  const dir = join(root, title)
  mkdirSync(dir, { recursive: true })
  const c = repos.cases.create(
    { title, clientName: '', caseNumber: '', court: '', counterparty: '', description: '', status: 'activo', localOnly },
    dir
  )
  return { id: c.id, dir }
}

describe('semantic search', () => {
  it('finds documents by meaning even without shared keywords', async () => {
    const c = makeCase('caso', false)
    writeFileSync(join(c.dir, 'recibo.txt'), 'El cliente liquidó la estimación con una transferencia bancaria.')
    writeFileSync(join(c.dir, 'otro.txt'), 'La mascota del vecino es un gato.')
    const embedder = fakeEmbedder(false)
    const indexer = new Indexer({ documents: repos.documents, embedder: () => embedder, globallyRestricted: () => false })
    indexer.addRoot({ dir: c.dir, scope: 'case', caseId: c.id })
    indexer.scanAll()
    await indexer.idle()

    expect(repos.documents.list(c.id).every((d) => d.embeddedChunkCount === d.chunkCount)).toBe(true)

    const search = new SearchService(db, repos.documents, () => embedder)
    // "dinero" appears in no document: only the semantic side can find it.
    const hits = await search.search('¿Hubo algún abono de dinero?', { caseId: c.id, includeLibrary: false }, false)
    expect(hits[0]?.fileName).toBe('recibo.txt')
  })

  it('never sends confidential cases to a cloud embedder', async () => {
    const secret = makeCase('secreto', true)
    const normal = makeCase('normal', false)
    writeFileSync(join(secret.dir, 'a.txt'), 'Información confidencial sobre el pago.')
    writeFileSync(join(normal.dir, 'b.txt'), 'Información pública sobre la obra.')
    const calls: string[][] = []
    const cloud = fakeEmbedder(false, calls)
    const indexer = new Indexer({ documents: repos.documents, embedder: () => cloud, globallyRestricted: () => false })
    indexer.addRoot({ dir: secret.dir, scope: 'case', caseId: secret.id })
    indexer.addRoot({ dir: normal.dir, scope: 'case', caseId: normal.id })
    indexer.scanAll()
    await indexer.idle()

    const sent = calls.flat().join(' ')
    expect(sent).toContain('pública')
    expect(sent).not.toContain('confidencial')
    expect(repos.documents.list(secret.id)[0]!.embeddedChunkCount).toBe(0)
    // Keyword search still works for the confidential case.
    const search = new SearchService(db, repos.documents, (restricted) => (restricted ? null : cloud))
    const hits = await search.search('confidencial', { caseId: secret.id, includeLibrary: false }, true)
    expect(hits).toHaveLength(1)
  })

  it('pauses after an embedding failure instead of retrying on every change', async () => {
    const c = makeCase('caso', false)
    writeFileSync(join(c.dir, 'a.txt'), 'texto de prueba')
    let attempts = 0
    const failing: Embedder = {
      key: 'fake:fail',
      isLocal: true,
      embed: async () => {
        attempts++
        throw new Error('ECONNREFUSED')
      }
    }
    const indexer = new Indexer({ documents: repos.documents, embedder: () => failing, globallyRestricted: () => false })
    indexer.addRoot({ dir: c.dir, scope: 'case', caseId: c.id })
    indexer.scanAll()
    await indexer.idle()
    writeFileSync(join(c.dir, 'b.txt'), 'otro texto')
    indexer.scanAll()
    await indexer.idle()
    expect(attempts).toBe(1)
    expect(repos.documents.list(c.id).every((d) => d.status === 'indexado')).toBe(true)

    indexer.refreshEmbeddings()
    await indexer.idle()
    expect(attempts).toBe(2)
  })
})

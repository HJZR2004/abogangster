import { describe, expect, it } from 'vitest'
import { countPending, stripMarkdown } from '@shared/text'
import { chunkText } from '../src/main/ingestion/chunker'
import { normalizeText } from '../src/main/ingestion/extract'
import { buildFtsQuery, cosineSimilarity, reciprocalRankFusion } from '../src/main/search/search-service'
import { isInside, safeFileName } from '../src/main/workspace'

describe('chunkText', () => {
  it('keeps short texts in one chunk', () => {
    expect(chunkText('Hola mundo.\nSegundo párrafo.')).toEqual(['Hola mundo.\nSegundo párrafo.'])
  })

  it('splits long texts under the size limit with overlap', () => {
    const paragraph = 'El demandado niega el hecho número uno por ser falso. '.repeat(10).trim()
    const text = Array.from({ length: 12 }, () => paragraph).join('\n\n')
    const chunks = chunkText(text, { size: 1200, overlap: 200 })
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1200)
    // Overlap: the start of chunk 2 repeats the end of chunk 1.
    const tailOfFirst = chunks[0]!.slice(-50)
    expect(chunks[1]!.includes(tailOfFirst.slice(-20))).toBe(true)
  })

  it('splits a single gigantic paragraph', () => {
    const chunks = chunkText('a'.repeat(5000), { size: 1000, overlap: 0 })
    expect(chunks.length).toBe(5)
  })
})

describe('normalizeText', () => {
  it('collapses whitespace but keeps paragraphs', () => {
    expect(normalizeText('  Uno   dos\r\n\r\n\r\n\r\nTres cuatro  ')).toBe('Uno dos\n\nTres cuatro')
  })
})

describe('buildFtsQuery', () => {
  it('quotes words, drops stopwords and uses prefix matching', () => {
    expect(buildFtsQuery('¿Cuál es la fecha de la demanda?')).toBe('"fecha"* OR "demanda"*')
  })

  it('neutralizes FTS syntax', () => {
    expect(buildFtsQuery('pago" OR 1=1 NEAR(')).toBe('"pago"* OR "or"* OR "near"*')
  })

  it('returns null when nothing is searchable', () => {
    expect(buildFtsQuery('de la y')).toBeNull()
  })
})

describe('vector math', () => {
  it('cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it('RRF favors items ranked well in both lists', () => {
    const scores = reciprocalRankFusion([
      [1, 2, 3],
      [3, 1, 4]
    ])
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    expect(ranked[0]).toBe(1)
    expect(ranked).toContain(4)
  })
})

describe('text helpers', () => {
  it('counts pending markers', () => {
    expect(countPending('Fecha: [COMPLETAR: fecha de notificación] y [completar monto]')).toBe(2)
  })

  it('strips markdown', () => {
    expect(stripMarkdown('## HECHOS\n\n**Primero.** El actor...\n* punto')).toBe('HECHOS\n\nPrimero. El actor...\n- punto')
  })

  it('safeFileName removes Windows-invalid characters', () => {
    expect(safeFileName('Juicio: García vs. "López" / 2024?')).toBe('Juicio García vs. López 2024')
    expect(safeFileName('...')).toBe('Sin nombre')
  })

  it('isInside', () => {
    expect(isInside('/a/b', '/a/b/c.txt')).toBe(true)
    expect(isInside('/a/b', '/a/bc/d.txt')).toBe(false)
    expect(isInside('/a/b', '/a')).toBe(false)
  })
})

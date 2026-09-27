import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserError } from '../src/main/errors'
import { extractText } from '../src/main/ingestion/extract'
import { textToDocx } from '../src/main/templates/docx-writer'
import { tempDir } from './helpers'

/** Builds a tiny valid one-page PDF containing `text` (Helvetica, ASCII only). */
function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

let cleanup = (): void => {}
afterEach(() => cleanup())

describe('extractText', () => {
  it('reads PDF, DOCX and TXT', async () => {
    const t = tempDir()
    cleanup = t.cleanup
    writeFileSync(join(t.dir, 'a.pdf'), minimalPdf('Demanda de amparo indirecto'))
    writeFileSync(join(t.dir, 'b.docx'), await textToDocx('Primer párrafo.\nSegundo párrafo.'))
    writeFileSync(join(t.dir, 'c.txt'), 'Texto   con   espacios')
    expect(await extractText(join(t.dir, 'a.pdf'))).toContain('Demanda de amparo indirecto')
    expect(await extractText(join(t.dir, 'b.docx'))).toBe('Primer párrafo.\n\nSegundo párrafo.')
    expect(await extractText(join(t.dir, 'c.txt'))).toBe('Texto con espacios')
  })

  it('gives actionable errors', async () => {
    const t = tempDir()
    cleanup = t.cleanup
    writeFileSync(join(t.dir, 'roto.docx'), 'esto no es un docx')
    writeFileSync(join(t.dir, 'vacio.txt'), '   ')
    await expect(extractText(join(t.dir, 'roto.docx'))).rejects.toThrow(/dañado/)
    await expect(extractText(join(t.dir, 'vacio.txt'))).rejects.toBeInstanceOf(UserError)
  })
})

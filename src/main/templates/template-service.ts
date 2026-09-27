import { existsSync } from 'node:fs'
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import type { TemplateRecord, TemplateUpdate } from '@shared/types'
import type { TemplatesRepo } from '../db/templates-repo'
import { UserError, errorMessage } from '../errors'
import { createLogger } from '../logger'
import { isIgnoredFile } from '../workspace'
import { EXAMPLE_TEMPLATES } from './docx-writer'
import { mergeFieldConfigs } from './fields'

const log = createLogger('templates')

const DELIMITERS = { start: '{{', end: '}}' }
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g

function createDoc(buffer: Buffer): Docxtemplater {
  return new Docxtemplater(new PizZip(buffer), {
    delimiters: DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
    nullGetter: () => ''
  })
}

/** Converts docxtemplater's error into a message the user can act on. */
function describeTemplateError(err: unknown): string {
  const errors = (err as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors
  const details = errors
    ?.map((e) => e.properties?.explanation)
    .filter(Boolean)
    .slice(0, 3)
    .join('; ')
  return `La plantilla tiene campos mal escritos. Revise que cada campo tenga la forma {{nombre}}. ${details ?? errorMessage(err)}`
}

/** Placeholder names in document order, without duplicates or loop/condition tags. */
export function detectPlaceholders(buffer: Buffer): string[] {
  const text = createDoc(buffer).getFullText()
  const names: string[] = []
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1]!.trim()
    // Skip loop/condition syntax ({{#x}}, {{/x}}, {{^x}}, {{@raw}}, {{.}}).
    if (/^[#/^@.]/.test(name) || names.includes(name)) continue
    names.push(name)
  }
  return names
}

export function renderTemplate(buffer: Buffer, values: Record<string, string>): Buffer {
  let doc: Docxtemplater
  try {
    doc = createDoc(buffer)
    doc.render(values)
  } catch (err) {
    throw new UserError(describeTemplateError(err), { cause: err })
  }
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * Templates are the .docx files in the workspace "Plantillas" folder. The database stores
 * what the user configures on top (name, rules, per-field instructions); the file stays the
 * source of truth for the format.
 */
export class TemplateService {
  constructor(
    private readonly repo: TemplatesRepo,
    private readonly dir: string
  ) {}

  list(): TemplateRecord[] {
    return this.repo.list()
  }

  get(id: string): TemplateRecord {
    const t = this.repo.get(id)
    if (!t) throw new UserError('La plantilla ya no existe.')
    return t
  }

  update(id: string, update: TemplateUpdate): TemplateRecord {
    const t = this.repo.update(id, update)
    if (!t) throw new UserError('La plantilla ya no existe.')
    return t
  }

  /** Writes the example templates on the very first run (empty folder). */
  async seedExamples(): Promise<void> {
    const existing = (await readdir(this.dir)).filter((f) => f.toLowerCase().endsWith('.docx'))
    if (existing.length > 0) return
    for (const example of EXAMPLE_TEMPLATES) {
      await writeFile(join(this.dir, example.fileName), await example.build())
      this.repo.insert(example.fileName, {
        name: example.name,
        description: example.description,
        rules: example.rules,
        fields: [],
        error: null
      })
    }
    log.info('Plantillas de ejemplo creadas')
  }

  /** Reconciles the database with the .docx files present in the folder. */
  async sync(): Promise<void> {
    const files = (await readdir(this.dir)).filter((f) => f.toLowerCase().endsWith('.docx') && !isIgnoredFile(f))
    for (const fileName of files) {
      let fields: string[] = []
      let error: string | null = null
      try {
        fields = detectPlaceholders(await readFile(join(this.dir, fileName)))
        if (fields.length === 0) error = 'La plantilla no tiene campos {{...}}; la IA no sabrá dónde escribir.'
      } catch (err) {
        error = describeTemplateError(err)
      }
      const existing = this.repo.getByFileName(fileName)
      if (existing) {
        this.repo.updateDetected(existing.id, mergeFieldConfigs(fields, existing.fields), error)
      } else {
        this.repo.insert(fileName, {
          name: fileName.replace(/\.docx$/i, ''),
          description: '',
          rules: '',
          fields: mergeFieldConfigs(fields, []),
          error
        })
      }
    }
    for (const t of this.repo.list()) {
      if (!files.includes(t.fileName)) this.repo.delete(t.id)
    }
  }

  /** Copies .docx files into the templates folder. Returns how many were added. */
  async import(paths: string[]): Promise<number> {
    let count = 0
    for (const path of paths) {
      if (!path.toLowerCase().endsWith('.docx')) continue
      let target = join(this.dir, basename(path))
      for (let i = 2; existsSync(target); i++) target = join(this.dir, basename(path).replace(/\.docx$/i, ` (${i}).docx`))
      await copyFile(path, target)
      count++
    }
    await this.sync()
    return count
  }

  async render(templateId: string, values: Record<string, string>): Promise<Buffer> {
    const t = this.get(templateId)
    if (!existsSync(t.path)) throw new UserError(`No se encontró el archivo de la plantilla: ${t.fileName}`)
    return renderTemplate(await readFile(t.path), values)
  }
}

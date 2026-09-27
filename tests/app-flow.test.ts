import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import mammoth from 'mammoth'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CaseInput } from '@shared/types'
import { AppContext } from '../src/main/app-context'
import { DraftingService } from '../src/main/services/drafting-service'
import { ChatService } from '../src/main/services/chat-service'
import { textToDocx } from '../src/main/templates/docx-writer'
import { detectPlaceholders } from '../src/main/templates/template-service'
import { CASE_DOCUMENTS_DIR, CASE_OUTPUT_DIR } from '../src/main/workspace'
import { createSettings, fakeStreamer, tempDir } from './helpers'

const CASE: CaseInput = {
  title: 'García contra Constructora del Norte',
  clientName: 'Juan García López',
  caseNumber: '123/2026',
  court: 'Juzgado Tercero de lo Civil',
  counterparty: 'Constructora del Norte S.A. de C.V.',
  description: 'Demanda por supuesto incumplimiento de contrato de obra. Nuestro cliente es el demandado.',
  status: 'activo',
  localOnly: false
}

const DEMANDA = [
  'DEMANDA',
  'HECHOS',
  '1. El 5 de enero de 2026 las partes celebraron un contrato de obra.',
  '2. El demandado no pagó la segunda estimación por la cantidad de 150,000 pesos.',
  '3. La obra se entregó con defectos en la cimentación.'
].join('\n')

let ctx: AppContext
let cleanup: () => void
const events: { channel: string; payload: unknown }[] = []

beforeEach(async () => {
  const t = tempDir()
  cleanup = t.cleanup
  events.length = 0
  ctx = new AppContext(createSettings(t.dir), (channel, payload) => events.push({ channel, payload }))
  await ctx.start({ watch: false })
  await ctx.indexer.idle()
})

afterEach(async () => {
  await ctx.stop()
  cleanup()
})

describe('first run', () => {
  it('creates the workspace and the example templates', () => {
    expect(existsSync(ctx.paths.cases)).toBe(true)
    expect(existsSync(ctx.paths.library)).toBe(true)
    const templates = ctx.templates.list()
    expect(templates.map((t) => t.name)).toContain('Contestación de demanda (ejemplo)')
    const contestacion = templates.find((t) => t.name.startsWith('Contestación'))!
    expect(contestacion.error).toBeNull()
    const names = contestacion.fields.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['expediente', 'contestacion_hechos', 'puntos_petitorios', 'fecha']))
    expect(contestacion.fields.find((f) => f.name === 'expediente')!.mode).toBe('manual')
    expect(contestacion.fields.find((f) => f.name === 'contestacion_hechos')!.mode).toBe('ia')
    expect(contestacion.rules).toContain('Contestar todos')
  })
})

describe('cases and documents', () => {
  it('creates a case folder, imports and indexes documents, and searches accent-insensitively', async () => {
    const c = ctx.cases.create(CASE)
    expect(existsSync(join(c.folderPath, CASE_DOCUMENTS_DIR))).toBe(true)
    expect(existsSync(join(c.folderPath, CASE_OUTPUT_DIR))).toBe(true)

    // Source files outside the workspace, like the lawyer's existing folders.
    const outside = join(ctx.paths.root, '..', 'origen')
    mkdirSync(join(outside, 'subcarpeta'), { recursive: true })
    writeFileSync(join(outside, 'demanda.docx'), await textToDocx(DEMANDA))
    writeFileSync(join(outside, 'subcarpeta', 'notas.txt'), 'El cliente afirma que sí pagó mediante transferencia bancaria.')
    writeFileSync(join(outside, 'viejo.doc'), 'binario')
    writeFileSync(join(outside, '~$demanda.docx'), 'lock file de Word')

    const copied = await ctx.cases.importPaths(c.id, [join(outside, 'demanda.docx'), join(outside, 'subcarpeta'), join(outside, 'viejo.doc')])
    expect(copied).toBe(3)
    await ctx.indexer.idle()

    const docs = ctx.repos.documents.list(c.id)
    expect(docs.map((d) => d.fileName).sort()).toEqual(['demanda.docx', 'notas.txt', 'viejo.doc'])
    expect(docs.find((d) => d.fileName === 'demanda.docx')!.status).toBe('indexado')
    expect(docs.find((d) => d.fileName === 'viejo.doc')!.status).toBe('no_soportado')
    expect(docs.find((d) => d.fileName === 'viejo.doc')!.error).toMatch(/Guardar como/)

    const hits = await ctx.search.search('cimentacion', { caseId: c.id, includeLibrary: true }, false)
    expect(hits[0]?.fileName).toBe('demanda.docx')

    const summary = ctx.cases.get(c.id)
    expect(summary.documentCount).toBe(3)
    expect(summary.indexedCount).toBe(2)
    expect(events.some((e) => e.channel === 'documents:changed')).toBe(true)
  })

  it('keeps cases isolated and shares the library', async () => {
    const a = ctx.cases.create(CASE)
    const b = ctx.cases.create({ ...CASE, title: 'Otro asunto' })
    writeFileSync(join(a.folderPath, CASE_DOCUMENTS_DIR, 'a.txt'), 'pagaré firmado por el deudor')
    writeFileSync(join(ctx.paths.library, 'codigo.txt'), 'Artículo 1. El pagaré es un título de crédito.')
    ctx.indexer.scanAll()
    await ctx.indexer.idle()

    const inB = await ctx.search.search('pagaré', { caseId: b.id, includeLibrary: true }, false)
    expect(inB.map((h) => h.fileName)).toEqual(['codigo.txt'])
    const inA = await ctx.search.search('pagaré', { caseId: a.id, includeLibrary: true }, false)
    expect(inA.map((h) => h.fileName).sort()).toEqual(['a.txt', 'codigo.txt'])
  })

  it('reindexes changed files and forgets deleted ones', async () => {
    const c = ctx.cases.create(CASE)
    const file = join(c.folderPath, CASE_DOCUMENTS_DIR, 'nota.txt')
    writeFileSync(file, 'primera versión con palabra manzana')
    ctx.indexer.scanAll()
    await ctx.indexer.idle()
    expect((await ctx.search.search('manzana', { caseId: c.id, includeLibrary: false }, false)).length).toBe(1)

    writeFileSync(file, 'segunda versión con palabra naranja y más texto')
    ctx.indexer.enqueue(file)
    await ctx.indexer.idle()
    expect((await ctx.search.search('manzana', { caseId: c.id, includeLibrary: false }, false)).length).toBe(0)
    expect((await ctx.search.search('naranja', { caseId: c.id, includeLibrary: false }, false)).length).toBe(1)

    rmSync(file)
    ctx.indexer.scanAll()
    await ctx.indexer.idle()
    expect(ctx.repos.documents.list(c.id)).toHaveLength(0)
  })

  it('deleting a case keeps its files on disk', () => {
    const c = ctx.cases.create(CASE)
    ctx.cases.delete(c.id)
    expect(ctx.cases.list()).toHaveLength(0)
    expect(existsSync(c.folderPath)).toBe(true)
  })
})

describe('drafting', () => {
  async function setupCase() {
    const c = ctx.cases.create(CASE)
    writeFileSync(join(c.folderPath, CASE_DOCUMENTS_DIR, 'demanda.docx'), await textToDocx(DEMANDA))
    ctx.indexer.scanAll()
    await ctx.indexer.idle()
    const demanda = ctx.repos.documents.list(c.id)[0]!
    return { c, demanda }
  }

  function drafting(stream: ReturnType<typeof fakeStreamer>) {
    return new DraftingService({
      repos: ctx.repos,
      cases: ctx.cases,
      templates: ctx.templates,
      search: ctx.search,
      ai: ctx.ai,
      stream,
      settings: ctx.settings,
      emit: (e) => events.push({ channel: 'drafts:progress', payload: e })
    })
  }

  it('fills a template section by section and exports a Word file', async () => {
    const { c, demanda } = await setupCase()
    ctx.settings.update({ profile: { ...ctx.settings.get().profile, nombre: 'Lic. Roberto Zárate', ciudad: 'Guadalajara' } })
    const template = ctx.templates.list().find((t) => t.name.startsWith('Contestación'))!
    const stream = fakeStreamer((task) => {
      const section = /sección "([^"]+)"/.exec(task)?.[1] ?? 'desconocida'
      return `**Texto de ${section}.**\n\nSegundo párrafo con [COMPLETAR: dato].`
    })
    const service = drafting(stream)

    const draft = service.create({ caseId: c.id, templateId: template.id, title: '', instructions: 'Negar el hecho 2.', sourceDocumentIds: [demanda.id] })
    expect(draft.title).toBe(template.name)
    expect(draft.fieldValues['expediente']).toBe('123/2026')
    expect(draft.fieldValues['ciudad']).toBe('Guadalajara')
    expect(draft.fieldValues['contestacion_hechos']).toBe('')

    const done = await service.generate(draft.id)
    expect(done.status).toBe('listo')
    const aiFields = template.fields.filter((f) => f.mode === 'ia')
    expect(stream.calls).toHaveLength(aiFields.length)
    // The prompt contains the case, the full source document and the lawyer's instructions.
    expect(stream.calls[0]).toContain('Constructora del Norte')
    expect(stream.calls[0]).toContain('segunda estimación')
    expect(stream.calls[0]).toContain('Negar el hecho 2.')
    // Later sections see the earlier ones.
    expect(stream.calls[1]).toContain('Secciones ya redactadas')
    // Markdown removed.
    expect(done.fieldValues['contestacion_hechos']).toBe('Texto de Contestación a los hechos.\n\nSegundo párrafo con [COMPLETAR: dato].')

    const exported = await service.export(draft.id)
    expect(exported.status).toBe('exportado')
    expect(exported.outputPath).toContain(CASE_OUTPUT_DIR)
    const { value } = await mammoth.extractRawText({ buffer: readFileSync(exported.outputPath!) })
    expect(value).toContain('EXPEDIENTE: 123/2026')
    expect(value).toContain('Texto de Contestación a los hechos.')
    expect(value).not.toContain('{{')

    // The exported file is inside the case folder, so it becomes part of the case index.
    ctx.indexer.scanAll()
    await ctx.indexer.idle()
    expect(ctx.repos.documents.list(c.id).some((d) => d.relPath.startsWith(CASE_OUTPUT_DIR))).toBe(true)
  })

  it('regenerates a single section with an extra instruction', async () => {
    const { c } = await setupCase()
    const template = ctx.templates.list().find((t) => t.name.startsWith('Contestación'))!
    const stream = fakeStreamer((_task, call) => `versión ${call}`)
    const service = drafting(stream)
    const draft = service.create({ caseId: c.id, templateId: template.id, title: 'X', instructions: '', sourceDocumentIds: [] })
    await service.generate(draft.id)
    const before = service.get(draft.id).fieldValues
    const updated = await service.regenerateField(draft.id, 'pruebas', 'Agregar la testimonial')
    expect(stream.calls.at(-1)).toContain('Agregar la testimonial')
    expect(updated.fieldValues['pruebas']).not.toBe(before['pruebas'])
    expect(updated.fieldValues['proemio']).toBe(before['proemio'])
  })

  it('writes free-form drafts and exports them', async () => {
    const { c } = await setupCase()
    const service = drafting(fakeStreamer(() => 'ESCRITO\n\nContenido del escrito.'))
    const draft = service.create({ caseId: c.id, templateId: null, title: 'Solicitud de copias', instructions: '', sourceDocumentIds: [] })
    const done = await service.generate(draft.id)
    expect(done.body).toBe('ESCRITO\n\nContenido del escrito.')
    const exported = await service.export(draft.id)
    const { value } = await mammoth.extractRawText({ buffer: readFileSync(exported.outputPath!) })
    expect(value).toContain('Contenido del escrito.')
  })

  it('refuses cloud models for confidential cases', async () => {
    const { c } = await setupCase()
    ctx.cases.update(c.id, { ...CASE, localOnly: true })
    ctx.settings.update({ chat: { provider: 'anthropic', model: 'claude-sonnet-5' } })
    const service = drafting(fakeStreamer(() => 'no debería llamarse'))
    const draft = service.create({ caseId: c.id, templateId: null, title: 'X', instructions: '', sourceDocumentIds: [] })
    await expect(service.generate(draft.id)).rejects.toThrow(/confidencial/)
    expect(service.get(draft.id).status).toBe('borrador')
    expect(service.get(draft.id).error).toMatch(/confidencial/)
  })
})

describe('chat', () => {
  it('answers with sources and stores the conversation', async () => {
    const c = ctx.cases.create(CASE)
    writeFileSync(join(c.folderPath, CASE_DOCUMENTS_DIR, 'demanda.docx'), await textToDocx(DEMANDA))
    ctx.indexer.scanAll()
    await ctx.indexer.idle()
    const stream = fakeStreamer(() => 'La demanda reclama 150,000 pesos [1].')
    const chat = new ChatService({ repos: ctx.repos, search: ctx.search, ai: ctx.ai, stream, settings: ctx.settings, onDelta: () => {} })
    const answer = await chat.ask(c.id, '¿Cuánto reclama la demanda por la estimación?')
    expect(answer.sources[0]?.fileName).toBe('demanda.docx')
    expect(stream.calls[0]).toContain('150,000')
    expect(chat.history(c.id).map((m) => m.role)).toEqual(['user', 'assistant'])
  })
})

describe('templates', () => {
  it('detects user templates dropped into the folder, and reports broken ones', async () => {
    writeFileSync(join(ctx.paths.templates, 'Mi formato.docx'), await textToDocx('Expediente {{expediente}}\n{{alegatos}}'))
    writeFileSync(join(ctx.paths.templates, 'Roto.docx'), await textToDocx('Campo sin cerrar {{hechos'))
    await ctx.templates.sync()
    const mine = ctx.templates.list().find((t) => t.fileName === 'Mi formato.docx')!
    expect(mine.fields.map((f) => f.name)).toEqual(['expediente', 'alegatos'])
    expect(mine.fields[1]!.label).toBe('Alegatos')
    const broken = ctx.templates.list().find((t) => t.fileName === 'Roto.docx')!
    expect(broken.error).toMatch(/mal escritos/)

    // User edits survive a re-sync.
    ctx.templates.update(mine.id, { ...mine, fields: mine.fields.map((f) => ({ ...f, instruction: 'Muy breve' })) })
    await ctx.templates.sync()
    expect(ctx.templates.get(mine.id).fields[1]!.instruction).toBe('Muy breve')

    rmSync(join(ctx.paths.templates, 'Roto.docx'))
    await ctx.templates.sync()
    expect(ctx.templates.list().some((t) => t.fileName === 'Roto.docx')).toBe(false)
  })

  it('detectPlaceholders ignores loop tags and duplicates', async () => {
    const buffer = await textToDocx('{{a}} {{b}} {{a}} {{#lista}}{{.}}{{/lista}}')
    expect(detectPlaceholders(buffer)).toEqual(['a', 'b'])
  })
})

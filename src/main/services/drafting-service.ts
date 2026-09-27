import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelMessage } from 'ai'
import { BODY_FIELD, type DraftInput, type DraftPatch, type DraftProgressEvent, type DraftRecord, type TemplateRecord } from '@shared/types'
import { stripMarkdown } from '@shared/text'
import type { AiService, TextStreamer } from '../ai/ai-service'
import { buildContext, draftBriefing, fieldTask, freeformTask, systemPrompt, type ContextSource } from '../ai/prompts'
import type { Repos } from '../db'
import { UserError, errorMessage } from '../errors'
import { createLogger } from '../logger'
import type { SearchService } from '../search/search-service'
import type { SettingsStore } from '../settings/settings-store'
import { textToDocx } from '../templates/docx-writer'
import { autoFillValues } from '../templates/fields'
import type { TemplateService } from '../templates/template-service'
import { safeFileName } from '../workspace'
import type { CaseService } from './case-service'

const log = createLogger('drafting')

export interface DraftingServiceDeps {
  repos: Repos
  cases: CaseService
  templates: TemplateService
  search: SearchService
  ai: AiService
  stream: TextStreamer
  settings: SettingsStore
  emit: (event: DraftProgressEvent) => void
}

/** Anthropic prompt caching on the shared context block (ignored by other providers). */
const CACHE_HINT = { anthropic: { cacheControl: { type: 'ephemeral' } } } as const

interface Prepared {
  draft: DraftRecord
  template: TemplateRecord | null
  system: string
  /** Context shared by every section of the draft (cacheable prefix). */
  sharedContext: string
}

/**
 * Creates drafts, has the AI write them section by section, and exports them to Word.
 *
 * Template drafts: each `ia` placeholder is generated in its own call, in document order,
 * seeing the sections already written. This works with small local models and lets the
 * lawyer regenerate a single section.
 */
export class DraftingService {
  private readonly running = new Map<string, AbortController>()

  constructor(private readonly deps: DraftingServiceDeps) {}

  get(id: string): DraftRecord {
    const d = this.deps.repos.drafts.get(id)
    if (!d) throw new UserError('El escrito ya no existe.')
    return d
  }

  create(input: DraftInput): DraftRecord {
    const caseRecord = this.deps.cases.getRecord(input.caseId)
    let values: Record<string, string> = {}
    let title = input.title.trim()
    if (input.templateId) {
      const template = this.deps.templates.get(input.templateId)
      if (template.error && template.fields.length === 0) throw new UserError(template.error)
      values = autoFillValues(template.fields, { caseRecord, profile: this.deps.settings.get().profile, now: new Date() })
      title ||= template.name
    }
    return this.deps.repos.drafts.create({ ...input, title: title || 'Escrito' }, values)
  }

  update(id: string, patch: DraftPatch): DraftRecord {
    const d = this.deps.repos.drafts.patch(id, patch)
    if (!d) throw new UserError('El escrito ya no existe.')
    return d
  }

  delete(id: string): void {
    this.cancel(id)
    this.deps.repos.drafts.delete(id)
  }

  cancel(id: string): void {
    this.running.get(id)?.abort()
  }

  /** Writes every AI section (or the whole body for free-form drafts). */
  async generate(id: string): Promise<DraftRecord> {
    return this.run(id, async (p, signal) => {
      if (!p.template) {
        await this.writeBody(p, '', signal)
        return
      }
      const aiFields = p.template.fields.filter((f) => f.mode === 'ia')
      if (aiFields.length === 0) throw new UserError('Esta plantilla no tiene secciones marcadas para la IA.')
      for (const field of aiFields) await this.writeField(p, field.name, '', signal)
    })
  }

  async regenerateField(id: string, field: string, extraInstruction: string): Promise<DraftRecord> {
    return this.run(id, async (p, signal) => {
      if (field === BODY_FIELD || !p.template) await this.writeBody(p, extraInstruction, signal)
      else await this.writeField(p, field, extraInstruction, signal)
    })
  }

  private async run(id: string, work: (p: Prepared, signal: AbortSignal) => Promise<void>): Promise<DraftRecord> {
    if (this.running.has(id)) throw new UserError('Este escrito ya se está redactando.')
    const controller = new AbortController()
    this.running.set(id, controller)
    const { drafts } = this.deps.repos
    try {
      const prepared = await this.prepare(id)
      drafts.setStatus(id, 'generando')
      await work(prepared, controller.signal)
      drafts.setStatus(id, 'listo')
      this.deps.emit({ draftId: id, type: 'done' })
    } catch (err) {
      const message = err instanceof UserError ? err.message : `Error inesperado: ${errorMessage(err)}`
      if (!(err instanceof UserError)) log.error('Error al redactar', err)
      if (drafts.get(id)) drafts.setStatus(id, 'borrador', message)
      this.deps.emit({ draftId: id, type: 'error', message })
      throw err instanceof UserError ? err : new UserError(message, { cause: err })
    } finally {
      this.running.delete(id)
    }
    return this.get(id)
  }

  private async prepare(id: string): Promise<Prepared> {
    const { repos, ai, search, settings } = this.deps
    const draft = this.get(id)
    const caseRecord = this.deps.cases.getRecord(draft.caseId)
    ai.assertChatAllowed(caseRecord)
    const template = draft.templateId ? this.deps.templates.get(draft.templateId) : null

    const sources: ContextSource[] = repos.documents
      .getMany(draft.sourceDocumentIds)
      .map((d) => ({ fileName: d.fileName, content: repos.documents.content(d.id) }))
      .filter((s) => s.content.length > 0)

    const query = [draft.instructions, draft.title, template?.name ?? '', ...sources.map((s) => s.content.slice(0, 1500))].join('\n')
    const excerpts = (
      await search.search(query, { caseId: draft.caseId, includeLibrary: true, limit: 12 }, ai.isRestricted(caseRecord))
    ).filter((h) => !draft.sourceDocumentIds.includes(h.documentId))

    const context = buildContext({ caseRecord, sources, excerpts, budget: ai.contextBudget() })
    const briefing = draftBriefing({
      kind: template?.name ?? 'Escrito libre',
      kindDescription: template?.description ?? '',
      title: draft.title,
      instructions: draft.instructions,
      sectionLabels: template?.fields.filter((f) => f.mode === 'ia').map((f) => f.label) ?? []
    })
    const s = settings.get()
    return {
      draft,
      template,
      system: systemPrompt({ profile: s.profile, generalRules: s.generalRules, templateRules: template?.rules }),
      sharedContext: `${context.text}\n\n${briefing}`
    }
  }

  private messages(p: Prepared, task: string): ModelMessage[] {
    return [
      {
        role: 'user',
        content: [
          { type: 'text', text: p.sharedContext, providerOptions: CACHE_HINT },
          { type: 'text', text: task }
        ]
      }
    ]
  }

  private async writeField(p: Prepared, name: string, extraInstruction: string, signal: AbortSignal): Promise<void> {
    const template = p.template!
    const field = template.fields.find((f) => f.name === name)
    if (!field) throw new UserError(`La sección "${name}" ya no existe en la plantilla.`)
    const current = this.get(p.draft.id).fieldValues
    const previous = template.fields
      .filter((f) => f.mode === 'ia' && f.name !== name && current[f.name]?.trim())
      .map((f) => ({ label: f.label, value: current[f.name]! }))

    this.deps.emit({ draftId: p.draft.id, type: 'field-start', field: name })
    const raw = await this.deps.stream({
      system: p.system,
      messages: this.messages(p, fieldTask({ label: field.label, name, instruction: field.instruction, extraInstruction, previous })),
      abortSignal: signal,
      onDelta: (delta) => this.deps.emit({ draftId: p.draft.id, type: 'delta', field: name, delta })
    })
    const value = stripMarkdown(raw)
    this.deps.repos.drafts.setField(p.draft.id, name, value)
    this.deps.emit({ draftId: p.draft.id, type: 'field-end', field: name, value })
  }

  private async writeBody(p: Prepared, extraInstruction: string, signal: AbortSignal): Promise<void> {
    this.deps.emit({ draftId: p.draft.id, type: 'field-start', field: BODY_FIELD })
    const raw = await this.deps.stream({
      system: p.system,
      messages: this.messages(p, freeformTask(extraInstruction)),
      abortSignal: signal,
      maxOutputTokens: 12000,
      onDelta: (delta) => this.deps.emit({ draftId: p.draft.id, type: 'delta', field: BODY_FIELD, delta })
    })
    const value = stripMarkdown(raw)
    this.deps.repos.drafts.patch(p.draft.id, { body: value })
    this.deps.emit({ draftId: p.draft.id, type: 'field-end', field: BODY_FIELD, value })
  }

  /** Saves the draft as a .docx in the case's "Escritos generados" folder. */
  async export(id: string): Promise<DraftRecord> {
    const draft = this.get(id)
    if (this.running.has(id)) throw new UserError('Espere a que termine la redacción antes de crear el documento.')
    const buffer = draft.templateId
      ? await this.deps.templates.render(draft.templateId, draft.fieldValues)
      : await textToDocx(draft.body || Object.values(draft.fieldValues).join('\n\n'))

    const dir = this.deps.cases.outputDir(draft.caseId)
    const date = new Date().toISOString().slice(0, 10)
    const stem = safeFileName(`${draft.title} ${date}`)
    let target = join(dir, `${stem}.docx`)
    for (let i = 2; existsSync(target) && target !== draft.outputPath; i++) target = join(dir, `${stem} (${i}).docx`)
    try {
      await writeFile(target, buffer)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EBUSY' || (err as NodeJS.ErrnoException).code === 'EPERM') {
        throw new UserError('El documento está abierto en Word. Ciérrelo e intente de nuevo.', { cause: err })
      }
      throw err
    }
    this.deps.repos.drafts.setOutput(id, target)
    return this.get(id)
  }
}

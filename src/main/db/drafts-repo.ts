import type { DraftInput, DraftListItem, DraftPatch, DraftRecord, DraftStatus } from '@shared/types'
import type { Db } from './database'
import { newId, nowIso, parseJson, str, strOrNull, type Row } from './util'

function toDraft(row: Row): DraftRecord {
  return {
    id: str(row, 'id'),
    caseId: str(row, 'case_id'),
    templateId: strOrNull(row, 'template_id'),
    title: str(row, 'title'),
    instructions: str(row, 'instructions'),
    sourceDocumentIds: parseJson<string[]>(row['source_document_ids_json'], []),
    fieldValues: parseJson<Record<string, string>>(row['field_values_json'], {}),
    body: str(row, 'body'),
    status: str(row, 'status') as DraftStatus,
    outputPath: strOrNull(row, 'output_path'),
    error: strOrNull(row, 'error'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at')
  }
}

export class DraftsRepo {
  constructor(private readonly db: Db) {}

  /** Drafts of one case, or of every case when `caseId` is null. Newest first. */
  list(caseId: string | null): DraftListItem[] {
    const base = `SELECT r.*, c.title AS case_title, t.name AS template_name
      FROM drafts r JOIN cases c ON c.id = r.case_id LEFT JOIN templates t ON t.id = r.template_id`
    const rows = (
      caseId === null
        ? this.db.prepare(`${base} ORDER BY r.updated_at DESC LIMIT 200`).all()
        : this.db.prepare(`${base} WHERE r.case_id = ? ORDER BY r.updated_at DESC`).all(caseId)
    ) as Row[]
    return rows.map((r) => ({ ...toDraft(r), caseTitle: str(r, 'case_title'), templateName: strOrNull(r, 'template_name') }))
  }

  get(id: string): DraftRecord | null {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as Row | undefined
    return row ? toDraft(row) : null
  }

  create(input: DraftInput, fieldValues: Record<string, string>): DraftRecord {
    const id = newId()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO drafts (id, case_id, template_id, title, instructions, source_document_ids_json, field_values_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'borrador', ?, ?)`
      )
      .run(
        id,
        input.caseId,
        input.templateId,
        input.title,
        input.instructions,
        JSON.stringify(input.sourceDocumentIds),
        JSON.stringify(fieldValues),
        now,
        now
      )
    return this.get(id)!
  }

  patch(id: string, patch: DraftPatch): DraftRecord | null {
    const current = this.get(id)
    if (!current) return null
    const next = { ...current, ...patch }
    this.db
      .prepare('UPDATE drafts SET title = ?, instructions = ?, field_values_json = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(next.title, next.instructions, JSON.stringify(next.fieldValues), next.body, nowIso(), id)
    return this.get(id)
  }

  setField(id: string, field: string, value: string): void {
    const current = this.get(id)
    if (!current) return
    this.patch(id, { fieldValues: { ...current.fieldValues, [field]: value } })
  }

  setStatus(id: string, status: DraftStatus, error: string | null = null): void {
    this.db.prepare('UPDATE drafts SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(status, error, nowIso(), id)
  }

  setOutput(id: string, outputPath: string): void {
    this.db
      .prepare(`UPDATE drafts SET status = 'exportado', output_path = ?, error = NULL, updated_at = ? WHERE id = ?`)
      .run(outputPath, nowIso(), id)
  }

  /** Drafts left in `generando` by a crash or forced close go back to `borrador`. */
  recoverInterrupted(): void {
    this.db
      .prepare(`UPDATE drafts SET status = 'borrador', error = 'La redacción se interrumpió porque se cerró el programa.' WHERE status = 'generando'`)
      .run()
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id)
  }
}

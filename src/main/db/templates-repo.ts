import type { TemplateField, TemplateRecord, TemplateUpdate } from '@shared/types'
import type { Db } from './database'
import { newId, nowIso, parseJson, str, strOrNull, type Row } from './util'

function toTemplate(row: Row, templatesDir: string, sep: string): TemplateRecord {
  const fileName = str(row, 'file_name')
  return {
    id: str(row, 'id'),
    fileName,
    path: `${templatesDir}${sep}${fileName}`,
    name: str(row, 'name'),
    description: str(row, 'description'),
    rules: str(row, 'rules'),
    fields: parseJson<TemplateField[]>(row['fields_json'], []),
    error: strOrNull(row, 'error'),
    updatedAt: str(row, 'updated_at')
  }
}

export class TemplatesRepo {
  constructor(
    private readonly db: Db,
    private readonly templatesDir: string,
    private readonly sep: string
  ) {}

  list(): TemplateRecord[] {
    const rows = this.db.prepare('SELECT * FROM templates ORDER BY name COLLATE NOCASE').all() as Row[]
    return rows.map((r) => toTemplate(r, this.templatesDir, this.sep))
  }

  get(id: string): TemplateRecord | null {
    const row = this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Row | undefined
    return row ? toTemplate(row, this.templatesDir, this.sep) : null
  }

  getByFileName(fileName: string): TemplateRecord | null {
    const row = this.db.prepare('SELECT * FROM templates WHERE file_name = ?').get(fileName) as Row | undefined
    return row ? toTemplate(row, this.templatesDir, this.sep) : null
  }

  insert(fileName: string, data: TemplateUpdate & { error: string | null }): TemplateRecord {
    const id = newId()
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO templates (id, file_name, name, description, rules, fields_json, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, fileName, data.name, data.description, data.rules, JSON.stringify(data.fields), data.error, now, now)
    return this.get(id)!
  }

  update(id: string, data: TemplateUpdate): TemplateRecord | null {
    this.db
      .prepare('UPDATE templates SET name = ?, description = ?, rules = ?, fields_json = ?, updated_at = ? WHERE id = ?')
      .run(data.name, data.description, data.rules, JSON.stringify(data.fields), nowIso(), id)
    return this.get(id)
  }

  /** Updates what is derived from the .docx file (detected fields, parse error). */
  updateDetected(id: string, fields: TemplateField[], error: string | null): void {
    this.db.prepare('UPDATE templates SET fields_json = ?, error = ? WHERE id = ?').run(JSON.stringify(fields), error, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  }
}

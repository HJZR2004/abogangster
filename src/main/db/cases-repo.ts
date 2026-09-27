import type { CaseInput, CaseRecord, CaseStatus, CaseSummary } from '@shared/types'
import type { Db } from './database'
import { newId, num, nowIso, str, type Row } from './util'

function toCase(row: Row): CaseRecord {
  return {
    id: str(row, 'id'),
    title: str(row, 'title'),
    clientName: str(row, 'client_name'),
    caseNumber: str(row, 'case_number'),
    court: str(row, 'court'),
    counterparty: str(row, 'counterparty'),
    description: str(row, 'description'),
    status: str(row, 'status') as CaseStatus,
    localOnly: num(row, 'local_only') === 1,
    folderPath: str(row, 'folder_path'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at')
  }
}

function toSummary(row: Row): CaseSummary {
  return {
    ...toCase(row),
    documentCount: num(row, 'document_count'),
    indexedCount: num(row, 'indexed_count'),
    draftCount: num(row, 'draft_count')
  }
}

const SUMMARY_SELECT = /* sql */ `
  SELECT c.*,
    (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) AS document_count,
    (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id AND d.status = 'indexado') AS indexed_count,
    (SELECT COUNT(*) FROM drafts r WHERE r.case_id = c.id) AS draft_count
  FROM cases c
`

export class CasesRepo {
  constructor(private readonly db: Db) {}

  list(): CaseSummary[] {
    const rows = this.db
      .prepare(`${SUMMARY_SELECT} ORDER BY CASE c.status WHEN 'activo' THEN 0 WHEN 'en_espera' THEN 1 ELSE 2 END, c.updated_at DESC`)
      .all() as Row[]
    return rows.map(toSummary)
  }

  getSummary(id: string): CaseSummary | null {
    const row = this.db.prepare(`${SUMMARY_SELECT} WHERE c.id = ?`).get(id) as Row | undefined
    return row ? toSummary(row) : null
  }

  get(id: string): CaseRecord | null {
    const row = this.db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as Row | undefined
    return row ? toCase(row) : null
  }

  create(input: CaseInput, folderPath: string, id: string = newId()): CaseRecord {
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO cases (id, title, client_name, case_number, court, counterparty, description, status, local_only, folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title,
        input.clientName,
        input.caseNumber,
        input.court,
        input.counterparty,
        input.description,
        input.status,
        input.localOnly ? 1 : 0,
        folderPath,
        now,
        now
      )
    return this.get(id)!
  }

  update(id: string, input: CaseInput): CaseRecord | null {
    this.db
      .prepare(
        `UPDATE cases SET title = ?, client_name = ?, case_number = ?, court = ?, counterparty = ?, description = ?,
           status = ?, local_only = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.title,
        input.clientName,
        input.caseNumber,
        input.court,
        input.counterparty,
        input.description,
        input.status,
        input.localOnly ? 1 : 0,
        nowIso(),
        id
      )
    return this.get(id)
  }

  touch(id: string): void {
    this.db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').run(nowIso(), id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM cases WHERE id = ?').run(id)
  }
}

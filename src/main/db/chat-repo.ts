import type { ChatMessage, SourceRef } from '@shared/types'
import type { Db } from './database'
import { newId, nowIso, parseJson, str, type Row } from './util'

function toMessage(row: Row): ChatMessage {
  return {
    id: str(row, 'id'),
    caseId: str(row, 'case_id'),
    role: str(row, 'role') as ChatMessage['role'],
    content: str(row, 'content'),
    sources: parseJson<SourceRef[]>(row['sources_json'], []),
    createdAt: str(row, 'created_at')
  }
}

export class ChatRepo {
  constructor(private readonly db: Db) {}

  history(caseId: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (SELECT *, rowid AS seq FROM chat_messages WHERE case_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?)
         ORDER BY created_at, seq`
      )
      .all(caseId, limit) as Row[]
    return rows.map(toMessage)
  }

  add(caseId: string, role: ChatMessage['role'], content: string, sources: SourceRef[] = []): ChatMessage {
    const id = newId()
    this.db
      .prepare('INSERT INTO chat_messages (id, case_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, caseId, role, content, JSON.stringify(sources), nowIso())
    return toMessage(this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id) as Row)
  }

  clear(caseId: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE case_id = ?').run(caseId)
  }
}

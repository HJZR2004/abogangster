import { sep } from 'node:path'
import type { Db } from './database'
import { CasesRepo } from './cases-repo'
import { ChatRepo } from './chat-repo'
import { DocumentsRepo } from './documents-repo'
import { DraftsRepo } from './drafts-repo'
import { TemplatesRepo } from './templates-repo'

export interface Repos {
  cases: CasesRepo
  documents: DocumentsRepo
  templates: TemplatesRepo
  drafts: DraftsRepo
  chat: ChatRepo
}

export function createRepos(db: Db, templatesDir: string): Repos {
  return {
    cases: new CasesRepo(db),
    documents: new DocumentsRepo(db),
    templates: new TemplatesRepo(db, templatesDir, sep),
    drafts: new DraftsRepo(db),
    chat: new ChatRepo(db)
  }
}

export { openDatabase, transaction, type Db } from './database'

import { existsSync, mkdirSync } from 'node:fs'
import { cp, copyFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CaseInput, CaseRecord, CaseSummary } from '@shared/types'
import type { Repos } from '../db'
import { newId } from '../db/util'
import { UserError } from '../errors'
import type { Indexer } from '../ingestion/indexer'
import { CASE_DOCUMENTS_DIR, CASE_OUTPUT_DIR, safeFileName, type WorkspacePaths } from '../workspace'

export interface CaseServiceDeps {
  repos: Repos
  paths: WorkspacePaths
  indexer: Indexer
  /** Starts watching a new folder. */
  watch: (dir: string) => void
  unwatch: (dir: string) => void
}

/** Copies `source` into `dir`, adding " (2)", " (3)"... if the name is taken. */
async function copyUnique(source: string, dir: string): Promise<string> {
  const name = basename(source)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let target = join(dir, name)
  for (let i = 2; existsSync(target); i++) target = join(dir, `${stem} (${i})${ext}`)
  await copyFile(source, target)
  return target
}

/** Cases and the documents inside them (plus the shared library when `caseId` is null). */
export class CaseService {
  constructor(private readonly deps: CaseServiceDeps) {}

  list(): CaseSummary[] {
    return this.deps.repos.cases.list()
  }

  get(id: string): CaseSummary {
    const c = this.deps.repos.cases.getSummary(id)
    if (!c) throw new UserError('El caso ya no existe.')
    return c
  }

  getRecord(id: string): CaseRecord {
    const c = this.deps.repos.cases.get(id)
    if (!c) throw new UserError('El caso ya no existe.')
    return c
  }

  create(input: CaseInput): CaseRecord {
    const id = newId()
    const folderName = safeFileName(`${input.title}${input.caseNumber ? ` - ${input.caseNumber}` : ''}`)
    let folder = join(this.deps.paths.cases, folderName)
    for (let i = 2; existsSync(folder); i++) folder = join(this.deps.paths.cases, `${folderName} (${i})`)
    mkdirSync(join(folder, CASE_DOCUMENTS_DIR), { recursive: true })
    mkdirSync(join(folder, CASE_OUTPUT_DIR), { recursive: true })
    const record = this.deps.repos.cases.create(input, folder, id)
    this.registerCaseRoot(record)
    this.deps.watch(folder)
    return record
  }

  update(id: string, input: CaseInput): CaseRecord {
    const record = this.deps.repos.cases.update(id, input)
    if (!record) throw new UserError('El caso ya no existe.')
    return record
  }

  /** Removes the case from the app. The folder and its files stay on disk (never deleted). */
  delete(id: string): void {
    const record = this.getRecord(id)
    this.deps.unwatch(record.folderPath)
    this.deps.indexer.removeRoot(record.folderPath)
    this.deps.repos.cases.delete(id)
  }

  registerCaseRoot(record: CaseRecord): void {
    this.deps.indexer.addRoot({ dir: record.folderPath, scope: 'case', caseId: record.id })
  }

  /** Folder where imported files are copied: the case's "Documentos" or the library. */
  importTarget(caseId: string | null): string {
    if (caseId === null) return this.deps.paths.library
    const dir = join(this.getRecord(caseId).folderPath, CASE_DOCUMENTS_DIR)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * Copies files and whole folders into the case (or library). The originals are not touched.
   * The watcher/indexer picks the copies up automatically. Returns the number of items copied.
   */
  async importPaths(caseId: string | null, paths: string[]): Promise<number> {
    const target = this.importTarget(caseId)
    let count = 0
    for (const source of paths) {
      const st = await stat(source).catch(() => null)
      if (!st) continue
      if (st.isDirectory()) {
        let dest = join(target, basename(source))
        for (let i = 2; existsSync(dest); i++) dest = join(target, `${basename(source)} (${i})`)
        await cp(source, dest, { recursive: true, errorOnExist: false })
      } else {
        await copyUnique(source, target)
      }
      count++
    }
    const root = this.deps.indexer.rootFor(target)
    if (root) this.deps.indexer.scan(root)
    if (caseId) this.deps.repos.cases.touch(caseId)
    return count
  }

  outputDir(caseId: string): string {
    const dir = join(this.getRecord(caseId).folderPath, CASE_OUTPUT_DIR)
    mkdirSync(dir, { recursive: true })
    return dir
  }
}

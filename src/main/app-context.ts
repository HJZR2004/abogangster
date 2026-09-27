import type { EventChannel, EventContract } from '@shared/ipc'
import { AiService } from './ai/ai-service'
import { createRepos, openDatabase, type Db, type Repos } from './db'
import { Indexer } from './ingestion/indexer'
import { FolderWatcher } from './ingestion/watcher'
import { createLogger } from './logger'
import { SearchService } from './search/search-service'
import { CaseService } from './services/case-service'
import { ChatService } from './services/chat-service'
import { DraftingService } from './services/drafting-service'
import type { SettingsStore } from './settings/settings-store'
import { TemplateService } from './templates/template-service'
import { ensureWorkspace, isInside, workspacePaths, type WorkspacePaths } from './workspace'

const log = createLogger('app')

export type Emit = <K extends EventChannel>(channel: K, payload: EventContract[K]) => void

/**
 * Composition root: wires every service together. Free of Electron APIs (they are
 * injected), so it can be started from tests with a temp folder.
 */
export class AppContext {
  readonly paths: WorkspacePaths
  readonly db: Db
  readonly repos: Repos
  readonly ai: AiService
  readonly indexer: Indexer
  readonly watcher: FolderWatcher
  readonly search: SearchService
  readonly templates: TemplateService
  readonly cases: CaseService
  readonly chat: ChatService
  readonly drafting: DraftingService

  constructor(
    readonly settings: SettingsStore,
    private readonly emit: Emit
  ) {
    this.paths = workspacePaths(settings.get().workspaceDir)
    ensureWorkspace(this.paths)
    this.db = openDatabase(this.paths.database)
    this.repos = createRepos(this.db, this.paths.templates)
    this.ai = new AiService(settings)

    this.indexer = new Indexer({
      documents: this.repos.documents,
      embedder: () => this.ai.embedderFor(false),
      globallyRestricted: () => settings.get().localOnlyGlobal,
      onStatus: (status) => emit('indexing:status', status),
      onChanged: (caseId) => emit('documents:changed', { caseId })
    })

    this.templates = new TemplateService(this.repos.templates, this.paths.templates)

    this.watcher = new FolderWatcher({
      onFileChanged: (path) => {
        if (isInside(this.paths.templates, path)) void this.syncTemplates()
        else this.indexer.enqueue(path)
      },
      onFileRemoved: (path) => {
        if (isInside(this.paths.templates, path)) void this.syncTemplates()
        else this.indexer.remove(path)
      },
      onFolderRemoved: (path) => this.indexer.removeFolder(path)
    })

    this.search = new SearchService(this.db, this.repos.documents, (restricted) => this.ai.embedderFor(restricted))

    this.cases = new CaseService({
      repos: this.repos,
      paths: this.paths,
      indexer: this.indexer,
      watch: (dir) => this.watcher.add(dir),
      unwatch: (dir) => this.watcher.unwatch(dir)
    })

    this.chat = new ChatService({
      repos: this.repos,
      search: this.search,
      ai: this.ai,
      stream: this.ai.stream,
      settings,
      onDelta: (caseId, delta) => emit('chat:delta', { caseId, delta })
    })

    this.drafting = new DraftingService({
      repos: this.repos,
      cases: this.cases,
      templates: this.templates,
      search: this.search,
      ai: this.ai,
      stream: this.ai.stream,
      settings,
      emit: (event) => emit('drafts:progress', event)
    })
  }

  /** Registers index roots, starts watching folders and schedules a full rescan. */
  async start(options: { watch: boolean } = { watch: true }): Promise<void> {
    this.repos.drafts.recoverInterrupted()
    await this.templates.seedExamples()
    await this.syncTemplates()

    this.indexer.addRoot({ dir: this.paths.library, scope: 'library', caseId: null })
    for (const c of this.repos.cases.list()) this.cases.registerCaseRoot(c)

    if (options.watch) {
      this.watcher.start([this.paths.library, this.paths.templates, ...this.repos.cases.list().map((c) => c.folderPath)])
    }
    this.indexer.scanAll()
    log.info(`Espacio de trabajo: ${this.paths.root}`)
  }

  async syncTemplates(): Promise<void> {
    try {
      await this.templates.sync()
      this.emit('templates:changed', {})
    } catch (err) {
      log.error('No se pudieron sincronizar las plantillas', err)
    }
  }

  async stop(): Promise<void> {
    await this.watcher.close()
    this.db.close()
  }
}

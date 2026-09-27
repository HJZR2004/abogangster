import { watch, type FSWatcher } from 'chokidar'
import { basename } from 'node:path'
import { createLogger } from '../logger'

const log = createLogger('watcher')

export interface WatcherHandlers {
  onFileChanged(path: string): void
  onFileRemoved(path: string): void
  onFolderRemoved(path: string): void
}

/**
 * Watches workspace folders and forwards changes. Initial state is handled by
 * `Indexer.scanAll()` at startup, so the watcher ignores the initial add events.
 */
export class FolderWatcher {
  private watcher: FSWatcher | null = null

  constructor(private readonly handlers: WatcherHandlers) {}

  start(paths: string[]): void {
    this.watcher = watch(paths, {
      ignoreInitial: true,
      // Word writes files in several steps; wait until the file stops changing.
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 },
      ignored: (path) => {
        const name = basename(path)
        return name.startsWith('.') || name.startsWith('~$') || name.endsWith('.tmp')
      }
    })
    this.watcher
      .on('add', (p) => this.handlers.onFileChanged(p))
      .on('change', (p) => this.handlers.onFileChanged(p))
      .on('unlink', (p) => this.handlers.onFileRemoved(p))
      .on('unlinkDir', (p) => this.handlers.onFolderRemoved(p))
      .on('error', (err) => log.warn('Error vigilando carpetas', err))
  }

  add(path: string): void {
    this.watcher?.add(path)
  }

  unwatch(path: string): void {
    this.watcher?.unwatch(path)
  }

  async close(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null
  }
}

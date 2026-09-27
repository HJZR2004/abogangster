import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { existsSync } from 'node:fs'
import type { InvokeArgs, InvokeChannel, InvokeResult, IpcEnvelope } from '@shared/ipc'
import { listOllamaModels } from '../ai/providers'
import type { AppContext } from '../app-context'
import { UserError, errorMessage } from '../errors'
import { createLogger } from '../logger'
import { isInside } from '../workspace'
import * as schema from './schemas'

const log = createLogger('ipc')

type Handler<K extends InvokeChannel> = (...args: InvokeArgs<K>) => Promise<InvokeResult<K>> | InvokeResult<K>

function handle<K extends InvokeChannel>(channel: K, fn: Handler<K>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcEnvelope<InvokeResult<K>>> => {
    try {
      return { ok: true, data: await fn(...(args as InvokeArgs<K>)) }
    } catch (err) {
      if (err instanceof UserError) return { ok: false, error: err.message }
      if (err && typeof err === 'object' && 'issues' in err) {
        const issue = (err as { issues: { message: string }[] }).issues[0]
        return { ok: false, error: issue?.message ?? 'Datos no válidos.' }
      }
      log.error(`Error en "${channel}"`, err)
      return { ok: false, error: `Ocurrió un error inesperado. Detalle técnico: ${errorMessage(err)}` }
    }
  })
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

/** Registers every IPC handler. One line per channel declared in `src/shared/ipc.ts`. */
export function registerIpcHandlers(ctx: AppContext, info: { logsDir: string }): void {
  /** Only paths inside the workspace may be opened from the renderer. */
  const assertWorkspacePath = (path: string): string => {
    const p = schema.pathString.parse(path)
    if (!isInside(ctx.paths.root, p)) throw new UserError('Ruta fuera del espacio de trabajo.')
    if (!existsSync(p)) throw new UserError('El archivo o carpeta ya no existe.')
    return p
  }

  // App
  handle('app:info', () => ({
    version: app.getVersion(),
    workspaceDir: ctx.paths.root,
    logsDir: info.logsDir,
    aiConfigured: ctx.ai.isConfigured()
  }))
  handle('app:openPath', async (path) => {
    const error = await shell.openPath(assertWorkspacePath(path))
    if (error) throw new UserError(`No se pudo abrir: ${error}`)
  })
  handle('app:showInFolder', (path) => shell.showItemInFolder(assertWorkspacePath(path)))
  handle('app:pickFiles', async () => {
    const win = focusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Elegir documentos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos', extensions: ['docx', 'pdf', 'txt', 'md', 'doc'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  handle('app:pickFolder', async () => {
    const win = focusedWindow()
    const options: Electron.OpenDialogOptions = { title: 'Elegir carpeta', properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Cases
  handle('cases:list', () => ctx.cases.list())
  handle('cases:get', (id) => ctx.cases.get(schema.id.parse(id)))
  handle('cases:create', (input) => ctx.cases.create(schema.caseInput.parse(input)))
  handle('cases:update', (id, input) => ctx.cases.update(schema.id.parse(id), schema.caseInput.parse(input)))
  handle('cases:delete', (id) => ctx.cases.delete(schema.id.parse(id)))

  // Documents
  handle('documents:list', (caseId) => ctx.repos.documents.list(schema.nullableId.parse(caseId)))
  handle('documents:import', (caseId, paths) =>
    ctx.cases.importPaths(schema.nullableId.parse(caseId), schema.pathList.parse(paths))
  )
  handle('documents:setDescription', (id, description) =>
    ctx.repos.documents.setDescription(schema.id.parse(id), schema.shortText.parse(description))
  )
  handle('documents:reindex', (id) => {
    const doc = ctx.repos.documents.get(schema.id.parse(id))
    if (!doc) throw new UserError('El documento ya no existe.')
    ctx.indexer.enqueue(doc.path, true)
  })
  handle('documents:trash', async (id) => {
    const doc = ctx.repos.documents.get(schema.id.parse(id))
    if (!doc) throw new UserError('El documento ya no existe.')
    if (existsSync(doc.path)) await shell.trashItem(doc.path)
    ctx.indexer.remove(doc.path)
  })
  handle('documents:search', async (caseId, query) => {
    const scope = schema.nullableId.parse(caseId)
    const caseRecord = scope ? ctx.cases.getRecord(scope) : null
    return ctx.search.search(
      schema.shortText.parse(query),
      { caseId: scope, includeLibrary: scope !== null, limit: 20 },
      ctx.ai.isRestricted(caseRecord)
    )
  })
  handle('indexing:status', () => ctx.indexer.status())
  handle('indexing:rescan', () => ctx.indexer.scanAll())

  // Templates
  handle('templates:list', () => ctx.templates.list())
  handle('templates:update', (id, update) => ctx.templates.update(schema.id.parse(id), schema.templateUpdate.parse(update)))
  handle('templates:import', (paths) => ctx.templates.import(schema.pathList.parse(paths)))
  handle('templates:openFolder', async () => {
    await shell.openPath(ctx.paths.templates)
  })

  // Drafts
  handle('drafts:list', (caseId) => ctx.repos.drafts.list(schema.nullableId.parse(caseId)))
  handle('drafts:get', (id) => ctx.drafting.get(schema.id.parse(id)))
  handle('drafts:create', (input) => ctx.drafting.create(schema.draftInput.parse(input)))
  handle('drafts:update', (id, patch) => ctx.drafting.update(schema.id.parse(id), schema.draftPatch.parse(patch)))
  handle('drafts:generate', (id) => ctx.drafting.generate(schema.id.parse(id)))
  handle('drafts:regenerateField', (id, field, extra) =>
    ctx.drafting.regenerateField(schema.id.parse(id), schema.shortText.parse(field), schema.longText.parse(extra))
  )
  handle('drafts:cancel', (id) => ctx.drafting.cancel(schema.id.parse(id)))
  handle('drafts:export', (id) => ctx.drafting.export(schema.id.parse(id)))
  handle('drafts:delete', (id) => ctx.drafting.delete(schema.id.parse(id)))

  // Chat
  handle('chat:history', (caseId) => ctx.chat.history(schema.id.parse(caseId)))
  handle('chat:ask', (caseId, question) =>
    ctx.chat.ask(schema.id.parse(caseId), schema.question.parse(question))
  )
  handle('chat:cancel', (caseId) => ctx.chat.cancel(schema.id.parse(caseId)))
  handle('chat:clear', (caseId) => ctx.chat.clear(schema.id.parse(caseId)))

  // Settings
  handle('settings:get', () => ctx.settings.toPublic())
  handle('settings:update', (update) => {
    const before = ctx.ai.embeddingKey()
    ctx.settings.update(schema.settingsUpdate.parse(update))
    // A new embedding model makes stored vectors stale: recompute in the background.
    if (ctx.ai.embeddingKey() !== before) ctx.indexer.refreshEmbeddings()
    return ctx.settings.toPublic()
  })
  handle('settings:testChat', () => ctx.ai.testChat())
  handle('settings:testEmbedding', async () => {
    const result = await ctx.ai.testEmbedding()
    if (result.ok) ctx.indexer.refreshEmbeddings()
    return result
  })
  handle('settings:ollamaModels', async () => {
    try {
      return await listOllamaModels(ctx.settings.get().ollama.baseUrl)
    } catch {
      throw new UserError('No se pudo conectar con Ollama. Verifique que esté instalado y abierto.')
    }
  })
  handle('settings:changeWorkspace', (path) => {
    const dir = schema.pathString.parse(path)
    if (!existsSync(dir)) throw new UserError('La carpeta no existe.')
    ctx.settings.setWorkspaceDir(dir)
    app.relaunch()
    app.exit(0)
  })
}

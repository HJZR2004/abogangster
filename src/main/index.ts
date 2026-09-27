import { BrowserWindow, Menu, app, dialog, safeStorage, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { AppContext, type Emit } from './app-context'
import { applyDataDirOverride, captureScreensIfRequested, seedDemoDataIfRequested } from './dev-tools'
import { errorMessage } from './errors'
import { registerIpcHandlers } from './ipc/handlers'
import { createLogger, initLogger } from './logger'
import { SettingsStore, type SecretCipher } from './settings/settings-store'

const log = createLogger('main')

let mainWindow: BrowserWindow | null = null
let context: AppContext | null = null

const cipher: SecretCipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

const emit: Emit = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function buildMenu(ctx: AppContext, logsDir: string): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir carpeta de trabajo', click: () => void shell.openPath(ctx.paths.root) },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Letra más grande', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: 'Letra más pequeña', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Abrir registros (para soporte técnico)', click: () => void shell.openPath(logsDir) },
        { label: 'Herramientas de desarrollo', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Acerca de Abogangster',
          click: () =>
            void dialog.showMessageBox({
              type: 'info',
              title: 'Abogangster',
              message: `Abogangster ${app.getVersion()}`,
              detail: `Asistente de redacción legal.\nCarpeta de trabajo: ${ctx.paths.root}`
            })
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Abogangster',
    backgroundColor: '#f7f5f0',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  win.webContents.session.setSpellCheckerLanguages(['es-MX', 'es'])
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // Never navigate away from the app; open web links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

async function bootstrap(): Promise<void> {
  const logsDir = join(app.getPath('userData'), 'logs')
  initLogger(logsDir)
  log.info(`Iniciando Abogangster ${app.getVersion()}`)

  const settings = new SettingsStore(
    join(app.getPath('userData'), 'settings.json'),
    cipher,
    join(app.getPath('documents'), 'Abogangster')
  )
  context = new AppContext(settings, emit)
  registerIpcHandlers(context, { logsDir })
  Menu.setApplicationMenu(buildMenu(context, logsDir))
  mainWindow = createWindow()
  const ctx = context
  mainWindow.webContents.once('did-finish-load', () => {
    void captureScreensIfRequested(mainWindow!, () => {
      const firstCase = ctx.repos.cases.list()[0]
      const firstDraft = ctx.repos.drafts.list(null)[0]
      return [
        ...(firstCase ? [`/casos/${firstCase.id}`, `/casos/${firstCase.id}?tab=documentos`] : []),
        ...(firstDraft ? [`/escritos/${firstDraft.id}`] : [])
      ]
    })
  })
  await context.start()
  await seedDemoDataIfRequested(context)
}

applyDataDirOverride()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(bootstrap).catch((err: unknown) => {
    log.error('Error fatal al iniciar', err)
    dialog.showErrorBox('Abogangster no pudo iniciar', `${errorMessage(err)}\n\nRevise los registros en ${app.getPath('userData')}\\logs`)
    app.exit(1)
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', () => {
    void context?.stop().catch((err: unknown) => log.warn('Error al cerrar', err))
  })

  process.on('uncaughtException', (err) => log.error('Excepción no controlada', err))
  process.on('unhandledRejection', (err) => log.error('Promesa rechazada sin control', err))
}

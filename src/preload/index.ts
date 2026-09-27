import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type AbogangsterApi, type IpcEnvelope } from '@shared/ipc'

/**
 * The only bridge between the web page and Node/Electron. Exposes a small, typed,
 * allow-listed API on `window.api`; the renderer has no direct access to Node.
 */

const invokeChannels = new Set<string>(INVOKE_CHANNELS)
const eventChannels = new Set<string>(EVENT_CHANNELS)

const api: AbogangsterApi = {
  async invoke(channel, ...args) {
    if (!invokeChannels.has(channel)) throw new Error(`Canal no permitido: ${channel}`)
    const envelope = (await ipcRenderer.invoke(channel, ...args)) as IpcEnvelope<never>
    if (envelope.ok) return envelope.data
    throw new Error(envelope.error)
  },
  on(channel, listener) {
    if (!eventChannels.has(channel)) throw new Error(`Evento no permitido: ${channel}`)
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload as never)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)

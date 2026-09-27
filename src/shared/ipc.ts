/**
 * Typed IPC contract between the renderer and the main process.
 *
 * - `InvokeContract`: request/response calls (renderer -> main) via `window.api.invoke`.
 * - `EventContract`: push notifications (main -> renderer) via `window.api.on`.
 *
 * To add a call: declare it in `InvokeContract`, list it in `INVOKE_CHANNELS`
 * (the compiler enforces this) and register a handler in `src/main/ipc/handlers.ts`.
 */
import type {
  AppInfo,
  CaseInput,
  CaseRecord,
  CaseSummary,
  ChatDeltaEvent,
  ChatMessage,
  ConnectionTestResult,
  DocumentRecord,
  DraftInput,
  DraftListItem,
  DraftPatch,
  DraftProgressEvent,
  DraftRecord,
  IndexingStatus,
  PublicSettings,
  SearchHit,
  SettingsUpdate,
  TemplateRecord,
  TemplateUpdate
} from './types'

/** `caseId: null` targets the shared library instead of a case. */
type Scope = string | null

export interface InvokeContract {
  // App / operating system
  'app:info': { args: []; result: AppInfo }
  'app:openPath': { args: [path: string]; result: void }
  'app:showInFolder': { args: [path: string]; result: void }
  'app:pickFiles': { args: []; result: string[] }
  'app:pickFolder': { args: []; result: string | null }

  // Cases
  'cases:list': { args: []; result: CaseSummary[] }
  'cases:get': { args: [id: string]; result: CaseSummary }
  'cases:create': { args: [input: CaseInput]; result: CaseRecord }
  'cases:update': { args: [id: string, input: CaseInput]; result: CaseRecord }
  'cases:delete': { args: [id: string]; result: void }

  // Documents (case or library)
  'documents:list': { args: [caseId: Scope]; result: DocumentRecord[] }
  'documents:import': { args: [caseId: Scope, paths: string[]]; result: number }
  'documents:setDescription': { args: [id: string, description: string]; result: void }
  'documents:reindex': { args: [id: string]; result: void }
  'documents:trash': { args: [id: string]; result: void }
  'documents:search': { args: [caseId: Scope, query: string]; result: SearchHit[] }
  'indexing:status': { args: []; result: IndexingStatus }
  'indexing:rescan': { args: []; result: void }

  // Templates
  'templates:list': { args: []; result: TemplateRecord[] }
  'templates:update': { args: [id: string, update: TemplateUpdate]; result: TemplateRecord }
  'templates:import': { args: [paths: string[]]; result: number }
  'templates:openFolder': { args: []; result: void }

  // Drafts
  'drafts:list': { args: [caseId: string | null]; result: DraftListItem[] }
  'drafts:get': { args: [id: string]; result: DraftRecord }
  'drafts:create': { args: [input: DraftInput]; result: DraftRecord }
  'drafts:update': { args: [id: string, patch: DraftPatch]; result: DraftRecord }
  'drafts:generate': { args: [id: string]; result: DraftRecord }
  'drafts:regenerateField': { args: [id: string, field: string, extraInstruction: string]; result: DraftRecord }
  'drafts:cancel': { args: [id: string]; result: void }
  'drafts:export': { args: [id: string]; result: DraftRecord }
  'drafts:delete': { args: [id: string]; result: void }

  // Case chat
  'chat:history': { args: [caseId: string]; result: ChatMessage[] }
  'chat:ask': { args: [caseId: string, question: string]; result: ChatMessage }
  'chat:cancel': { args: [caseId: string]; result: void }
  'chat:clear': { args: [caseId: string]; result: void }

  // Settings
  'settings:get': { args: []; result: PublicSettings }
  'settings:update': { args: [update: SettingsUpdate]; result: PublicSettings }
  'settings:testChat': { args: []; result: ConnectionTestResult }
  'settings:testEmbedding': { args: []; result: ConnectionTestResult }
  'settings:ollamaModels': { args: []; result: string[] }
  'settings:changeWorkspace': { args: [path: string]; result: void }
}

export type InvokeChannel = keyof InvokeContract
export type InvokeArgs<K extends InvokeChannel> = InvokeContract[K]['args']
export type InvokeResult<K extends InvokeChannel> = InvokeContract[K]['result']

const INVOKE_CHANNEL_MAP: Record<InvokeChannel, true> = {
  'app:info': true,
  'app:openPath': true,
  'app:showInFolder': true,
  'app:pickFiles': true,
  'app:pickFolder': true,
  'cases:list': true,
  'cases:get': true,
  'cases:create': true,
  'cases:update': true,
  'cases:delete': true,
  'documents:list': true,
  'documents:import': true,
  'documents:setDescription': true,
  'documents:reindex': true,
  'documents:trash': true,
  'documents:search': true,
  'indexing:status': true,
  'indexing:rescan': true,
  'templates:list': true,
  'templates:update': true,
  'templates:import': true,
  'templates:openFolder': true,
  'drafts:list': true,
  'drafts:get': true,
  'drafts:create': true,
  'drafts:update': true,
  'drafts:generate': true,
  'drafts:regenerateField': true,
  'drafts:cancel': true,
  'drafts:export': true,
  'drafts:delete': true,
  'chat:history': true,
  'chat:ask': true,
  'chat:cancel': true,
  'chat:clear': true,
  'settings:get': true,
  'settings:update': true,
  'settings:testChat': true,
  'settings:testEmbedding': true,
  'settings:ollamaModels': true,
  'settings:changeWorkspace': true
}

export const INVOKE_CHANNELS = Object.keys(INVOKE_CHANNEL_MAP) as InvokeChannel[]

export interface EventContract {
  'indexing:status': IndexingStatus
  /** A document list changed. `caseId: null` means the library. */
  'documents:changed': { caseId: string | null }
  'templates:changed': Record<string, never>
  'chat:delta': ChatDeltaEvent
  'drafts:progress': DraftProgressEvent
}

export type EventChannel = keyof EventContract

const EVENT_CHANNEL_MAP: Record<EventChannel, true> = {
  'indexing:status': true,
  'documents:changed': true,
  'templates:changed': true,
  'chat:delta': true,
  'drafts:progress': true
}

export const EVENT_CHANNELS = Object.keys(EVENT_CHANNEL_MAP) as EventChannel[]

/** Envelope used on the wire so errors keep their user-facing message. */
export type IpcEnvelope<T> = { ok: true; data: T } | { ok: false; error: string }

/** API exposed on `window.api` by the preload script. */
export interface AbogangsterApi {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>
  on<K extends EventChannel>(channel: K, listener: (payload: EventContract[K]) => void): () => void
  /** Absolute path of a file dropped onto the window (drag & drop). */
  getPathForFile(file: File): string
}

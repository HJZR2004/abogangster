import { embedMany, streamText, type ModelMessage } from 'ai'
import type { CaseRecord, ConnectionTestResult } from '@shared/types'
import { UserError, errorMessage } from '../errors'
import { createLogger } from '../logger'
import type { SettingsStore } from '../settings/settings-store'
import { humanizeAiError } from './errors'
import {
  CHAT_PROVIDER_LABELS,
  contextBudget,
  createChatModel,
  createEmbeddingModel,
  embeddingModelKey,
  isLocalChatProvider,
  isLocalEmbeddingProvider
} from './providers'

const log = createLogger('ai')

/** Minimal embedding interface used by the indexer and search (easy to fake in tests). */
export interface Embedder {
  /** Stable identifier of provider+model; stored next to each vector. */
  key: string
  isLocal: boolean
  embed(values: string[]): Promise<number[][]>
}

export interface StreamRequest {
  system: string
  messages: ModelMessage[]
  abortSignal?: AbortSignal
  onDelta?: (delta: string) => void
  maxOutputTokens?: number
}

/** Streams text from the configured chat model. */
export type TextStreamer = (req: StreamRequest) => Promise<string>

export class AiService {
  constructor(private readonly settings: SettingsStore) {}

  private get s() {
    return this.settings.get()
  }

  isConfigured(): boolean {
    return this.s.chat.model.trim() !== ''
  }

  contextBudget(): number {
    return contextBudget(this.s)
  }

  /** True when the case's content must stay on this machine / office network. */
  isRestricted(caseRecord: CaseRecord | null): boolean {
    return this.s.localOnlyGlobal || Boolean(caseRecord?.localOnly)
  }

  /** Throws if the case is confidential and the chat provider is a cloud service. */
  assertChatAllowed(caseRecord: CaseRecord | null): void {
    if (this.isRestricted(caseRecord) && !isLocalChatProvider(this.s)) {
      throw new UserError(
        'Este caso está marcado como confidencial ("solo IA local"), pero el modelo configurado es un servicio en internet. ' +
          'Cambie a un modelo local (Ollama) en Configuración o quite la marca de confidencial en los datos del caso.'
      )
    }
  }

  readonly stream: TextStreamer = async (req) => {
    const s = this.s
    const model = createChatModel(s, (n) => this.settings.getSecret(n))
    const ctx = { provider: s.chat.provider, model: s.chat.model }
    try {
      const result = streamText({
        model,
        system: req.system,
        messages: req.messages,
        abortSignal: req.abortSignal,
        maxOutputTokens: req.maxOutputTokens ?? 8000,
        temperature: 0.3,
        maxRetries: 2
      })
      let text = ''
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          text += part.text
          req.onDelta?.(part.text)
        } else if (part.type === 'error') {
          throw part.error
        }
      }
      return text
    } catch (err) {
      if (req.abortSignal?.aborted) throw new UserError('Se canceló la operación.', { cause: err })
      log.error('Fallo en la llamada al modelo', ctx, err)
      throw humanizeAiError(err, ctx)
    }
  }

  /** Embedder for documents of a case/library, or `null` if not configured or not allowed. */
  embedderFor(restricted: boolean): Embedder | null {
    const s = this.s
    let model
    try {
      model = createEmbeddingModel(s, (n) => this.settings.getSecret(n))
    } catch (err) {
      log.warn('Búsqueda semántica no disponible:', errorMessage(err))
      return null
    }
    if (!model) return null
    const isLocal = isLocalEmbeddingProvider(s)
    if (restricted && !isLocal) return null
    const ctx = { provider: s.embedding.provider, model: s.embedding.model }
    return {
      key: embeddingModelKey(s),
      isLocal,
      embed: async (values) => {
        try {
          const { embeddings } = await embedMany({ model, values, maxRetries: 2 })
          return embeddings
        } catch (err) {
          throw humanizeAiError(err, ctx)
        }
      }
    }
  }

  /** The embedding key currently configured (vectors with another key are stale). */
  embeddingKey(): string | null {
    return this.s.embedding.provider === 'ninguno' ? null : embeddingModelKey(this.s)
  }

  /** Uses the same streaming path as real drafting, so a passing test means drafting works. */
  async testChat(): Promise<ConnectionTestResult> {
    const s = this.s
    try {
      const text = await this.stream({
        system: 'Eres un asistente de pruebas.',
        messages: [{ role: 'user', content: 'Responde únicamente con la palabra: listo' }],
        maxOutputTokens: 20,
        // Local models may need a while to load into memory the first time.
        abortSignal: AbortSignal.timeout(180_000)
      })
      return { ok: true, message: `Conexión correcta con ${CHAT_PROVIDER_LABELS[s.chat.provider]} (${s.chat.model}). Respuesta: "${text.trim().slice(0, 60)}"` }
    } catch (err) {
      return { ok: false, message: humanizeAiError(err, { provider: s.chat.provider, model: s.chat.model }).message }
    }
  }

  async testEmbedding(): Promise<ConnectionTestResult> {
    const s = this.s
    if (s.embedding.provider === 'ninguno') {
      return { ok: true, message: 'La búsqueda semántica está desactivada; se usará solo búsqueda por palabras.' }
    }
    const embedder = this.embedderFor(false)
    if (!embedder) return { ok: false, message: 'Falta configurar el modelo de búsqueda semántica.' }
    try {
      const [vector] = await embedder.embed(['prueba de conexión'])
      return { ok: true, message: `Conexión correcta (${s.embedding.model}, ${vector?.length ?? 0} dimensiones).` }
    } catch (err) {
      return { ok: false, message: errorMessage(err) }
    }
  }
}

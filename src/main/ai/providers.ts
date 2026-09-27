import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { EmbeddingModel, LanguageModel } from 'ai'
import type { ChatProvider, EmbeddingProvider } from '@shared/types'
import { UserError } from '../errors'
import type { SecretName, StoredSettings } from '../settings/settings-store'

/**
 * Builds AI SDK models from the user's settings. This is the ONLY place that knows
 * about concrete providers: to add one, extend the provider unions in shared/types.ts
 * and the switches below.
 */

type GetSecret = (name: SecretName) => string

export const CHAT_PROVIDER_LABELS: Record<ChatProvider, string> = {
  ollama: 'Ollama (local)',
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  compatible: 'Compatible con OpenAI'
}

const trimSlash = (url: string): string => url.trim().replace(/\/+$/, '')

/** True for loopback and private-network addresses (the data never leaves the office). */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return (
      host === 'localhost' ||
      host === '::1' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
  } catch {
    return false
  }
}

export function isLocalChatProvider(s: StoredSettings): boolean {
  if (s.chat.provider === 'ollama') return true
  if (s.chat.provider === 'compatible') return isLocalUrl(s.compatible.baseUrl)
  return false
}

export function isLocalEmbeddingProvider(s: StoredSettings): boolean {
  if (s.embedding.provider === 'ollama' || s.embedding.provider === 'ninguno') return true
  if (s.embedding.provider === 'compatible') return isLocalUrl(s.compatible.baseUrl)
  return false
}

/** Characters of context to send. Local models usually have much smaller context windows. */
export function contextBudget(s: StoredSettings): number {
  if (s.contextChars > 0) return s.contextChars
  return isLocalChatProvider(s) ? 24_000 : 150_000
}

function ollama(s: StoredSettings) {
  return createOpenAICompatible({ name: 'ollama', baseURL: `${trimSlash(s.ollama.baseUrl)}/v1` })
}

function compatible(s: StoredSettings, getSecret: GetSecret) {
  if (!s.compatible.baseUrl.trim()) throw new UserError('Falta la dirección (URL) del proveedor compatible con OpenAI.')
  const apiKey = getSecret('compatible')
  return createOpenAICompatible({
    name: 'compatible',
    baseURL: trimSlash(s.compatible.baseUrl),
    ...(apiKey ? { apiKey } : {})
  })
}

function requireKey(getSecret: GetSecret, name: SecretName, label: string): string {
  const key = getSecret(name)
  if (!key) throw new UserError(`Falta la clave de API de ${label}. Agréguela en Configuración.`)
  return key
}

export function createChatModel(s: StoredSettings, getSecret: GetSecret): LanguageModel {
  const model = s.chat.model.trim()
  if (!model) throw new UserError('No hay un modelo de inteligencia artificial seleccionado. Elija uno en Configuración.')
  switch (s.chat.provider) {
    case 'ollama':
      return ollama(s).chatModel(model)
    case 'anthropic':
      return createAnthropic({ apiKey: requireKey(getSecret, 'anthropic', 'Anthropic') })(model)
    case 'openai':
      return createOpenAI({ apiKey: requireKey(getSecret, 'openai', 'OpenAI') })(model)
    case 'compatible':
      return compatible(s, getSecret).chatModel(model)
  }
}

/** Returns `null` when semantic search is disabled (`ninguno`); keyword search still works. */
export function createEmbeddingModel(s: StoredSettings, getSecret: GetSecret): EmbeddingModel | null {
  const provider: EmbeddingProvider = s.embedding.provider
  const model = s.embedding.model.trim()
  if (provider === 'ninguno' || !model) return null
  switch (provider) {
    case 'ollama':
      return ollama(s).embeddingModel(model)
    case 'openai':
      return createOpenAI({ apiKey: requireKey(getSecret, 'openai', 'OpenAI') }).embeddingModel(model)
    case 'compatible':
      return compatible(s, getSecret).embeddingModel(model)
  }
}

/** Identifier stored next to each embedding so a model change triggers re-embedding. */
export function embeddingModelKey(s: StoredSettings): string {
  return `${s.embedding.provider}:${s.embedding.model.trim()}`
}

/** Lists models installed in Ollama (`ollama list`). */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${trimSlash(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}`)
  const body = (await res.json()) as { models?: { name: string }[] }
  return (body.models ?? []).map((m) => m.name).sort()
}

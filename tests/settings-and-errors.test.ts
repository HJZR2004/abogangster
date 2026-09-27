import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { humanizeAiError } from '../src/main/ai/errors'
import { contextBudget, isLocalUrl } from '../src/main/ai/providers'
import { UserError } from '../src/main/errors'
import { SettingsStore } from '../src/main/settings/settings-store'
import { fakeCipher, tempDir } from './helpers'

let cleanup = (): void => {}
afterEach(() => cleanup())

describe('SettingsStore', () => {
  it('creates defaults, encrypts secrets and never exposes them', () => {
    const t = tempDir()
    cleanup = t.cleanup
    const file = join(t.dir, 'settings.json')
    const store = new SettingsStore(file, fakeCipher, join(t.dir, 'ws'))
    expect(store.get().chat.provider).toBe('ollama')

    store.update({ anthropicApiKey: 'sk-ant-secreto', chat: { provider: 'anthropic', model: 'claude-sonnet-5' } })
    expect(readFileSync(file, 'utf8')).not.toContain('sk-ant-secreto')
    expect(store.getSecret('anthropic')).toBe('sk-ant-secreto')
    expect(store.toPublic().anthropic.hasApiKey).toBe(true)
    expect(JSON.stringify(store.toPublic())).not.toContain('secreto')

    // Reload from disk.
    const reloaded = new SettingsStore(file, fakeCipher, join(t.dir, 'otro'))
    expect(reloaded.getSecret('anthropic')).toBe('sk-ant-secreto')
    expect(reloaded.get().workspaceDir).toBe(join(t.dir, 'ws'))

    reloaded.update({ anthropicApiKey: null })
    expect(reloaded.toPublic().anthropic.hasApiKey).toBe(false)
  })

  it('keeps the existing key when the update does not mention it', () => {
    const t = tempDir()
    cleanup = t.cleanup
    const store = new SettingsStore(join(t.dir, 's.json'), fakeCipher, t.dir)
    store.update({ openaiApiKey: 'sk-1' })
    store.update({ fontSize: 20 })
    expect(store.getSecret('openai')).toBe('sk-1')
  })
})

describe('providers', () => {
  it('classifies local addresses', () => {
    expect(isLocalUrl('http://127.0.0.1:11434')).toBe(true)
    expect(isLocalUrl('http://localhost:1234/v1')).toBe(true)
    expect(isLocalUrl('http://192.168.1.20:8080/v1')).toBe(true)
    expect(isLocalUrl('https://api.openai.com/v1')).toBe(false)
    expect(isLocalUrl('no es url')).toBe(false)
  })

  it('uses a smaller context budget for local models', () => {
    const t = tempDir()
    cleanup = t.cleanup
    const store = new SettingsStore(join(t.dir, 's.json'), fakeCipher, t.dir)
    const local = contextBudget(store.get())
    store.update({ chat: { provider: 'anthropic', model: 'x' } })
    expect(contextBudget(store.get())).toBeGreaterThan(local)
    store.update({ contextChars: 5000 })
    expect(contextBudget(store.get())).toBe(5000)
  })
})

describe('humanizeAiError', () => {
  const ctx = { provider: 'ollama', model: 'qwen' }

  it('explains connection problems with Ollama', () => {
    const err = new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    expect(humanizeAiError(err, ctx).message).toMatch(/Ollama esté abierto/)
  })

  it('explains missing models with the install command', () => {
    const err = Object.assign(new Error('model "qwen" not found'), { statusCode: 404 })
    expect(humanizeAiError(err, ctx).message).toContain('ollama pull qwen')
  })

  it('explains invalid keys', () => {
    const err = Object.assign(new Error('invalid x-api-key'), { statusCode: 401 })
    expect(humanizeAiError(err, { provider: 'anthropic', model: 'x' }).message).toMatch(/clave de API/)
  })

  it('passes user errors through', () => {
    const err = new UserError('mensaje propio')
    expect(humanizeAiError(err, ctx)).toBe(err)
  })
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TextStreamer } from '../src/main/ai/ai-service'
import { SettingsStore, type SecretCipher } from '../src/main/settings/settings-store'

/** Reversible fake "encryption" so tests can check secrets are not stored in plain text. */
export const fakeCipher: SecretCipher = {
  available: () => true,
  encrypt: (plain) => Buffer.from(plain.split('').reverse().join('')).toString('base64'),
  decrypt: (encoded) => Buffer.from(encoded, 'base64').toString().split('').reverse().join('')
}

export function tempDir(prefix = 'abogangster-test-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export function createSettings(root: string): SettingsStore {
  const store = new SettingsStore(join(root, 'settings.json'), fakeCipher, join(root, 'workspace'))
  store.update({ embedding: { provider: 'ninguno', model: '' }, chat: { provider: 'ollama', model: 'modelo-de-prueba' } })
  return store
}

/** A streamer that answers with a canned text per call and records the prompts it received. */
export function fakeStreamer(answer: (task: string, call: number) => string): TextStreamer & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (req) => {
    const last = req.messages[req.messages.length - 1]
    const content = last?.content
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => ('text' in p ? p.text : '')).join('\n') : ''
    calls.push(text)
    const out = answer(text, calls.length)
    req.onDelta?.(out)
    return out
  }) as TextStreamer & { calls: string[] }
  fn.calls = calls
  return fn
}

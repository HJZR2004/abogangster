import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ChatProvider, EmbeddingProvider, LawyerProfile, PublicSettings, SettingsUpdate } from '@shared/types'
import { createLogger } from '../logger'

const log = createLogger('settings')

export type SecretName = 'anthropic' | 'openai' | 'compatible'

/** Encrypts secrets at rest. In the app this wraps Electron's `safeStorage` (Windows DPAPI). */
export interface SecretCipher {
  available(): boolean
  encrypt(plain: string): string
  decrypt(encoded: string): string
}

export interface StoredSettings {
  version: 1
  workspaceDir: string
  chat: { provider: ChatProvider; model: string }
  embedding: { provider: EmbeddingProvider; model: string }
  ollama: { baseUrl: string }
  compatible: { baseUrl: string }
  /** Values are `enc:<base64>` (encrypted) or `plain:<value>` (only if encryption is unavailable). */
  secrets: Partial<Record<SecretName, string>>
  contextChars: number
  localOnlyGlobal: boolean
  profile: LawyerProfile
  generalRules: string
  fontSize: number
}

export const EMPTY_PROFILE: LawyerProfile = {
  nombre: '',
  cedula: '',
  despacho: '',
  domicilio: '',
  telefono: '',
  correo: '',
  ciudad: '',
  jurisdiccion: ''
}

export const DEFAULT_GENERAL_RULES = [
  'Redactar en español jurídico formal, claro y respetuoso hacia la autoridad.',
  'No inventar hechos, fechas, nombres, montos, artículos de ley ni criterios judiciales que no aparezcan en los documentos del caso o en la biblioteca.',
  'Cuando falte un dato, escribir [COMPLETAR: descripción del dato] para que el abogado lo revise.',
  'Numerar los hechos y los puntos petitorios cuando corresponda.'
].join('\n')

export function defaultSettings(workspaceDir: string): StoredSettings {
  return {
    version: 1,
    workspaceDir,
    chat: { provider: 'ollama', model: '' },
    // Multilingual: works much better with Spanish than English-only embedding models.
    embedding: { provider: 'ollama', model: 'bge-m3' },
    ollama: { baseUrl: 'http://127.0.0.1:11434' },
    compatible: { baseUrl: '' },
    secrets: {},
    contextChars: 0,
    localOnlyGlobal: false,
    profile: { ...EMPTY_PROFILE },
    generalRules: DEFAULT_GENERAL_RULES,
    fontSize: 18
  }
}

/** Merges a possibly partial/old settings object onto the defaults. */
export function normalizeSettings(raw: unknown, defaults: StoredSettings): StoredSettings {
  if (!raw || typeof raw !== 'object') return defaults
  const r = raw as Partial<StoredSettings>
  return {
    ...defaults,
    ...r,
    version: 1,
    chat: { ...defaults.chat, ...r.chat },
    embedding: { ...defaults.embedding, ...r.embedding },
    ollama: { ...defaults.ollama, ...r.ollama },
    compatible: { ...defaults.compatible, ...r.compatible },
    secrets: { ...r.secrets },
    profile: { ...defaults.profile, ...r.profile }
  }
}

export class SettingsStore {
  private data: StoredSettings

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher,
    defaultWorkspaceDir: string
  ) {
    const defaults = defaultSettings(defaultWorkspaceDir)
    let raw: unknown = null
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('No se pudo leer la configuración, se usan valores por defecto', err)
    }
    this.data = normalizeSettings(raw, defaults)
    if (!raw) this.save()
  }

  get(): Readonly<StoredSettings> {
    return this.data
  }

  getSecret(name: SecretName): string {
    const value = this.data.secrets[name]
    if (!value) return ''
    if (value.startsWith('plain:')) return value.slice('plain:'.length)
    if (value.startsWith('enc:')) {
      try {
        return this.cipher.decrypt(value.slice('enc:'.length))
      } catch (err) {
        log.error(`No se pudo descifrar la clave "${name}"`, err)
        return ''
      }
    }
    return ''
  }

  private setSecret(name: SecretName, value: string | null | undefined): void {
    if (value === undefined) return
    if (value === null || value.trim() === '') {
      delete this.data.secrets[name]
      return
    }
    const trimmed = value.trim()
    this.data.secrets[name] = this.cipher.available() ? `enc:${this.cipher.encrypt(trimmed)}` : `plain:${trimmed}`
  }

  update(update: SettingsUpdate): void {
    const { anthropicApiKey, openaiApiKey, compatibleApiKey, ...rest } = update
    this.data = normalizeSettings({ ...this.data, ...rest }, this.data)
    this.setSecret('anthropic', anthropicApiKey)
    this.setSecret('openai', openaiApiKey)
    this.setSecret('compatible', compatibleApiKey)
    this.save()
  }

  setWorkspaceDir(dir: string): void {
    this.data = { ...this.data, workspaceDir: dir }
    this.save()
  }

  toPublic(): PublicSettings {
    const d = this.data
    return {
      workspaceDir: d.workspaceDir,
      chat: { ...d.chat },
      embedding: { ...d.embedding },
      ollama: { ...d.ollama },
      anthropic: { hasApiKey: Boolean(d.secrets.anthropic) },
      openai: { hasApiKey: Boolean(d.secrets.openai) },
      compatible: { baseUrl: d.compatible.baseUrl, hasApiKey: Boolean(d.secrets.compatible) },
      contextChars: d.contextChars,
      localOnlyGlobal: d.localOnlyGlobal,
      profile: { ...d.profile },
      generalRules: d.generalRules,
      fontSize: d.fontSize,
      secretsEncrypted: this.cipher.available()
    }
  }

  /** Atomic write: a crash mid-write never leaves a corrupt settings file. */
  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
  }
}

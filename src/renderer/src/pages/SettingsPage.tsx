import { useState, type ReactNode } from 'react'
import { Cpu, FolderOpen, Minus, Plug, Plus, RefreshCw, Save, ScrollText, ShieldCheck, Type, User } from 'lucide-react'
import type { ChatProvider, ConnectionTestResult, EmbeddingProvider, LawyerProfile, SettingsUpdate } from '@shared/types'
import { useFeedback } from '../components/feedback'
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from '../components/ui'
import { errorText, invoke, useLoad } from '../lib/api'
import { useSettings } from '../lib/settings-context'

const CLAUDE_MODELS = ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5']
const OPENAI_MODELS = ['gpt-5', 'gpt-5-mini']

function Section({ icon: Icon, title, subtitle, children }: { icon: typeof User; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-5 flex items-start gap-3">
        <Icon className="mt-1 size-7 shrink-0 text-brand-600" aria-hidden />
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {subtitle && <p className="text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

function useSave() {
  const feedback = useFeedback()
  const { reload } = useSettings()
  const [saving, setSaving] = useState(false)
  const save = async (update: SettingsUpdate, message = 'Configuración guardada.') => {
    setSaving(true)
    try {
      await invoke('settings:update', update)
      await reload()
      feedback.success(message)
      return true
    } catch (err) {
      feedback.error(errorText(err))
      return false
    } finally {
      setSaving(false)
    }
  }
  return { save, saving }
}

function ProfileSection() {
  const { settings } = useSettings()
  const [profile, setProfile] = useState<LawyerProfile>(settings.profile)
  const { save, saving } = useSave()
  const field = (key: keyof LawyerProfile, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => <Input id={id} value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} />}
    </Field>
  )
  return (
    <Section icon={User} title="Sus datos" subtitle="Se usan para llenar automáticamente las plantillas (firma, cédula, domicilio).">
      <div className="grid gap-4 md:grid-cols-2">
        {field('nombre', 'Nombre completo', 'Como aparece en los escritos, p. ej. «Lic. Roberto Zárate».')}
        {field('cedula', 'Cédula profesional')}
        {field('despacho', 'Nombre del despacho')}
        {field('domicilio', 'Domicilio para oír notificaciones')}
        {field('telefono', 'Teléfono')}
        {field('correo', 'Correo electrónico')}
        {field('ciudad', 'Ciudad', 'Aparece junto a la fecha.')}
        {field('jurisdiccion', 'Jurisdicción', 'P. ej. «México, Jalisco». Ayuda a la IA a usar el vocabulario correcto.')}
      </div>
      <div className="mt-5">
        <Button variant="primary" icon={Save} loading={saving} onClick={() => void save({ profile })}>
          Guardar mis datos
        </Button>
      </div>
    </Section>
  )
}

function RulesSection() {
  const { settings } = useSettings()
  const [rules, setRules] = useState(settings.generalRules)
  const { save, saving } = useSave()
  return (
    <Section icon={ScrollText} title="Reglas generales de redacción" subtitle="Se aplican a todos los escritos. Una regla por línea.">
      <Textarea rows={6} value={rules} onChange={(e) => setRules(e.target.value)} aria-label="Reglas generales" />
      <div className="mt-4">
        <Button variant="primary" icon={Save} loading={saving} onClick={() => void save({ generalRules: rules })}>
          Guardar reglas
        </Button>
      </div>
    </Section>
  )
}

function FontSection() {
  const { settings } = useSettings()
  const { save } = useSave()
  const change = (delta: number) => {
    const next = Math.min(26, Math.max(14, settings.fontSize + delta))
    if (next !== settings.fontSize) void save({ fontSize: next }, 'Tamaño de letra actualizado.')
  }
  return (
    <Section icon={Type} title="Tamaño de la letra">
      <div className="flex flex-wrap items-center gap-4">
        <Button icon={Minus} onClick={() => change(-1)} disabled={settings.fontSize <= 14}>
          Más pequeña
        </Button>
        <span className="min-w-20 text-center text-xl font-bold">{settings.fontSize} px</span>
        <Button icon={Plus} onClick={() => change(1)} disabled={settings.fontSize >= 26}>
          Más grande
        </Button>
      </div>
      <p className="mt-3 text-muted">También puede usar Ctrl + y Ctrl − en el teclado.</p>
    </Section>
  )
}

function TestResult({ result }: { result: ConnectionTestResult | null }) {
  if (!result) return null
  return <Alert tone={result.ok ? 'ok' : 'bad'}>{result.message}</Alert>
}

function KeyInput({ label, has, value, onChange }: { label: string; has: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={has ? 'Hay una clave guardada (cifrada). Déjelo vacío para conservarla.' : 'La clave se guarda cifrada en esta computadora.'}>
      {(id) => <Input id={id} type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={has ? '•••••••• (guardada)' : 'Pegue aquí la clave'} />}
    </Field>
  )
}

function AiSection() {
  const { settings } = useSettings()
  const feedback = useFeedback()
  const { save, saving } = useSave()
  const [chatProvider, setChatProvider] = useState<ChatProvider>(settings.chat.provider)
  const [chatModel, setChatModel] = useState(settings.chat.model)
  const [embProvider, setEmbProvider] = useState<EmbeddingProvider>(settings.embedding.provider)
  const [embModel, setEmbModel] = useState(settings.embedding.model)
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollama.baseUrl)
  const [compatUrl, setCompatUrl] = useState(settings.compatible.baseUrl)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [compatKey, setCompatKey] = useState('')
  const [contextChars, setContextChars] = useState(settings.contextChars)
  const [chatTest, setChatTest] = useState<ConnectionTestResult | null>(null)
  const [embTest, setEmbTest] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState<'chat' | 'emb' | null>(null)
  const ollamaModels = useLoad(() => invoke('settings:ollamaModels').catch(() => [] as string[]), [])

  const buildUpdate = (): SettingsUpdate => ({
    chat: { provider: chatProvider, model: chatModel.trim() },
    embedding: { provider: embProvider, model: embModel.trim() },
    ollama: { baseUrl: ollamaUrl.trim() },
    compatible: { baseUrl: compatUrl.trim() },
    contextChars,
    ...(anthropicKey.trim() ? { anthropicApiKey: anthropicKey.trim() } : {}),
    ...(openaiKey.trim() ? { openaiApiKey: openaiKey.trim() } : {}),
    ...(compatKey.trim() ? { compatibleApiKey: compatKey.trim() } : {})
  })

  const saveAll = async () => {
    const ok = await save(buildUpdate())
    if (ok) {
      setAnthropicKey('')
      setOpenaiKey('')
      setCompatKey('')
      void ollamaModels.reload()
    }
    return ok
  }

  const test = async (which: 'chat' | 'emb') => {
    if (!(await saveAll())) return
    setTesting(which)
    try {
      if (which === 'chat') setChatTest(await invoke('settings:testChat'))
      else setEmbTest(await invoke('settings:testEmbedding'))
    } catch (err) {
      feedback.error(errorText(err))
    } finally {
      setTesting(null)
    }
  }

  const suggestions = chatProvider === 'ollama' ? (ollamaModels.data ?? []) : chatProvider === 'anthropic' ? CLAUDE_MODELS : chatProvider === 'openai' ? OPENAI_MODELS : []

  return (
    <Section icon={Cpu} title="Inteligencia artificial" subtitle="Configuración técnica. Normalmente la hace quien instaló el programa.">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Proveedor para redactar">
            {(id) => (
              <Select id={id} value={chatProvider} onChange={(e) => setChatProvider(e.target.value as ChatProvider)}>
                <option value="ollama">Ollama (local, sin internet)</option>
                <option value="anthropic">Claude (Anthropic, en internet)</option>
                <option value="openai">OpenAI (en internet)</option>
                <option value="compatible">Otro compatible con OpenAI (LM Studio, OpenRouter…)</option>
              </Select>
            )}
          </Field>
          <Field label="Modelo" hint={chatProvider === 'ollama' ? 'Modelos instalados en Ollama. Instale otros con «ollama pull nombre».' : undefined}>
            {(id) => (
              <>
                <Input id={id} list="chat-models" value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="Nombre del modelo" />
                <datalist id="chat-models">
                  {suggestions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>

        {(chatProvider === 'ollama' || embProvider === 'ollama') && (
          <Field label="Dirección de Ollama">{(id) => <Input id={id} value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />}</Field>
        )}
        {chatProvider === 'anthropic' && <KeyInput label="Clave de API de Anthropic" has={settings.anthropic.hasApiKey} value={anthropicKey} onChange={setAnthropicKey} />}
        {(chatProvider === 'openai' || embProvider === 'openai') && <KeyInput label="Clave de API de OpenAI" has={settings.openai.hasApiKey} value={openaiKey} onChange={setOpenaiKey} />}
        {(chatProvider === 'compatible' || embProvider === 'compatible') && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Dirección (URL base)" hint="Ej.: http://127.0.0.1:1234/v1 para LM Studio.">
              {(id) => <Input id={id} value={compatUrl} onChange={(e) => setCompatUrl(e.target.value)} />}
            </Field>
            <KeyInput label="Clave de API (si la requiere)" has={settings.compatible.hasApiKey} value={compatKey} onChange={setCompatKey} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button icon={Plug} loading={testing === 'chat'} disabled={saving} onClick={() => void test('chat')}>
            Guardar y probar conexión
          </Button>
          {chatProvider === 'ollama' && (
            <Button variant="ghost" icon={RefreshCw} onClick={() => void ollamaModels.reload()}>
              Actualizar lista de modelos
            </Button>
          )}
        </div>
        <TestResult result={chatTest} />

        <hr className="border-line" />

        <div>
          <h3 className="text-xl font-bold">Búsqueda inteligente (embeddings)</h3>
          <p className="text-muted">Permite encontrar documentos por significado y no solo por palabras. Recomendado: Ollama con «bge-m3» (multilingüe, bueno en español).</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Proveedor">
            {(id) => (
              <Select id={id} value={embProvider} onChange={(e) => setEmbProvider(e.target.value as EmbeddingProvider)}>
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
                <option value="compatible">Otro compatible con OpenAI</option>
                <option value="ninguno">Desactivada (solo búsqueda por palabras)</option>
              </Select>
            )}
          </Field>
          {embProvider !== 'ninguno' && (
            <Field label="Modelo de embeddings">{(id) => <Input id={id} value={embModel} onChange={(e) => setEmbModel(e.target.value)} placeholder="bge-m3" />}</Field>
          )}
        </div>
        <div>
          <Button icon={Plug} loading={testing === 'emb'} disabled={saving} onClick={() => void test('emb')}>
            Guardar y probar búsqueda inteligente
          </Button>
        </div>
        <TestResult result={embTest} />

        <hr className="border-line" />

        <Field label="Límite de contexto (caracteres)" hint="0 = automático (24 000 para modelos locales, 150 000 para servicios en internet). Bájelo si el modelo local se queda sin memoria.">
          {(id) => <Input id={id} type="number" min={0} step={1000} value={contextChars} onChange={(e) => setContextChars(Number(e.target.value) || 0)} className="max-w-xs" />}
        </Field>

        <div>
          <Button variant="primary" icon={Save} loading={saving} onClick={() => void saveAll()}>
            Guardar configuración de IA
          </Button>
        </div>
      </div>
    </Section>
  )
}

function PrivacySection() {
  const { settings } = useSettings()
  const { save } = useSave()
  return (
    <Section icon={ShieldCheck} title="Privacidad">
      <Checkbox
        checked={settings.localOnlyGlobal}
        onChange={(v) => void save({ localOnlyGlobal: v })}
        label="Usar solo IA local para todos los casos"
        hint="Si está activado, ningún documento se envía a servicios de internet, aunque el caso no esté marcado como confidencial."
      />
      {!settings.secretsEncrypted && (
        <div className="mt-4">
          <Alert tone="warn" title="Cifrado no disponible">
            Windows no permitió cifrar las claves de API; se guardan sin cifrar en la carpeta del usuario.
          </Alert>
        </div>
      )}
    </Section>
  )
}

function WorkspaceSection() {
  const { settings } = useSettings()
  const feedback = useFeedback()
  const info = useLoad(() => invoke('app:info'), [])
  const change = async () => {
    const folder = await invoke('app:pickFolder')
    if (!folder) return
    const ok = await feedback.confirm({
      title: 'Cambiar carpeta de trabajo',
      message: (
        <>
          <p>El programa se reiniciará usando la carpeta:</p>
          <p className="mt-2 break-all font-mono">{folder}</p>
          <p className="mt-3">Los casos de la carpeta actual no se mueven. Use esta opción para abrir una copia de seguridad o una carpeta en otro disco.</p>
        </>
      ),
      confirmLabel: 'Cambiar y reiniciar'
    })
    if (ok) await invoke('settings:changeWorkspace', folder).catch((err) => feedback.error(errorText(err)))
  }
  return (
    <Section icon={FolderOpen} title="Carpeta de trabajo" subtitle="Aquí se guardan casos, biblioteca y plantillas. Respaldar esta carpeta respalda todo.">
      <p className="mb-4 break-all rounded-lg bg-stone-100 p-3 font-mono">{settings.workspaceDir}</p>
      <div className="flex flex-wrap gap-3">
        <Button icon={FolderOpen} onClick={() => void invoke('app:openPath', settings.workspaceDir).catch((err) => feedback.error(errorText(err)))}>
          Abrir carpeta
        </Button>
        <Button onClick={() => void change()}>Usar otra carpeta…</Button>
        <Button icon={RefreshCw} onClick={() => void invoke('indexing:rescan').then(() => feedback.success('Revisando todos los documentos…'))}>
          Volver a revisar documentos
        </Button>
      </div>
      {info.data && (
        <p className="mt-5 text-sm text-muted">
          Versión {info.data.version} · Registros: <span className="break-all">{info.data.logsDir}</span>
        </p>
      )}
    </Section>
  )
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" />
      <div className="flex flex-col gap-6 pb-12">
        <ProfileSection />
        <RulesSection />
        <FontSection />
        <PrivacySection />
        <AiSection />
        <WorkspaceSection />
      </div>
    </>
  )
}

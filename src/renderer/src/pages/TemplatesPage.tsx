import { useState } from 'react'
import { AlertTriangle, FilePlus2, FileStack, FolderOpen, Save, Sparkles, UserPen } from 'lucide-react'
import type { TemplateRecord, TemplateUpdate } from '@shared/types'
import { Modal, useFeedback } from '../components/feedback'
import { Alert, Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui'
import { errorText, invoke, useEvent, useLoad } from '../lib/api'
import { plural } from '../lib/format'

const AUTO_FIELDS_HELP = [
  ['{{expediente}}', 'número de expediente'],
  ['{{juzgado}}', 'juzgado o autoridad'],
  ['{{cliente}}', 'nombre del cliente'],
  ['{{contraparte}}', 'contraparte'],
  ['{{asunto}}', 'nombre del caso'],
  ['{{fecha}}', 'fecha de hoy'],
  ['{{ciudad}}', 'ciudad (de su perfil)'],
  ['{{abogado_nombre}}', 'su nombre'],
  ['{{cedula_profesional}}', 'su cédula'],
  ['{{domicilio_despacho}}', 'domicilio del despacho']
]

function TemplateEditor({ template, onClose, onSaved }: { template: TemplateRecord; onClose: () => void; onSaved: () => void }) {
  const feedback = useFeedback()
  const [form, setForm] = useState<TemplateUpdate>({
    name: template.name,
    description: template.description,
    rules: template.rules,
    fields: template.fields
  })
  const [saving, setSaving] = useState(false)

  const setField = (index: number, patch: Partial<TemplateUpdate['fields'][number]>) =>
    setForm((f) => ({ ...f, fields: f.fields.map((x, i) => (i === index ? { ...x, ...patch } : x)) }))

  const save = async () => {
    setSaving(true)
    try {
      await invoke('templates:update', template.id, form)
      feedback.success('Plantilla guardada.')
      onSaved()
    } catch (err) {
      feedback.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Plantilla: ${template.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Save} loading={saving} onClick={() => void save()}>
            Guardar plantilla
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {template.error && <Alert tone="warn" title="Problema en el archivo de Word">{template.error}</Alert>}
        <Field label="Nombre">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="¿Para qué sirve?" hint="Se muestra al elegir el tipo de escrito.">
          {(id) => <Input id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
        </Field>
        <Field label="Reglas de este escrito" hint="Una regla por línea. La IA las sigue en cada sección de esta plantilla.">
          {(id) => <Textarea id={id} rows={4} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />}
        </Field>

        <div>
          <h3 className="mb-1 text-xl font-bold">Campos de la plantilla</h3>
          <p className="mb-3 text-muted">Cada {'{{campo}}'} del documento de Word. Indique cuáles redacta la IA y qué debe contener cada uno.</p>
          <div className="flex flex-col gap-3">
            {form.fields.map((f, i) => (
              <div key={f.name} className="rounded-lg border border-line p-4">
                <p className="mb-2 font-mono text-sm text-muted">{`{{${f.name}}}`}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre visible">{(id) => <Input id={id} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />}</Field>
                  <Field label="¿Quién lo llena?">
                    {(id) => (
                      <Select id={id} value={f.mode} onChange={(e) => setField(i, { mode: e.target.value as 'ia' | 'manual' })}>
                        <option value="ia">La IA lo redacta</option>
                        <option value="manual">Dato fijo (automático o a mano)</option>
                      </Select>
                    )}
                  </Field>
                  {f.mode === 'ia' && (
                    <div className="md:col-span-2">
                      <Field label="¿Qué debe contener?">
                        {(id) => <Textarea id={id} rows={2} value={f.instruction} onChange={(e) => setField(i, { instruction: e.target.value })} />}
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {form.fields.length === 0 && <p className="text-muted">Esta plantilla no tiene campos.</p>}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function TemplatesPage() {
  const feedback = useFeedback()
  const templates = useLoad(() => invoke('templates:list'), [])
  const [editing, setEditing] = useState<TemplateRecord | null>(null)
  useEvent('templates:changed', () => void templates.reload())

  const importTemplates = async () => {
    const files = (await invoke('app:pickFiles')).filter((f) => f.toLowerCase().endsWith('.docx'))
    if (files.length === 0) return
    try {
      const n = await invoke('templates:import', files)
      feedback.success(`${plural(n, 'plantilla agregada', 'plantillas agregadas')}.`)
      void templates.reload()
    } catch (err) {
      feedback.error(errorText(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Plantillas"
        subtitle="Sus formatos de Word. La IA escribe dentro de ellos respetando el formato del despacho."
        actions={
          <>
            <Button icon={FolderOpen} onClick={() => void invoke('templates:openFolder')}>
              Abrir carpeta de plantillas
            </Button>
            <Button variant="primary" icon={FilePlus2} onClick={() => void importTemplates()}>
              Agregar plantilla de Word
            </Button>
          </>
        }
      />

      <details className="mb-6 rounded-xl border border-brand-100 bg-brand-50 p-5">
        <summary className="cursor-pointer text-lg font-bold text-brand-800">¿Cómo preparo una plantilla?</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-6">
          <li>Abra en Word un escrito que ya use como formato y guárdelo con otro nombre.</li>
          <li>
            Borre las partes que cambian en cada caso y en su lugar escriba un nombre entre llaves dobles, por ejemplo <code>{'{{contestacion_hechos}}'}</code> o <code>{'{{pruebas}}'}</code>.
          </li>
          <li>Agregue el archivo aquí con «Agregar plantilla de Word». El programa detecta los campos solo.</li>
          <li>Abra la plantilla para indicar qué debe contener cada campo.</li>
        </ol>
        <p className="mt-4 font-semibold">Estos campos se llenan solos con los datos del caso y de su perfil:</p>
        <ul className="mt-2 grid gap-1 md:grid-cols-2">
          {AUTO_FIELDS_HELP.map(([tag, text]) => (
            <li key={tag}>
              <code className="font-semibold">{tag}</code> — {text}
            </li>
          ))}
        </ul>
      </details>

      {templates.loading ? (
        <Spinner />
      ) : (templates.data?.length ?? 0) === 0 ? (
        <EmptyState icon={FileStack} title="No hay plantillas">
          Agregue sus formatos de Word para que la IA escriba dentro de ellos.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {templates.data!.map((t) => {
            const ai = t.fields.filter((f) => f.mode === 'ia').length
            const manual = t.fields.length - ai
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 text-left shadow-sm transition hover:border-brand-600 hover:bg-brand-50"
                >
                  <div className="flex items-start gap-3">
                    <FileStack className="mt-1 size-7 shrink-0 text-brand-600" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xl font-bold">{t.name}</p>
                      {t.description && <p className="text-muted">{t.description}</p>}
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Badge tone="brand">
                      <Sparkles className="size-3.5" aria-hidden /> {plural(ai, 'sección con IA', 'secciones con IA')}
                    </Badge>
                    <Badge>
                      <UserPen className="size-3.5" aria-hidden /> {plural(manual, 'dato fijo', 'datos fijos')}
                    </Badge>
                    {t.error && (
                      <Badge tone="warn">
                        <AlertTriangle className="size-3.5" aria-hidden /> Revisar
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void templates.reload()
          }}
        />
      )}
    </>
  )
}

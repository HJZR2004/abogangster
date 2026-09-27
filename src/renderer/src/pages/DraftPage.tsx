import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Check, FileDown, FolderOpen, Loader2, RotateCcw, Sparkles, Square, Trash2, Wand2 } from 'lucide-react'
import { countPending } from '@shared/text'
import { BODY_FIELD, type DraftRecord, type TemplateField } from '@shared/types'
import { DraftStatusBadge } from '../components/DraftList'
import { useFeedback } from '../components/feedback'
import { Alert, Button, Card, Field, Input, Spinner, Textarea, cx } from '../components/ui'
import { errorText, invoke, useEvent, useLoad } from '../lib/api'

const SAVE_DELAY_MS = 800

/** Inline "rewrite this section" control. */
function RegenerateControl({ disabled, onRegenerate }: { disabled: boolean; onRegenerate: (extra: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <Button variant="ghost" icon={Wand2} disabled={disabled} onClick={() => setOpen(true)}>
        Volver a redactar esta parte
      </Button>
    )
  }
  const run = async () => {
    setBusy(true)
    try {
      await onRegenerate(extra)
      setOpen(false)
      setExtra('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-brand-50 p-3">
      <Field label="¿Qué quiere cambiar? (opcional)">
        {(id) => <Input id={id} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ej.: Más breve, y mencionar el recibo de pago del 10 de febrero" autoFocus />}
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void run()}>
          Redactar de nuevo
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function SectionCard({
  label,
  value,
  generating,
  locked,
  onChange,
  onRegenerate
}: {
  label: string
  value: string
  generating: boolean
  locked: boolean
  onChange: (v: string) => void
  onRegenerate: (extra: string) => Promise<void>
}) {
  const pending = countPending(value)
  return (
    <Card className={cx(generating && 'ring-2 ring-brand-600')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{label}</h3>
        <div className="flex items-center gap-3">
          {generating && (
            <span className="flex items-center gap-2 font-semibold text-brand-700">
              <Loader2 className="size-5 animate-spin" aria-hidden /> Redactando…
            </span>
          )}
          {!generating && pending > 0 && <span className="rounded-full bg-warn-50 px-3 py-0.5 text-sm font-semibold text-warn-700">{pending} por completar</span>}
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={locked}
        rows={generating ? 6 : 4}
        aria-label={label}
        className="document-text text-lg"
        placeholder={locked ? '' : 'Todavía sin texto.'}
      />
      <div className="mt-3">
        <RegenerateControl disabled={locked} onRegenerate={onRegenerate} />
      </div>
    </Card>
  )
}

export function DraftPage() {
  const { draftId = '' } = useParams()
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [params, setParams] = useSearchParams()

  const draft = useLoad(() => invoke('drafts:get', draftId), [draftId])
  const templates = useLoad(() => invoke('templates:list'), [])
  const caseId = draft.data?.caseId
  const caseData = useLoad(() => (caseId ? invoke('cases:get', caseId) : Promise.resolve(null)), [caseId])

  const [values, setValues] = useState<Record<string, string>>({})
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [activeField, setActiveField] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const autoStarted = useRef(false)

  // Take server state whenever it (re)loads and we have no unsaved local edits.
  const syncFromServer = useCallback((d: DraftRecord) => {
    if (dirty.current) return
    setValues(d.fieldValues)
    setBody(d.body)
    setTitle(d.title)
  }, [])
  useEffect(() => {
    if (draft.data) syncFromServer(draft.data)
  }, [draft.data, syncFromServer])

  useEvent('drafts:progress', (e) => {
    if (e.draftId !== draftId) return
    if (e.type === 'field-start') {
      setActiveField(e.field)
      if (e.field === BODY_FIELD) setBody('')
      else setValues((v) => ({ ...v, [e.field]: '' }))
    } else if (e.type === 'delta') {
      if (e.field === BODY_FIELD) setBody((b) => b + e.delta)
      else setValues((v) => ({ ...v, [e.field]: (v[e.field] ?? '') + e.delta }))
    } else if (e.type === 'field-end') {
      if (e.field === BODY_FIELD) setBody(e.value)
      else setValues((v) => ({ ...v, [e.field]: e.value }))
    } else {
      setActiveField(null)
    }
  })

  // Refs so the debounced save always sends the latest text.
  const valuesRef = useRef(values)
  const bodyRef = useRef(body)
  const titleRef = useRef(title)
  valuesRef.current = values
  bodyRef.current = body
  titleRef.current = title

  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (!dirty.current) return
    setSaveState('saving')
    try {
      await invoke('drafts:update', draftId, { fieldValues: valuesRef.current, body: bodyRef.current, title: titleRef.current })
      dirty.current = false
      setSaveState('saved')
    } catch (err) {
      feedback.error(`No se pudieron guardar los cambios: ${errorText(err)}`)
      setSaveState('idle')
    }
  }, [draftId, feedback])

  const scheduleSave = () => {
    dirty.current = true
    setSaveState('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSave(), SAVE_DELAY_MS)
  }

  useEffect(() => () => void flushSave(), [flushSave])

  const runAi = useCallback(
    async (work: () => Promise<DraftRecord>) => {
      await flushSave()
      setRunning(true)
      try {
        const result = await work()
        dirty.current = false
        draft.setData(result)
        feedback.success('Redacción terminada. Revise el texto antes de crear el documento.')
      } catch (err) {
        feedback.error(errorText(err))
        await draft.reload()
      } finally {
        setRunning(false)
        setActiveField(null)
      }
    },
    [draft, feedback, flushSave]
  )

  const generateAll = useCallback(() => runAi(() => invoke('drafts:generate', draftId)), [runAi, draftId])

  // Coming from "Redactar escrito": start automatically once.
  useEffect(() => {
    if (autoStarted.current || params.get('redactar') !== '1' || !draft.data) return
    autoStarted.current = true
    setParams({}, { replace: true })
    if (draft.data.status === 'borrador') void generateAll()
  }, [draft.data, params, setParams, generateAll])

  if (draft.error) {
    return (
      <Alert tone="bad" title="No se pudo abrir el escrito">
        {draft.error}
      </Alert>
    )
  }
  const d = draft.data
  if (!d || templates.loading) return <Spinner />

  const template = d.templateId ? templates.data?.find((t) => t.id === d.templateId) : undefined
  const fields: TemplateField[] = template?.fields ?? []
  const manualFields = fields.filter((f) => f.mode === 'manual')
  const aiFields = fields.filter((f) => f.mode === 'ia')
  const isFreeform = !d.templateId
  const locked = running || d.status === 'generando'
  const allText = isFreeform ? body : Object.values(values).join('\n')
  const pending = countPending(allText)
  const emptyManual = manualFields.filter((f) => !values[f.name]?.trim())
  const hasContent = allText.trim().length > 0

  const exportDocx = async () => {
    await flushSave()
    setExporting(true)
    try {
      draft.setData(await invoke('drafts:export', draftId))
      feedback.success('Documento de Word creado en la carpeta del caso.')
    } catch (err) {
      feedback.error(errorText(err))
    } finally {
      setExporting(false)
    }
  }

  const regenerateAllConfirm = async () => {
    const ok = await feedback.confirm({
      title: 'Volver a redactar todo',
      message: 'La IA reescribirá todas las secciones y se perderán los cambios que haya hecho en ellas. ¿Continuar?',
      confirmLabel: 'Redactar todo de nuevo',
      danger: true
    })
    if (ok) await generateAll()
  }

  const remove = async () => {
    const ok = await feedback.confirm({
      title: 'Eliminar escrito',
      message: 'Se eliminará este borrador del programa. Si ya creó el documento de Word, ese archivo se conserva en la carpeta del caso.',
      confirmLabel: 'Eliminar borrador',
      danger: true
    })
    if (!ok) return
    await invoke('drafts:delete', draftId)
    navigate(`/casos/${d.caseId}?tab=escritos`)
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <Link to={`/casos/${d.caseId}?tab=escritos`} className="inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-5" aria-hidden /> {caseData.data?.title ?? 'Volver al caso'}
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              scheduleSave()
            }}
            readOnly={locked}
            aria-label="Título del escrito"
            title="Haga clic para cambiar el título"
            className="-ml-2 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-bold hover:border-line focus:border-brand-600 focus:bg-surface focus:outline-none"
          />
          <DraftStatusBadge status={running ? 'generando' : d.status} />
          <span className="text-sm text-muted" aria-live="polite">
            {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? (
              <span className="flex items-center gap-1">
                <Check className="size-4" /> Cambios guardados
              </span>
            ) : null}
          </span>
        </div>
        <p className="text-muted">{template ? `Plantilla: ${template.name}` : 'Escrito libre'}</p>
      </header>

      {d.error && !running && (
        <Alert tone="bad" title="La redacción no se completó" action={<Button icon={RotateCcw} onClick={() => void generateAll()}>Intentar de nuevo</Button>}>
          {d.error}
        </Alert>
      )}

      {running && (
        <Alert
          tone="info"
          title="La IA está redactando el escrito…"
          action={
            <Button icon={Square} onClick={() => void invoke('drafts:cancel', draftId)}>
              Detener
            </Button>
          }
        >
          Puede ir leyendo el texto conforme aparece. Con modelos locales esto puede tardar varios minutos.
        </Alert>
      )}

      {!running && hasContent && (
        <Alert tone={pending > 0 || emptyManual.length > 0 ? 'warn' : 'ok'} title="Revise el escrito antes de presentarlo">
          {pending > 0 && (
            <p>
              Hay <strong>{pending}</strong> {pending === 1 ? 'dato marcado' : 'datos marcados'} como <code>[COMPLETAR: …]</code> que debe llenar.
            </p>
          )}
          {emptyManual.length > 0 && <p>Faltan datos generales: {emptyManual.map((f) => f.label).join(', ')}.</p>}
          {pending === 0 && emptyManual.length === 0 && <p>No se detectaron datos pendientes. Aun así, lea el texto completo y verifique citas y fechas.</p>}
        </Alert>
      )}

      {manualFields.length > 0 && (
        <Card>
          <h2 className="mb-1 text-xl font-bold">Datos generales</h2>
          <p className="mb-4 text-muted">Se llenan con los datos del caso y de su perfil. Puede corregirlos aquí.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {manualFields.map((f) => (
              <Field key={f.name} label={f.label}>
                {(id) => (
                  <Input
                    id={id}
                    value={values[f.name] ?? ''}
                    readOnly={locked}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, [f.name]: e.target.value }))
                      scheduleSave()
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      )}

      {isFreeform ? (
        <SectionCard
          label="Texto del escrito"
          value={body}
          generating={activeField === BODY_FIELD}
          locked={locked}
          onChange={(v) => {
            setBody(v)
            scheduleSave()
          }}
          onRegenerate={(extra) => runAi(() => invoke('drafts:regenerateField', draftId, BODY_FIELD, extra))}
        />
      ) : (
        aiFields.map((f) => (
          <SectionCard
            key={f.name}
            label={f.label}
            value={values[f.name] ?? ''}
            generating={activeField === f.name}
            locked={locked}
            onChange={(v) => {
              setValues((vals) => ({ ...vals, [f.name]: v }))
              scheduleSave()
            }}
            onRegenerate={(extra) => runAi(() => invoke('drafts:regenerateField', draftId, f.name, extra))}
          />
        ))
      )}

      {d.outputPath && !running && (
        <Alert
          tone="ok"
          title="Documento de Word creado"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={FileDown} onClick={() => invoke('app:openPath', d.outputPath!).catch((err) => feedback.error(errorText(err)))}>
                Abrir en Word
              </Button>
              <Button icon={FolderOpen} onClick={() => invoke('app:showInFolder', d.outputPath!).catch((err) => feedback.error(errorText(err)))}>
                Mostrar en carpeta
              </Button>
            </div>
          }
        >
          <span className="break-all">{d.outputPath}</span>
        </Alert>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" icon={Trash2} onClick={() => void remove()} disabled={locked}>
            Eliminar
          </Button>
          <Button icon={RotateCcw} onClick={() => void (hasContent ? regenerateAllConfirm() : generateAll())} disabled={locked}>
            {hasContent ? 'Redactar todo de nuevo' : 'Redactar con IA'}
          </Button>
        </div>
        <Button variant="primary" size="lg" icon={FileDown} loading={exporting} disabled={locked || !hasContent} onClick={() => void exportDocx()}>
          {d.outputPath ? 'Actualizar documento de Word' : 'Crear documento de Word'}
        </Button>
      </div>
    </div>
  )
}

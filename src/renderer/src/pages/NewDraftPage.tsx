import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CheckCircle2, Circle, FileText, Sparkles } from 'lucide-react'
import { displayPath } from '../components/DocumentsPanel'
import { useFeedback } from '../components/feedback'
import { Alert, Button, Field, Input, PageHeader, Select, Spinner, Textarea, cx } from '../components/ui'
import { errorText, invoke, useLoad } from '../lib/api'
import { isAiConfigured, useSettings } from '../lib/settings-context'

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm" aria-labelledby={`paso-${n}`}>
      <div className="mb-4 flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{n}</span>
        <div>
          <h2 id={`paso-${n}`} className="text-2xl font-bold">
            {title}
          </h2>
          {hint && <p className="text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function ChoiceCard({ selected, onClick, title, text }: { selected: boolean; onClick: () => void; title: string; text?: string }) {
  const Icon = selected ? CheckCircle2 : Circle
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition',
        selected ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-600/50'
      )}
    >
      <Icon className={cx('mt-0.5 size-6 shrink-0', selected ? 'text-brand-600' : 'text-muted')} aria-hidden />
      <span>
        <span className="block text-lg font-semibold">{title}</span>
        {text && <span className="block text-muted">{text}</span>}
      </span>
    </button>
  )
}

const FREEFORM = '__libre__'

export function NewDraftPage() {
  const navigate = useNavigate()
  const feedback = useFeedback()
  const { settings } = useSettings()
  const [params] = useSearchParams()

  const cases = useLoad(() => invoke('cases:list'), [])
  const templates = useLoad(() => invoke('templates:list'), [])
  const [caseId, setCaseId] = useState(params.get('caso') ?? '')
  const docs = useLoad(() => (caseId ? invoke('documents:list', caseId) : Promise.resolve([])), [caseId])

  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => setSourceIds([]), [caseId])

  const activeCases = cases.data?.filter((c) => c.status !== 'cerrado') ?? []
  const usableTemplates = templates.data?.filter((t) => t.fields.some((f) => f.mode === 'ia')) ?? []
  const readyDocs = docs.data?.filter((d) => d.status === 'indexado') ?? []
  const selectedTemplate = templates.data?.find((t) => t.id === templateId)
  const aiReady = isAiConfigured(settings)
  const canCreate = aiReady && caseId !== '' && templateId !== ''

  const toggleSource = (id: string) => setSourceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const create = async () => {
    setCreating(true)
    try {
      const draft = await invoke('drafts:create', {
        caseId,
        templateId: templateId === FREEFORM ? null : templateId,
        title: title.trim() || (selectedTemplate?.name ?? ''),
        instructions,
        sourceDocumentIds: sourceIds
      })
      navigate(`/escritos/${draft.id}?redactar=1`)
    } catch (err) {
      feedback.error(errorText(err))
      setCreating(false)
    }
  }

  if (cases.loading || templates.loading) return <Spinner />

  return (
    <>
      <PageHeader title="Redactar un escrito" subtitle="Complete los pasos y la IA preparará un borrador para que usted lo revise." />

      {!aiReady && (
        <div className="mb-6">
          <Alert tone="warn" title="Falta configurar la inteligencia artificial">
            Vaya a{' '}
            <Link to="/configuracion" className="font-semibold underline">
              Configuración
            </Link>{' '}
            para elegir el modelo de IA.
          </Alert>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <Step n={1} title="¿Para qué caso es?">
          {activeCases.length === 0 ? (
            <Alert tone="info" title="Primero cree un caso">
              <Link to="/casos?nuevo=1" className="font-semibold underline">
                Crear un caso
              </Link>{' '}
              y cargue sus documentos.
            </Alert>
          ) : (
            <Field label="Caso">
              {(id) => (
                <Select id={id} value={caseId} onChange={(e) => setCaseId(e.target.value)} className="max-w-2xl text-lg">
                  <option value="">— Elija un caso —</option>
                  {activeCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.clientName ? ` (${c.clientName})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </Step>

        <Step n={2} title="¿Qué documento va a contestar?" hint="Marque el documento recibido (demanda, requerimiento, etc.). Es opcional: la IA también consulta el resto del caso.">
          {!caseId ? (
            <p className="text-muted">Primero elija el caso.</p>
          ) : docs.loading ? (
            <Spinner />
          ) : readyDocs.length === 0 ? (
            <p className="text-muted">Este caso no tiene documentos listos. Puede continuar sin documento o agregarlos en la pestaña «Documentos» del caso.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {readyDocs.map((d) => (
                <label key={d.id} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3', sourceIds.includes(d.id) ? 'border-brand-600 bg-brand-50' : 'border-line')}>
                  <input type="checkbox" className="mt-1 size-5 accent-brand-600" checked={sourceIds.includes(d.id)} onChange={() => toggleSource(d.id)} />
                  <FileText className="mt-0.5 size-6 shrink-0 text-brand-600" aria-hidden />
                  <span>
                    <span className="block font-semibold">{displayPath(d.relPath)}</span>
                    {d.description && <span className="block text-muted">{d.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </Step>

        <Step n={3} title="¿Qué tipo de escrito necesita?">
          <div role="radiogroup" aria-label="Tipo de escrito" className="grid gap-3 md:grid-cols-2">
            {usableTemplates.map((t) => (
              <ChoiceCard key={t.id} selected={templateId === t.id} onClick={() => setTemplateId(t.id)} title={t.name} text={t.description} />
            ))}
            <ChoiceCard
              selected={templateId === FREEFORM}
              onClick={() => setTemplateId(FREEFORM)}
              title="Escrito libre (sin plantilla)"
              text="La IA redacta el documento completo con un formato estándar."
            />
          </div>
          <p className="mt-3 text-muted">
            ¿No aparece su formato? Agréguelo en{' '}
            <Link to="/plantillas" className="font-semibold text-brand-700 underline">
              Plantillas
            </Link>
            .
          </p>
        </Step>

        <Step n={4} title="Indicaciones para la IA" hint="Opcional. Escriba lo que usted le diría a un asistente: qué negar, qué argumentar, qué pedir.">
          <div className="flex flex-col gap-4">
            <Field label="Título del escrito">
              {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selectedTemplate?.name ?? 'Ej.: Contestación de demanda'} className="max-w-2xl" />}
            </Field>
            <Field label="Indicaciones">
              {(id) => (
                <Textarea
                  id={id}
                  rows={5}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={'Ej.: Negar el hecho 2 porque el cliente sí pagó por transferencia (ver notas.txt).\nOponer la excepción de falta de acción.\nPedir que se absuelva al cliente.'}
                />
              )}
            </Field>
          </div>
        </Step>

        <div className="flex flex-wrap items-center justify-end gap-4 pb-8">
          {!canCreate && <p className="text-muted">{!caseId ? 'Elija un caso para continuar.' : !templateId ? 'Elija el tipo de escrito.' : ''}</p>}
          <Button variant="primary" size="lg" icon={Sparkles} disabled={!canCreate} loading={creating} onClick={() => void create()}>
            Redactar escrito
          </Button>
        </div>
      </div>
    </>
  )
}

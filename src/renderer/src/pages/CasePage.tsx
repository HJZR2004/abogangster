import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, FilePenLine, FileText, Folder, Info, Lock, MessageSquareText, Pencil, Trash2 } from 'lucide-react'
import { CaseForm } from '../components/CaseForm'
import { ChatPanel } from '../components/ChatPanel'
import { DocumentsPanel } from '../components/DocumentsPanel'
import { DraftList } from '../components/DraftList'
import { useFeedback } from '../components/feedback'
import { Alert, Badge, Button, Card, EmptyState, Spinner, Tabs } from '../components/ui'
import { errorText, invoke, useEvent, useLoad } from '../lib/api'
import { CASE_STATUS_LABEL, formatDate } from '../lib/format'

type Tab = 'resumen' | 'documentos' | 'escritos' | 'preguntar'

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted uppercase">{label}</dt>
      <dd className="text-lg">{children || <span className="text-muted">—</span>}</dd>
    </div>
  )
}

export function CasePage() {
  const { caseId = '' } = useParams()
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'resumen'
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const [editing, setEditing] = useState(false)

  const caseData = useLoad(() => invoke('cases:get', caseId), [caseId])
  const drafts = useLoad(() => invoke('drafts:list', caseId), [caseId])
  useEvent('documents:changed', (e) => {
    if (e.caseId === caseId) void caseData.reload()
  })

  if (caseData.error) {
    return (
      <Alert tone="bad" title="No se pudo abrir el caso">
        {caseData.error}
      </Alert>
    )
  }
  const c = caseData.data
  if (!c) return <Spinner />

  const remove = async () => {
    const ok = await feedback.confirm({
      title: 'Quitar caso',
      message: (
        <>
          <p>
            ¿Quitar <strong>{c.title}</strong> de la lista de casos?
          </p>
          <p className="mt-3">Se borran sus escritos y conversaciones del programa. La carpeta con los documentos se conserva en:</p>
          <p className="mt-1 break-all font-mono text-base">{c.folderPath}</p>
        </>
      ),
      confirmLabel: 'Quitar caso',
      danger: true
    })
    if (!ok) return
    try {
      await invoke('cases:delete', c.id)
      feedback.success('Caso quitado. Sus archivos siguen en la carpeta.')
      navigate('/casos')
    } catch (err) {
      feedback.error(errorText(err))
    }
  }

  return (
    <>
      <Link to="/casos" className="mb-4 inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-5" aria-hidden /> Todos los casos
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
            <Badge tone={c.status === 'activo' ? 'ok' : c.status === 'en_espera' ? 'warn' : 'neutral'}>{CASE_STATUS_LABEL[c.status]}</Badge>
            {c.localOnly && (
              <Badge tone="warn">
                <Lock className="size-3.5" aria-hidden /> Confidencial: solo IA local
              </Badge>
            )}
          </div>
          <p className="mt-1 text-lg text-muted">{[c.clientName, c.caseNumber && `Expediente ${c.caseNumber}`, c.court].filter(Boolean).join(' · ')}</p>
        </div>
        <Button variant="primary" size="lg" icon={FilePenLine} onClick={() => navigate(`/escritos/nuevo?caso=${c.id}`)}>
          Redactar escrito para este caso
        </Button>
      </header>

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'resumen', label: 'Resumen', icon: Info },
          { id: 'documentos', label: 'Documentos', icon: Folder, count: c.documentCount },
          { id: 'escritos', label: 'Escritos', icon: FileText, count: drafts.data?.length ?? c.draftCount },
          { id: 'preguntar', label: 'Preguntar sobre el caso', icon: MessageSquareText }
        ]}
      />

      {tab === 'resumen' && (
        <div className="flex flex-col gap-5">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Descripción del caso</h2>
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Editar datos
              </Button>
            </div>
            {c.description ? (
              <p className="document-text text-lg whitespace-pre-wrap">{c.description}</p>
            ) : (
              <p className="text-muted">
                Sin descripción. Agregue una: la IA la usa para entender el caso al redactar.
              </p>
            )}
          </Card>
          <Card>
            <dl className="grid gap-5 md:grid-cols-2">
              <DataRow label="Cliente">{c.clientName}</DataRow>
              <DataRow label="Expediente">{c.caseNumber}</DataRow>
              <DataRow label="Juzgado o autoridad">{c.court}</DataRow>
              <DataRow label="Contraparte">{c.counterparty}</DataRow>
              <DataRow label="Documentos">
                {c.indexedCount} de {c.documentCount} listos para la IA
              </DataRow>
              <DataRow label="Creado">{formatDate(c.createdAt)}</DataRow>
            </dl>
          </Card>
          <div>
            <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
              Quitar caso
            </Button>
          </div>
        </div>
      )}

      {tab === 'documentos' && <DocumentsPanel caseId={c.id} folderPath={c.folderPath} />}

      {tab === 'escritos' &&
        (drafts.loading ? (
          <Spinner />
        ) : (drafts.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileText}
            title="Este caso aún no tiene escritos"
            action={
              <Button variant="primary" icon={FilePenLine} onClick={() => navigate(`/escritos/nuevo?caso=${c.id}`)}>
                Redactar el primero
              </Button>
            }
          />
        ) : (
          <DraftList drafts={drafts.data ?? []} />
        ))}

      {tab === 'preguntar' && <ChatPanel caseId={c.id} />}

      {editing && (
        <CaseForm
          open
          existing={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            void caseData.reload()
          }}
        />
      )}
    </>
  )
}

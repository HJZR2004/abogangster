import { useState, type DragEvent } from 'react'
import { FilePlus2, FileText, FolderInput, FolderOpen, Pencil, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react'
import type { DocumentRecord, DocumentStatus, SearchHit } from '@shared/types'
import { errorText, invoke, useEvent, useLoad } from '../lib/api'
import { DOCUMENT_STATUS_LABEL, formatSize, plural } from '../lib/format'
import { useFeedback } from './feedback'
import { Alert, Badge, Button, EmptyState, Input, Spinner, cx } from './ui'

const STATUS_TONE: Record<DocumentStatus, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  indexado: 'ok',
  pendiente: 'neutral',
  error: 'bad',
  no_soportado: 'warn'
}

/** Case files live under "Documentos\"; hide that prefix, keep "Escritos generados\" visible. */
export function displayPath(relPath: string): string {
  return relPath.replace(/^Documentos[\\/]/, '')
}

function DescriptionEditor({ doc, onSaved }: { doc: DocumentRecord; onSaved: () => void }) {
  const feedback = useFeedback()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(doc.description)
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-left text-muted hover:text-brand-700">
        <Pencil className="size-4 shrink-0" aria-hidden />
        {doc.description || <span className="italic">Agregar una descripción</span>}
      </button>
    )
  }
  const save = async () => {
    try {
      await invoke('documents:setDescription', doc.id, value.trim())
      setEditing(false)
      onSaved()
    } catch (err) {
      feedback.error(errorText(err))
    }
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ej.: Demanda notificada el 3 de marzo" autoFocus aria-label="Descripción del documento" />
      <Button type="submit" variant="primary">
        Guardar
      </Button>
      <Button onClick={() => setEditing(false)} aria-label="Cancelar">
        <X className="size-5" />
      </Button>
    </form>
  )
}

function SearchResults({ hits, query }: { hits: SearchHit[]; query: string }) {
  if (hits.length === 0) return <p className="rounded-lg bg-surface p-4 text-muted">No se encontró «{query}» en los documentos.</p>
  return (
    <ul className="flex flex-col gap-3">
      {hits.map((h) => (
        <li key={h.chunkId} className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-1 font-semibold text-brand-700">
            {h.fileName}
            {h.scope === 'library' && <span className="ml-2 text-sm font-normal text-muted">(biblioteca)</span>}
          </p>
          <p className="document-text line-clamp-5 whitespace-pre-line">{h.text}</p>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  /** `null` = shared library. */
  caseId: string | null
  /** Folder shown with "Abrir carpeta". */
  folderPath: string
}

export function DocumentsPanel({ caseId, folderPath }: Props) {
  const feedback = useFeedback()
  const docs = useLoad(() => invoke('documents:list', caseId), [caseId])
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ query: string; hits: SearchHit[] } | null>(null)
  const [searching, setSearching] = useState(false)

  useEvent('documents:changed', (e) => {
    if (e.caseId === caseId) void docs.reload()
  })

  const importPaths = async (paths: string[]) => {
    if (paths.length === 0) return
    try {
      const n = await invoke('documents:import', caseId, paths)
      feedback.success(`${plural(n, 'elemento agregado', 'elementos agregados')}. Se están leyendo en segundo plano.`)
      void docs.reload()
    } catch (err) {
      feedback.error(errorText(err))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.getPathForFile(f)).filter(Boolean)
    void importPaths(paths)
  }

  const search = async () => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    setSearching(true)
    try {
      setResults({ query: q, hits: await invoke('documents:search', caseId, q) })
    } catch (err) {
      feedback.error(errorText(err))
    } finally {
      setSearching(false)
    }
  }

  const trash = async (doc: DocumentRecord) => {
    const ok = await feedback.confirm({
      title: 'Eliminar documento',
      message: (
        <>
          ¿Enviar <strong>{doc.fileName}</strong> a la Papelera de reciclaje? Podrá recuperarlo desde la Papelera de Windows.
        </>
      ),
      confirmLabel: 'Enviar a la Papelera',
      danger: true
    })
    if (!ok) return
    try {
      await invoke('documents:trash', doc.id)
      feedback.success('Documento enviado a la Papelera.')
      void docs.reload()
    } catch (err) {
      feedback.error(errorText(err))
    }
  }

  const list = docs.data ?? []
  const problems = list.filter((d) => d.status === 'error' || d.status === 'no_soportado').length

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
      className={cx('relative flex flex-col gap-5 rounded-xl transition', dragging && 'ring-4 ring-brand-600 ring-offset-4 ring-offset-paper')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-brand-50/90 text-2xl font-bold text-brand-700">
          <Upload className="mr-3 size-8" aria-hidden /> Suelte aquí los archivos o carpetas
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" icon={FilePlus2} onClick={async () => importPaths(await invoke('app:pickFiles'))}>
          Agregar documentos
        </Button>
        <Button
          icon={FolderInput}
          onClick={async () => {
            const folder = await invoke('app:pickFolder')
            if (folder) await importPaths([folder])
          }}
        >
          Agregar una carpeta completa
        </Button>
        <Button icon={FolderOpen} onClick={() => invoke('app:openPath', folderPath).catch((err) => feedback.error(errorText(err)))}>
          Abrir carpeta en Windows
        </Button>
      </div>
      <p className="-mt-2 text-muted">
        También puede arrastrar archivos aquí, o copiarlos directamente a la carpeta: se leen automáticamente.
      </p>

      <form
        className="flex max-w-2xl gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar dentro de los documentos…" aria-label="Buscar dentro de los documentos" />
        <Button type="submit" icon={Search} loading={searching}>
          Buscar
        </Button>
        {results && (
          <Button
            variant="ghost"
            onClick={() => {
              setResults(null)
              setQuery('')
            }}
          >
            Limpiar
          </Button>
        )}
      </form>

      {results ? (
        <SearchResults hits={results.hits} query={results.query} />
      ) : docs.loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState icon={FileText} title="Aún no hay documentos">
          Agregue los documentos del {caseId ? 'caso' : 'despacho'}: Word (.docx), PDF o texto.
        </EmptyState>
      ) : (
        <>
          {problems > 0 && (
            <Alert tone="warn" title={`${plural(problems, 'documento no se pudo leer', 'documentos no se pudieron leer')}`}>
              La IA no puede usar esos archivos. Vea el motivo en cada uno.
            </Alert>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <FileText className="mt-1 size-7 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold break-words">{displayPath(d.relPath)}</p>
                  <DescriptionEditor doc={d} onSaved={() => void docs.reload()} />
                  {d.error && <p className="mt-1 text-bad-700">{d.error}</p>}
                  <p className="mt-1 text-sm text-muted">{formatSize(d.size)}</p>
                </div>
                <Badge tone={STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</Badge>
                <div className="flex gap-2">
                  <Button onClick={() => invoke('app:openPath', d.path).catch((err) => feedback.error(errorText(err)))}>Abrir</Button>
                  {d.status === 'error' && (
                    <Button icon={RefreshCw} onClick={() => void invoke('documents:reindex', d.id)}>
                      Reintentar
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => void trash(d)} aria-label={`Eliminar ${d.fileName}`}>
                    <Trash2 className="size-5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

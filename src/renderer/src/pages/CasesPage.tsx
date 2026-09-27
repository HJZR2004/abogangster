import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Briefcase, ChevronRight, FolderPlus, Lock, Search } from 'lucide-react'
import type { CaseStatus } from '@shared/types'
import { CaseForm } from '../components/CaseForm'
import { Badge, Button, EmptyState, Input, PageHeader, Spinner } from '../components/ui'
import { invoke, useEvent, useLoad } from '../lib/api'
import { CASE_STATUS_LABEL, formatRelative, plural } from '../lib/format'

const STATUS_TONE: Record<CaseStatus, 'ok' | 'warn' | 'neutral'> = { activo: 'ok', en_espera: 'warn', cerrado: 'neutral' }

/** Accent- and case-insensitive text used for filtering. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

export function CasesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cases = useLoad(() => invoke('cases:list'), [])
  const [filter, setFilter] = useState('')
  useEvent('documents:changed', () => void cases.reload())

  const formOpen = params.get('nuevo') === '1'
  const setFormOpen = (open: boolean) => setParams(open ? { nuevo: '1' } : {})

  const visible = useMemo(() => {
    const q = fold(filter.trim())
    if (!q) return cases.data ?? []
    return (cases.data ?? []).filter((c) => fold(`${c.title} ${c.clientName} ${c.caseNumber} ${c.court} ${c.counterparty}`).includes(q))
  }, [cases.data, filter])

  return (
    <>
      <PageHeader
        title="Casos"
        subtitle="Cada caso guarda sus documentos y escritos por separado."
        actions={
          <Button variant="primary" size="lg" icon={FolderPlus} onClick={() => setFormOpen(true)}>
            Nuevo caso
          </Button>
        }
      />

      {cases.loading ? (
        <Spinner />
      ) : (cases.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Todavía no hay casos"
          action={
            <Button variant="primary" icon={FolderPlus} onClick={() => setFormOpen(true)}>
              Crear el primer caso
            </Button>
          }
        >
          Cree un caso por cada expediente o cliente. Después podrá cargar sus documentos y redactar escritos.
        </EmptyState>
      ) : (
        <>
          <div className="relative mb-5 max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              aria-label="Buscar caso"
              placeholder="Buscar por nombre, cliente o expediente…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10"
            />
          </div>
          <ul className="grid gap-4 lg:grid-cols-2">
            {visible.map((c) => (
              <li key={c.id}>
                <Link to={`/casos/${c.id}`} className="flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm transition hover:border-brand-600 hover:bg-brand-50">
                  <Briefcase className="mt-1 size-8 shrink-0 text-brand-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold">{c.title}</p>
                      {c.localOnly && (
                        <Badge tone="warn">
                          <Lock className="size-3.5" aria-hidden /> Confidencial
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted">
                      {[c.clientName, c.caseNumber && `Exp. ${c.caseNumber}`].filter(Boolean).join(' · ') || 'Sin datos del cliente'}
                    </p>
                    {c.description && <p className="mt-2 line-clamp-2 text-ink/80">{c.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <Badge tone={STATUS_TONE[c.status]}>{CASE_STATUS_LABEL[c.status]}</Badge>
                      <span>{plural(c.documentCount, 'documento', 'documentos')}</span>
                      <span>·</span>
                      <span>{plural(c.draftCount, 'escrito', 'escritos')}</span>
                      <span>·</span>
                      <span>Actualizado {formatRelative(c.updatedAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-6 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="text-muted">Ningún caso coincide con «{filter}».</p>}
        </>
      )}

      <CaseForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(record) => navigate(`/casos/${record.id}`)} />
    </>
  )
}

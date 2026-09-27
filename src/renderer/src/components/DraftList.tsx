import { Link } from 'react-router'
import { ChevronRight, FileText } from 'lucide-react'
import type { DraftListItem, DraftStatus } from '@shared/types'
import { DRAFT_STATUS_LABEL, formatRelative } from '../lib/format'
import { Badge } from './ui'

const STATUS_TONE: Record<DraftStatus, 'neutral' | 'ok' | 'warn' | 'brand'> = {
  borrador: 'neutral',
  generando: 'warn',
  listo: 'brand',
  exportado: 'ok'
}

export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{DRAFT_STATUS_LABEL[status]}</Badge>
}

export function DraftList({ drafts, showCase }: { drafts: DraftListItem[]; showCase?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {drafts.map((d) => (
        <li key={d.id}>
          <Link to={`/escritos/${d.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
            <FileText className="size-7 shrink-0 text-brand-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{d.title}</p>
              <p className="truncate text-muted">
                {showCase && <span className="font-medium text-ink">{d.caseTitle} · </span>}
                {d.templateName ?? 'Escrito libre'} · {formatRelative(d.updatedAt)}
              </p>
            </div>
            <DraftStatusBadge status={d.status} />
            <ChevronRight className="size-6 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

import type { CaseStatus, DocumentStatus, DraftStatus } from '@shared/types'

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit'
})

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : ''
}

/** "hace 5 minutos", "ayer", or a date for older items. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  if (hours < 48) return 'ayer'
  return dateTimeFormat.format(new Date(iso))
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  activo: 'Activo',
  en_espera: 'En espera',
  cerrado: 'Cerrado'
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  pendiente: 'Leyendo…',
  indexado: 'Listo',
  error: 'No se pudo leer',
  no_soportado: 'Formato no compatible'
}

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  borrador: 'Borrador',
  generando: 'Redactando…',
  listo: 'Listo para revisar',
  exportado: 'Documento Word creado'
}

/** Joins path segments using the separator already present in `base` (Windows or POSIX). */
export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

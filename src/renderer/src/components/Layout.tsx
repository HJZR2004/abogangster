import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { BookOpen, Briefcase, CheckCircle2, FilePenLine, FileStack, Home, Loader2, Settings } from 'lucide-react'
import type { IndexingStatus } from '@shared/types'
import { useEvent, useLoad, invoke } from '../lib/api'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/casos', label: 'Casos', icon: Briefcase },
  { to: '/escritos/nuevo', label: 'Nuevo escrito', icon: FilePenLine, primary: true },
  { to: '/biblioteca', label: 'Biblioteca', icon: BookOpen },
  { to: '/plantillas', label: 'Plantillas', icon: FileStack }
]

function IndexingIndicator() {
  const initial = useLoad(() => invoke('indexing:status'), [])
  const [live, setLive] = useState<IndexingStatus | null>(null)
  useEvent('indexing:status', setLive)
  const status = live ?? initial.data
  if (!status) return null
  const busy = status.running || status.pending > 0
  return (
    <div className="rounded-lg bg-white/10 p-3 text-sm" role="status" aria-live="polite">
      {busy ? (
        <div className="flex items-start gap-2">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">Leyendo documentos…</p>
            {status.currentFile && <p className="truncate opacity-80" title={status.currentFile}>{status.currentFile}</p>}
            {status.pending > 0 && <p className="opacity-80">{status.pending} en espera</p>}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 opacity-90">
          <CheckCircle2 className="size-4" aria-hidden />
          <span>Documentos al día</span>
        </div>
      )}
    </div>
  )
}

function NavItem({ to, label, icon: Icon, end, primary }: (typeof NAV)[number] & { end?: boolean; primary?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex min-h-12 items-center gap-3 rounded-lg px-4 text-lg font-semibold transition-colors',
          primary && !isActive && 'bg-white text-brand-800 hover:bg-brand-50',
          isActive ? 'bg-brand-800 text-white ring-2 ring-white/60' : !primary && 'text-white/90 hover:bg-white/10'
        )
      }
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      {label}
    </NavLink>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <nav aria-label="Menú principal" className="flex w-64 shrink-0 flex-col gap-2 bg-brand-700 p-4 text-white">
        <div className="mb-4 px-2 pt-2">
          <p className="text-2xl font-bold tracking-tight">Abogangster</p>
          <p className="text-sm opacity-80">Asistente de redacción</p>
        </div>
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <div className="mt-auto flex flex-col gap-3">
          <IndexingIndicator />
          <NavItem to="/configuracion" label="Configuración" icon={Settings} />
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}

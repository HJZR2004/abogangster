import { Link } from 'react-router'
import { Briefcase, FilePenLine, FolderPlus, type LucideIcon } from 'lucide-react'
import { DraftList } from '../components/DraftList'
import { Alert, Spinner } from '../components/ui'
import { invoke, useEvent, useLoad } from '../lib/api'
import { isAiConfigured, useSettings } from '../lib/settings-context'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function ActionCard({ to, icon: Icon, title, text, primary }: { to: string; icon: LucideIcon; title: string; text: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'flex flex-col gap-3 rounded-2xl bg-brand-600 p-6 text-white shadow-md transition hover:bg-brand-700'
          : 'flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-sm transition hover:border-brand-600 hover:bg-brand-50'
      }
    >
      <Icon className="size-10" aria-hidden />
      <span className="text-xl font-bold">{title}</span>
      <span className={primary ? 'text-white/90' : 'text-muted'}>{text}</span>
    </Link>
  )
}

export function HomePage() {
  const { settings } = useSettings()
  const drafts = useLoad(() => invoke('drafts:list', null), [])
  useEvent('drafts:progress', (e) => {
    if (e.type === 'done' || e.type === 'error') void drafts.reload()
  })

  const toReview = drafts.data?.filter((d) => d.status === 'listo') ?? []
  const recent = drafts.data?.filter((d) => d.status !== 'listo').slice(0, 6) ?? []
  const name = settings.profile.nombre.trim()

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">
          {greeting()}
          {name ? `, ${name}` : ''}
        </h1>
        <p className="mt-2 text-xl text-muted">¿Qué desea hacer hoy?</p>
      </header>

      {!isAiConfigured(settings) && (
        <Alert tone="warn" title="La inteligencia artificial aún no está configurada">
          Puede organizar casos y documentos, pero para redactar escritos se necesita configurar el modelo de IA en{' '}
          <Link to="/configuracion" className="font-semibold underline">
            Configuración
          </Link>
          .
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <ActionCard to="/escritos/nuevo" icon={FilePenLine} title="Redactar un escrito" text="Contestar un documento o preparar un escrito nuevo con ayuda de la IA." primary />
        <ActionCard to="/casos?nuevo=1" icon={FolderPlus} title="Crear un caso" text="Dar de alta un expediente y cargar sus documentos." />
        <ActionCard to="/casos" icon={Briefcase} title="Ver mis casos" text="Consultar expedientes, documentos y escritos anteriores." />
      </div>

      <section aria-labelledby="revisar">
        <h2 id="revisar" className="mb-3 text-2xl font-bold">
          Escritos listos para revisar
        </h2>
        {drafts.loading ? (
          <Spinner />
        ) : toReview.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-muted">No hay escritos pendientes de revisión.</p>
        ) : (
          <DraftList drafts={toReview} showCase />
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recientes">
          <h2 id="recientes" className="mb-3 text-2xl font-bold">
            Otros escritos recientes
          </h2>
          <DraftList drafts={recent} showCase />
        </section>
      )}
    </div>
  )
}

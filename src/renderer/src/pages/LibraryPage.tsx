import { DocumentsPanel } from '../components/DocumentsPanel'
import { PageHeader } from '../components/ui'
import { joinPath } from '../lib/format'
import { useSettings } from '../lib/settings-context'

export function LibraryPage() {
  const { settings } = useSettings()
  return (
    <>
      <PageHeader
        title="Biblioteca del despacho"
        subtitle="Leyes, jurisprudencia, formatos y escritos de referencia. La IA los consulta en todos los casos."
      />
      <DocumentsPanel caseId={null} folderPath={joinPath(settings.workspaceDir, 'Biblioteca')} />
    </>
  )
}

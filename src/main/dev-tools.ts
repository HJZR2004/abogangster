import { app, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext } from './app-context'
import { createLogger } from './logger'
import { textToDocx } from './templates/docx-writer'
import { CASE_DOCUMENTS_DIR } from './workspace'

/**
 * Developer/maintenance helpers driven by environment variables (never used by the end user):
 *
 * - `ABOGANGSTER_DATA_DIR=<dir>`: isolated profile (settings, logs and default workspace inside
 *   `<dir>`), so testing never touches the real data.
 * - `ABOGANGSTER_SCREENSHOTS=<dir>`: opens each main screen, saves a PNG of it in `<dir>` and quits.
 *   Used to check the UI on a machine without looking at it (e.g. over a remote session).
 */

const log = createLogger('dev-tools')

export function applyDataDirOverride(): void {
  const dir = process.env['ABOGANGSTER_DATA_DIR']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  app.setPath('userData', join(dir, 'userData'))
  app.setPath('documents', join(dir, 'documents'))
}

/**
 * `ABOGANGSTER_DEMO=1`: on an empty workspace, creates a sample case with documents and a
 * reviewed-looking draft. Useful for screenshots and for showing how the app works.
 */
export async function seedDemoDataIfRequested(ctx: AppContext): Promise<void> {
  if (process.env['ABOGANGSTER_DEMO'] !== '1' || ctx.repos.cases.list().length > 0) return
  const demoCase = ctx.cases.create({
    title: 'García contra Constructora del Norte',
    clientName: 'Juan García López',
    caseNumber: '123/2026',
    court: 'Juzgado Tercero de lo Civil',
    counterparty: 'Constructora del Norte, S.A. de C.V.',
    description:
      'Juicio ordinario civil por supuesto incumplimiento de un contrato de obra. Representamos al demandado, quien sostiene que pagó todas las estimaciones.',
    status: 'activo',
    localOnly: false
  })
  const docsDir = join(demoCase.folderPath, CASE_DOCUMENTS_DIR)
  writeFileSync(
    join(docsDir, 'Demanda.docx'),
    await textToDocx(
      [
        'DEMANDA',
        'HECHOS',
        '1. El 5 de enero de 2026 las partes celebraron un contrato de obra para construir una bodega.',
        '2. El demandado no pagó la segunda estimación por la cantidad de $150,000.00.',
        '3. La obra se entregó con defectos en la cimentación.'
      ].join('\n')
    )
  )
  writeFileSync(join(docsDir, 'Notas de la entrevista con el cliente.txt'), 'El cliente afirma que pagó la segunda estimación mediante transferencia del 10 de febrero de 2026.')
  ctx.indexer.scanAll()
  await ctx.indexer.idle()

  const template = ctx.templates.list().find((t) => t.fields.some((f) => f.mode === 'ia'))
  const demanda = ctx.repos.documents.list(demoCase.id).find((d) => d.fileName === 'Demanda.docx')
  const draft = ctx.drafting.create({
    caseId: demoCase.id,
    templateId: template?.id ?? null,
    title: 'Contestación de demanda',
    instructions: 'Negar el hecho 2: el cliente pagó por transferencia el 10 de febrero de 2026.',
    sourceDocumentIds: demanda ? [demanda.id] : []
  })
  const sample: Record<string, string> = {
    proemio: 'JUAN GARCÍA LÓPEZ, por mi propio derecho, en los autos del juicio citado al rubro, comparezco para dar contestación a la demanda instaurada en mi contra.',
    contestacion_hechos:
      '1. Es cierto.\n\n2. Es falso. El suscrito pagó la segunda estimación mediante transferencia bancaria del 10 de febrero de 2026, como se acreditará con el comprobante [COMPLETAR: número de referencia de la transferencia].\n\n3. Es falso. [REVISAR: confirmar con el cliente si existe acta de entrega-recepción de la obra].',
    excepciones: 'PAGO. Se opone la excepción de pago respecto de la segunda estimación reclamada, al haberse cubierto en su totalidad.',
    pruebas: 'DOCUMENTAL PRIVADA. Consistente en el comprobante de transferencia bancaria del 10 de febrero de 2026.',
    fundamentos_derecho: '[COMPLETAR: artículos aplicables del Código Civil local]',
    puntos_petitorios: 'PRIMERO. Tenerme por presentado en tiempo y forma contestando la demanda.\n\nSEGUNDO. En su oportunidad, absolverme de las prestaciones reclamadas.'
  }
  ctx.drafting.update(draft.id, { fieldValues: { ...draft.fieldValues, ...sample } })
  ctx.repos.drafts.setStatus(draft.id, 'listo')
  log.info('Datos de demostración creados')
}

const SCREENS = ['/', '/casos', '/escritos/nuevo', '/biblioteca', '/plantillas', '/configuracion']

export async function captureScreensIfRequested(win: BrowserWindow, extraRoutes: () => string[]): Promise<void> {
  const dir = process.env['ABOGANGSTER_SCREENSHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  try {
    await wait(2500)
    // Extra routes are resolved late: demo data may still be seeding when capture starts.
    const routes: (string | null)[] = [...SCREENS, null]
    for (const [i, entry] of routes.entries()) {
      if (entry === null) {
        routes.push(...extraRoutes())
        continue
      }
      const route = entry
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(`#${route}`)}`)
      await wait(1200)
      const image = await win.webContents.capturePage()
      const name = `${String(i).padStart(2, '0')}${route.replace(/[^a-z0-9]+/gi, '_')}.png`
      writeFileSync(join(dir, name), image.toPNG())
    }
    log.info(`Capturas guardadas en ${dir}`)
  } catch (err) {
    log.error('Error tomando capturas', err)
  } finally {
    app.quit()
  }
}

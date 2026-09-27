import type { CaseRecord, LawyerProfile, SearchHit, SourceRef } from '@shared/types'

/**
 * All prompt text lives here so it can be reviewed and tuned in one place.
 * Prompts are in Spanish because the output must be Spanish legal writing.
 */

export interface SystemPromptOptions {
  profile: LawyerProfile
  generalRules: string
  templateRules?: string
}

export function systemPrompt({ profile, generalRules, templateRules }: SystemPromptOptions): string {
  const lines = [
    'Eres el asistente de redacción jurídica de un despacho de abogados.',
    profile.nombre ? `Trabajas para el abogado ${profile.nombre}${profile.despacho ? ` (${profile.despacho})` : ''}.` : '',
    profile.jurisdiccion ? `Jurisdicción de referencia: ${profile.jurisdiccion}.` : '',
    '',
    'Reglas obligatorias:',
    '1. Escribe en español jurídico formal, claro y preciso.',
    '2. Usa exclusivamente la información de los documentos que se te proporcionan. Nunca inventes hechos, fechas, nombres, cantidades, artículos de ley, tesis ni jurisprudencia.',
    '3. Si falta un dato necesario, escribe exactamente [COMPLETAR: qué dato falta] en su lugar.',
    '4. Escribe en texto plano: sin Markdown, sin asteriscos, sin almohadillas (#). Separa los párrafos con una línea en blanco.',
    '5. El abogado revisará todo lo que escribas antes de presentarlo; señala con [REVISAR: motivo] cualquier punto dudoso.'
  ]
  if (generalRules.trim()) lines.push('', 'Reglas generales del despacho:', generalRules.trim())
  if (templateRules?.trim()) lines.push('', 'Reglas de este tipo de escrito:', templateRules.trim())
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

export const CHAT_INSTRUCTIONS = [
  'Responde la pregunta del abogado usando los documentos del caso y de la biblioteca que aparecen abajo.',
  'Cita la fuente de cada afirmación con su número entre corchetes, por ejemplo [2].',
  'Si la respuesta no está en los documentos, dilo claramente y sugiere qué documento haría falta.',
  'Sé conciso.'
].join('\n')

export interface ContextSource {
  fileName: string
  content: string
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max))}\n[... documento recortado por su longitud ...]`
}

export function caseBlock(c: CaseRecord): string {
  const rows = [
    ['Asunto', c.title],
    ['Cliente', c.clientName],
    ['Expediente', c.caseNumber],
    ['Juzgado o autoridad', c.court],
    ['Contraparte', c.counterparty],
    ['Descripción del caso', c.description]
  ].filter(([, v]) => v && v.trim())
  return `<caso>\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n</caso>`
}

/**
 * Builds the context block: case data, full text of the documents being answered and
 * relevant excerpts from search. Respects a character budget (models have limited context).
 */
export function buildContext(opts: {
  caseRecord: CaseRecord
  sources: ContextSource[]
  excerpts: SearchHit[]
  budget: number
}): { text: string; refs: SourceRef[] } {
  const { caseRecord, sources, excerpts, budget } = opts
  const parts = [caseBlock(caseRecord)]
  let remaining = budget - parts[0]!.length

  if (sources.length > 0) {
    const perSource = Math.floor((excerpts.length > 0 ? remaining * 0.7 : remaining) / sources.length)
    for (const s of sources) {
      const block = `<documento_principal nombre="${s.fileName}">\n${truncate(s.content, perSource - 80)}\n</documento_principal>`
      parts.push(block)
      remaining -= block.length
    }
  }

  const refs: SourceRef[] = []
  const lines: string[] = []
  for (const hit of excerpts) {
    const line = `[${refs.length + 1}] (${hit.fileName}${hit.scope === 'library' ? ', biblioteca' : ''})\n${hit.text}`
    if (line.length > remaining) break
    lines.push(line)
    remaining -= line.length
    refs.push({ documentId: hit.documentId, fileName: hit.fileName, excerpt: hit.text.slice(0, 400) })
  }
  if (lines.length > 0) parts.push(`<fragmentos_relevantes>\n${lines.join('\n\n')}\n</fragmentos_relevantes>`)

  return { text: parts.join('\n\n'), refs }
}

export function draftBriefing(opts: {
  kind: string
  kindDescription: string
  title: string
  instructions: string
  sectionLabels: string[]
}): string {
  const lines = [`Tipo de escrito: ${opts.kind}${opts.kindDescription ? ` — ${opts.kindDescription}` : ''}`, `Título: ${opts.title}`]
  if (opts.sectionLabels.length > 0) lines.push(`Secciones del escrito: ${opts.sectionLabels.join(', ')}`)
  lines.push(`Indicaciones del abogado: ${opts.instructions.trim() || '(sin indicaciones adicionales)'}`)
  return `<encargo>\n${lines.join('\n')}\n</encargo>`
}

export function fieldTask(opts: {
  label: string
  name: string
  instruction: string
  extraInstruction: string
  previous: { label: string; value: string }[]
}): string {
  const lines: string[] = []
  if (opts.previous.length > 0) {
    lines.push('Secciones ya redactadas (para mantener coherencia; no las repitas):')
    for (const p of opts.previous) lines.push(`<seccion nombre="${p.label}">\n${truncate(p.value, 3000)}\n</seccion>`)
    lines.push('')
  }
  lines.push(`Redacta ahora únicamente la sección "${opts.label}".`)
  if (opts.instruction.trim()) lines.push(`Qué debe contener: ${opts.instruction.trim()}`)
  if (opts.extraInstruction.trim()) lines.push(`Indicación adicional del abogado: ${opts.extraInstruction.trim()}`)
  lines.push('Devuelve solo el texto de esa sección, sin el título de la sección, listo para insertarse en el documento de Word.')
  return lines.join('\n')
}

export function freeformTask(extraInstruction: string): string {
  return [
    'Redacta el escrito completo de acuerdo con el encargo.',
    'Pon los títulos de cada apartado en MAYÚSCULAS y en una línea propia.',
    extraInstruction.trim() ? `Indicación adicional del abogado: ${extraInstruction.trim()}` : '',
    'Devuelve solo el texto del escrito, listo para Word.'
  ]
    .filter(Boolean)
    .join('\n')
}

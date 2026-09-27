import type { CaseRecord, LawyerProfile, TemplateField } from '@shared/types'

/** Normalizes a placeholder name for lookups: lowercase, no accents, underscores. */
export function normalizeFieldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
}

/** "contestacion_hechos" -> "Contestacion hechos" (used when no better label is known). */
export function humanizeFieldName(name: string): string {
  const text = name.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

interface AutoContext {
  caseRecord: CaseRecord
  profile: LawyerProfile
  now: Date
}

type AutoResolver = (ctx: AutoContext) => string

/**
 * Placeholders filled automatically from the case data and the lawyer profile.
 * Documented for the user in docs/PLANTILLAS.md — keep both lists in sync.
 */
const AUTO_FIELDS: Record<string, { label: string; resolve: AutoResolver }> = {
  fecha: { label: 'Fecha', resolve: ({ now }) => formatLongDate(now) },
  ciudad: { label: 'Ciudad', resolve: ({ profile }) => profile.ciudad },
  abogado: { label: 'Nombre del abogado', resolve: ({ profile }) => profile.nombre },
  abogado_nombre: { label: 'Nombre del abogado', resolve: ({ profile }) => profile.nombre },
  cedula: { label: 'Cédula profesional', resolve: ({ profile }) => profile.cedula },
  cedula_profesional: { label: 'Cédula profesional', resolve: ({ profile }) => profile.cedula },
  despacho: { label: 'Despacho', resolve: ({ profile }) => profile.despacho },
  domicilio: { label: 'Domicilio del despacho', resolve: ({ profile }) => profile.domicilio },
  domicilio_despacho: { label: 'Domicilio del despacho', resolve: ({ profile }) => profile.domicilio },
  telefono: { label: 'Teléfono', resolve: ({ profile }) => profile.telefono },
  correo: { label: 'Correo electrónico', resolve: ({ profile }) => profile.correo },
  cliente: { label: 'Cliente', resolve: ({ caseRecord }) => caseRecord.clientName },
  nombre_cliente: { label: 'Cliente', resolve: ({ caseRecord }) => caseRecord.clientName },
  expediente: { label: 'Número de expediente', resolve: ({ caseRecord }) => caseRecord.caseNumber },
  numero_expediente: { label: 'Número de expediente', resolve: ({ caseRecord }) => caseRecord.caseNumber },
  juzgado: { label: 'Juzgado o autoridad', resolve: ({ caseRecord }) => caseRecord.court },
  autoridad: { label: 'Juzgado o autoridad', resolve: ({ caseRecord }) => caseRecord.court },
  contraparte: { label: 'Contraparte', resolve: ({ caseRecord }) => caseRecord.counterparty },
  asunto: { label: 'Asunto', resolve: ({ caseRecord }) => caseRecord.title }
}

/** Suggested labels and AI instructions for common legal sections. */
const SECTION_HINTS: Record<string, { label: string; instruction: string }> = {
  proemio: {
    label: 'Proemio',
    instruction: 'Párrafo de comparecencia: quién comparece, en qué carácter y qué escrito presenta.'
  },
  antecedentes: { label: 'Antecedentes', instruction: 'Resumen cronológico y objetivo de los antecedentes del asunto.' },
  hechos: { label: 'Hechos', instruction: 'Narración numerada de los hechos, solo con datos que consten en los documentos.' },
  contestacion_hechos: {
    label: 'Contestación a los hechos',
    instruction:
      'Contestar uno por uno cada hecho del documento de la contraparte, indicando si se afirma, se niega o se ignora por no ser propio, con una breve razón.'
  },
  excepciones: {
    label: 'Excepciones y defensas',
    instruction: 'Excepciones y defensas procedentes, cada una con su nombre y fundamento, solo si se desprenden de los documentos.'
  },
  defensas: { label: 'Defensas', instruction: 'Defensas procedentes con su fundamento.' },
  pruebas: {
    label: 'Pruebas',
    instruction: 'Ofrecimiento de pruebas numeradas, relacionándolas con los hechos. Solo pruebas que existan en el expediente.'
  },
  derecho: { label: 'Derecho', instruction: 'Fundamentos de derecho aplicables, citando solo normas que aparezcan en la biblioteca o en el caso.' },
  fundamentos_derecho: {
    label: 'Fundamentos de derecho',
    instruction: 'Fundamentos de derecho aplicables, citando solo normas que aparezcan en la biblioteca o en el caso.'
  },
  agravios: { label: 'Agravios', instruction: 'Agravios numerados que causa la resolución impugnada, con su razonamiento.' },
  conceptos_violacion: { label: 'Conceptos de violación', instruction: 'Conceptos de violación numerados y razonados.' },
  alegatos: { label: 'Alegatos', instruction: 'Alegatos que resumen por qué deben prosperar las pretensiones del cliente.' },
  cuerpo: { label: 'Cuerpo del escrito', instruction: 'Contenido principal del escrito según las indicaciones.' },
  puntos_petitorios: {
    label: 'Puntos petitorios',
    instruction: 'Puntos petitorios numerados (PRIMERO, SEGUNDO, ...), breves y concretos.'
  },
  petitorios: { label: 'Puntos petitorios', instruction: 'Puntos petitorios numerados (PRIMERO, SEGUNDO, ...), breves y concretos.' }
}

export function isAutoField(name: string): boolean {
  return normalizeFieldName(name) in AUTO_FIELDS
}

/** Default configuration for a newly detected placeholder. */
export function defaultFieldConfig(name: string): TemplateField {
  const key = normalizeFieldName(name)
  const auto = AUTO_FIELDS[key]
  if (auto) return { name, label: auto.label, mode: 'manual', instruction: '' }
  const hint = SECTION_HINTS[key]
  return { name, label: hint?.label ?? humanizeFieldName(name), mode: 'ia', instruction: hint?.instruction ?? '' }
}

/** Keeps user edits for fields that still exist; adds defaults for new ones; drops removed ones. */
export function mergeFieldConfigs(detected: string[], existing: TemplateField[]): TemplateField[] {
  const byName = new Map(existing.map((f) => [f.name, f]))
  return detected.map((name) => byName.get(name) ?? defaultFieldConfig(name))
}

/** Initial values for auto-fillable placeholders (the user can still edit them). */
export function autoFillValues(fields: TemplateField[], ctx: AutoContext): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    const auto = AUTO_FIELDS[normalizeFieldName(field.name)]
    values[field.name] = auto ? auto.resolve(ctx) : ''
  }
  return values
}

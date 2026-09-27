import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'

/**
 * Builds .docx files from plain text with a conservative legal format:
 * Arial 12, 1.5 line spacing, justified, 2.5 cm margins.
 * Used for free-form drafts and for the example templates created on first run.
 */

const CM = 567 // twips per centimeter

const BASE_STYLES = {
  default: {
    document: {
      run: { font: 'Arial', size: 24 },
      paragraph: { spacing: { line: 360, after: 160 } }
    }
  }
}

const PAGE = { page: { margin: { top: 2.5 * CM, bottom: 2.5 * CM, left: 3 * CM, right: 2.5 * CM } } }

/** Short all-caps lines ("CONTESTACIÓN A LOS HECHOS") are treated as headings. */
export function isHeadingLine(line: string): boolean {
  const letters = line.replace(/[^\p{L}]/gu, '')
  return line.length <= 90 && letters.length >= 3 && letters === letters.toUpperCase()
}

function paragraphFor(line: string): Paragraph {
  if (isHeadingLine(line)) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: line, bold: true })]
    })
  }
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun(line)] })
}

export async function textToDocx(body: string): Promise<Buffer> {
  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const doc = new Document({
    styles: BASE_STYLES,
    sections: [{ properties: PAGE, children: lines.map(paragraphFor) }]
  })
  return Packer.toBuffer(doc)
}

/** One template line: plain text where `{{campo}}` placeholders are kept in a single run. */
type TemplateLine = { text: string; style?: 'heading' | 'right' | 'center' | 'bold' }

async function buildTemplate(lines: TemplateLine[]): Promise<Buffer> {
  const paragraphs = lines.map(
    (l) =>
      new Paragraph({
        alignment:
          l.style === 'heading' || l.style === 'center'
            ? AlignmentType.CENTER
            : l.style === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.JUSTIFIED,
        spacing: l.style === 'heading' ? { before: 240, after: 160 } : undefined,
        children: [new TextRun({ text: l.text, bold: l.style === 'heading' || l.style === 'bold' })]
      })
  )
  const doc = new Document({ styles: BASE_STYLES, sections: [{ properties: PAGE, children: paragraphs }] })
  return Packer.toBuffer(doc)
}

export const EXAMPLE_TEMPLATES: { fileName: string; name: string; description: string; rules: string; build: () => Promise<Buffer> }[] = [
  {
    fileName: 'Contestación de demanda (ejemplo).docx',
    name: 'Contestación de demanda (ejemplo)',
    description: 'Plantilla de ejemplo para contestar una demanda. Cópiela y adáptela al formato del despacho.',
    rules: [
      'Contestar todos y cada uno de los hechos, en el mismo orden y numeración de la demanda.',
      'Las excepciones deben tener un título en mayúsculas y su explicación.',
      'Los puntos petitorios se numeran con ordinales en mayúsculas: PRIMERO, SEGUNDO, TERCERO.'
    ].join('\n'),
    build: () =>
      buildTemplate([
        { text: 'EXPEDIENTE: {{expediente}}', style: 'right' },
        { text: 'ASUNTO: CONTESTACIÓN DE DEMANDA', style: 'right' },
        { text: '{{juzgado}}', style: 'bold' },
        { text: 'P R E S E N T E.', style: 'bold' },
        { text: '{{proemio}}' },
        { text: 'CONTESTACIÓN A LOS HECHOS', style: 'heading' },
        { text: '{{contestacion_hechos}}' },
        { text: 'EXCEPCIONES Y DEFENSAS', style: 'heading' },
        { text: '{{excepciones}}' },
        { text: 'PRUEBAS', style: 'heading' },
        { text: '{{pruebas}}' },
        { text: 'DERECHO', style: 'heading' },
        { text: '{{fundamentos_derecho}}' },
        { text: 'Por lo anteriormente expuesto, atentamente solicito:' },
        { text: '{{puntos_petitorios}}' },
        { text: 'PROTESTO LO NECESARIO', style: 'heading' },
        { text: '{{ciudad}}, a {{fecha}}', style: 'center' },
        { text: '_______________________________', style: 'center' },
        { text: '{{cliente}}', style: 'center' },
        { text: 'Abogado: {{abogado_nombre}} — Cédula profesional {{cedula_profesional}}', style: 'center' }
      ])
  },
  {
    fileName: 'Escrito simple (ejemplo).docx',
    name: 'Escrito simple (ejemplo)',
    description: 'Escrito breve dirigido a la autoridad (promociones, solicitudes, desahogos).',
    rules: 'Escrito breve y directo. Un solo tema por escrito.',
    build: () =>
      buildTemplate([
        { text: 'EXPEDIENTE: {{expediente}}', style: 'right' },
        { text: '{{juzgado}}', style: 'bold' },
        { text: 'P R E S E N T E.', style: 'bold' },
        { text: '{{proemio}}' },
        { text: '{{cuerpo}}' },
        { text: 'Por lo expuesto, atentamente solicito:' },
        { text: '{{puntos_petitorios}}' },
        { text: 'PROTESTO LO NECESARIO', style: 'heading' },
        { text: '{{ciudad}}, a {{fecha}}', style: 'center' },
        { text: '_______________________________', style: 'center' },
        { text: '{{cliente}}', style: 'center' }
      ])
  }
]

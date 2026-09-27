import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import mammoth from 'mammoth'
import { UserError } from '../errors'

/** Extensions the indexer can read. */
export const SUPPORTED_EXTENSIONS = new Set(['.docx', '.pdf', '.txt', '.md'])

/** Known formats we cannot read, with advice for the user. */
const UNSUPPORTED_ADVICE: Record<string, string> = {
  '.doc': 'Formato antiguo de Word. Ábralo en Word y use "Guardar como" > "Documento de Word (.docx)".',
  '.rtf': 'Ábralo en Word y guárdelo como "Documento de Word (.docx)".',
  '.odt': 'Ábralo en Word y guárdelo como "Documento de Word (.docx)".',
  '.jpg': 'Es una imagen: no contiene texto que se pueda leer.',
  '.jpeg': 'Es una imagen: no contiene texto que se pueda leer.',
  '.png': 'Es una imagen: no contiene texto que se pueda leer.'
}

export function extensionOf(filePath: string): string {
  return extname(filePath).toLowerCase()
}

export function unsupportedReason(filePath: string): string {
  return UNSUPPORTED_ADVICE[extensionOf(filePath)] ?? 'Este tipo de archivo no se puede leer. Use .docx, .pdf o .txt.'
}

/** Normalizes whitespace while keeping paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Lazy import: pdf.js is large and only needed for PDFs.
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  return text.join('\n\n')
}

/** Extracts plain text from a supported file. Throws `UserError` with a friendly reason on failure. */
export async function extractText(filePath: string): Promise<string> {
  const ext = extensionOf(filePath)
  const buffer = await readFile(filePath)
  let text: string
  try {
    switch (ext) {
      case '.docx':
        text = (await mammoth.extractRawText({ buffer })).value
        break
      case '.pdf':
        text = await extractPdf(buffer)
        break
      case '.txt':
      case '.md':
        text = buffer.toString('utf8')
        break
      default:
        throw new UserError(unsupportedReason(filePath))
    }
  } catch (err) {
    if (err instanceof UserError) throw err
    throw new UserError('No se pudo leer el archivo. Puede estar dañado o protegido con contraseña.', { cause: err })
  }
  const normalized = normalizeText(text)
  if (normalized.length === 0) {
    throw new UserError(
      ext === '.pdf'
        ? 'El PDF no contiene texto (probablemente es un escaneo). Se necesita una versión con texto o en Word.'
        : 'El documento está vacío.'
    )
  }
  return normalized
}

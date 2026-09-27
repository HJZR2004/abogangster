export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  size: number
  /** Characters of the previous chunk repeated at the start of the next one. */
  overlap: number
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { size: 1200, overlap: 200 }

/** Splits a long paragraph at sentence boundaries, falling back to hard cuts. */
function splitLong(paragraph: string, size: number): string[] {
  const sentences = paragraph.match(/[^.!?;:]+[.!?;:]+["')\]]*\s*|[^.!?;:]+$/g) ?? [paragraph]
  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > size) {
      if (current) parts.push(current.trim())
      current = ''
      for (let i = 0; i < sentence.length; i += size) parts.push(sentence.slice(i, i + size).trim())
      continue
    }
    if (current.length + sentence.length > size && current) {
      parts.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) parts.push(current.trim())
  return parts.filter(Boolean)
}

/** Last `overlap` characters of `text`, starting at a word boundary. */
function tail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return overlap > 0 ? text : ''
  const slice = text.slice(text.length - overlap)
  const space = slice.indexOf(' ')
  return space >= 0 ? slice.slice(space + 1) : slice
}

/**
 * Splits text into overlapping chunks, respecting paragraph boundaries when possible.
 * Chunks are the unit of search: small enough to be precise, large enough to keep context.
 */
export function chunkText(text: string, options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): string[] {
  const { size, overlap } = options
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > size ? splitLong(p, size) : [p]))

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > size) {
      chunks.push(current)
      const carry = tail(current, overlap)
      current = carry && carry.length + paragraph.length + 1 <= size ? `${carry}\n${paragraph}` : paragraph
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)
  return chunks
}

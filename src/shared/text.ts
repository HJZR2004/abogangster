/** Marker the AI writes wherever a fact is missing; the lawyer must replace it before filing. */
export const PENDING_MARKER = /\[COMPLETAR[^\]]*\]/gi

/** Counts `[COMPLETAR: ...]` markers still present in a text. */
export function countPending(text: string): number {
  return (text.match(PENDING_MARKER) ?? []).length
}

/**
 * Removes Markdown the models tend to produce even when told not to,
 * because Word output must be plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^```[\s\S]*?\n|```$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * An error whose message is safe and meaningful to show to the user (in Spanish).
 * Anything that is not a `UserError` is treated as unexpected and logged with its stack.
 */
export class UserError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UserError'
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

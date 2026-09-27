import { UserError } from '../errors'

function collectText(err: unknown, depth = 0): string {
  if (!err || depth > 4) return ''
  if (typeof err === 'string') return err
  if (typeof err !== 'object') return String(err)
  const e = err as { message?: unknown; code?: unknown; statusCode?: unknown; responseBody?: unknown; cause?: unknown }
  return [e.message, e.code, e.statusCode, e.responseBody, collectText(e.cause, depth + 1)]
    .filter((v) => v !== undefined && v !== null)
    .map(String)
    .join(' | ')
}

function statusOf(err: unknown): number | null {
  let current: unknown = err
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    const code = (current as { statusCode?: unknown }).statusCode
    if (typeof code === 'number') return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/**
 * Translates provider/network errors into actionable Spanish messages.
 * `UserError`s pass through unchanged.
 */
export function humanizeAiError(err: unknown, ctx: { provider: string; model: string }): UserError {
  if (err instanceof UserError) return err
  const text = collectText(err).toLowerCase()
  const status = statusOf(err)

  if (text.includes('abort')) return new UserError('Se canceló la operación.', { cause: err })
  if (['econnrefused', 'fetch failed', 'enotfound', 'cannot connect', 'econnreset', 'etimedout'].some((s) => text.includes(s))) {
    return new UserError(
      ctx.provider === 'ollama'
        ? 'No se pudo conectar con Ollama. Verifique que Ollama esté abierto (icono junto al reloj de Windows).'
        : 'No se pudo conectar con el servicio de inteligencia artificial. Revise la conexión a internet.',
      { cause: err }
    )
  }
  if (status === 401 || status === 403 || text.includes('invalid x-api-key') || text.includes('incorrect api key')) {
    return new UserError('La clave de API no es válida o no tiene permisos. Revísela en Configuración.', { cause: err })
  }
  if (status === 404 || (text.includes('model') && text.includes('not found'))) {
    return new UserError(
      ctx.provider === 'ollama'
        ? `El modelo "${ctx.model}" no está instalado en Ollama. Instálelo con: ollama pull ${ctx.model}`
        : `El modelo "${ctx.model}" no existe o no está disponible para esta cuenta.`,
      { cause: err }
    )
  }
  if (status === 429 || text.includes('rate limit')) {
    return new UserError('Se alcanzó el límite de uso del servicio. Espere unos minutos e intente de nuevo.', { cause: err })
  }
  if (text.includes('credit') || text.includes('billing') || text.includes('insufficient_quota')) {
    return new UserError('La cuenta del servicio de IA no tiene saldo disponible.', { cause: err })
  }
  if (text.includes('context') && (text.includes('length') || text.includes('too long') || text.includes('window'))) {
    return new UserError(
      'Los documentos son demasiado largos para este modelo. Seleccione menos documentos o reduzca el contexto en Configuración.',
      { cause: err }
    )
  }
  if (status !== null && status >= 500) {
    return new UserError('El servicio de inteligencia artificial tuvo un problema temporal. Intente de nuevo.', { cause: err })
  }
  return new UserError(`La inteligencia artificial devolvió un error: ${collectText(err).slice(0, 300)}`, { cause: err })
}

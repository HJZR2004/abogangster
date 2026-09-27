import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

const MAX_LOG_BYTES = 2 * 1024 * 1024

let logFile: string | null = null

/** Starts writing logs to `<dir>/abogangster.log` (rotated to `.old` above 2 MB). */
export function initLogger(dir: string): void {
  mkdirSync(dir, { recursive: true })
  logFile = join(dir, 'abogangster.log')
  try {
    if (statSync(logFile).size > MAX_LOG_BYTES) renameSync(logFile, `${logFile}.old`)
  } catch {
    // File does not exist yet.
  }
}

function serialize(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function write(level: Level, scope: string, parts: unknown[]): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${parts.map(serialize).join(' ')}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  if (!logFile) return
  try {
    appendFileSync(logFile, `${line}\n`)
  } catch {
    // Never let logging crash the app.
  }
}

export interface Logger {
  debug(...parts: unknown[]): void
  info(...parts: unknown[]): void
  warn(...parts: unknown[]): void
  error(...parts: unknown[]): void
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...p) => write('debug', scope, p),
    info: (...p) => write('info', scope, p),
    warn: (...p) => write('warn', scope, p),
    error: (...p) => write('error', scope, p)
  }
}

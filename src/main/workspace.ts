import { mkdirSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'

/**
 * Folder layout of the workspace (by default `Documentos\Abogangster`).
 * Everything the lawyer owns lives here, so backing up this folder backs up everything.
 */
export interface WorkspacePaths {
  root: string
  cases: string
  library: string
  templates: string
  /** Internal data (SQLite index). Hidden-ish folder; safe to delete to force a full reindex. */
  data: string
  database: string
}

export const CASE_DOCUMENTS_DIR = 'Documentos'
export const CASE_OUTPUT_DIR = 'Escritos generados'

export function workspacePaths(root: string): WorkspacePaths {
  const data = join(root, '.abogangster')
  return {
    root,
    cases: join(root, 'Casos'),
    library: join(root, 'Biblioteca'),
    templates: join(root, 'Plantillas'),
    data,
    database: join(data, 'abogangster.db')
  }
}

export function ensureWorkspace(paths: WorkspacePaths): void {
  for (const dir of [paths.root, paths.cases, paths.library, paths.templates, paths.data]) {
    mkdirSync(dir, { recursive: true })
  }
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g

/** Makes a string safe to use as a Windows file or folder name. */
export function safeFileName(name: string, fallback = 'Sin nombre'): string {
  const cleaned = name
    .replace(INVALID_FILENAME_CHARS, ' ')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  return cleaned || fallback
}

/** True when `child` is `parent` or is located inside it. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel))
}

/** Files that must never be indexed: Word lock files, hidden files, temp files. */
export function isIgnoredFile(filePath: string): boolean {
  const name = basename(filePath)
  return name.startsWith('~$') || name.startsWith('.') || name.endsWith('.tmp') || name === 'desktop.ini' || name === 'Thumbs.db'
}

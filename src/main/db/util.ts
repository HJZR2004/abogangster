import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>

export const newId = (): string => randomUUID()
export const nowIso = (): string => new Date().toISOString()

export function str(row: Row, key: string): string {
  const v = row[key]
  return v === null || v === undefined ? '' : String(v)
}

export function strOrNull(row: Row, key: string): string | null {
  const v = row[key]
  return v === null || v === undefined ? null : String(v)
}

export function num(row: Row, key: string): number {
  const v = row[key]
  return typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : Number(v ?? 0)
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Serializes a vector for storage in a BLOB column. */
export function vectorToBlob(vector: ArrayLike<number>): Uint8Array {
  const f32 = Float32Array.from(vector)
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
}

export function blobToVector(blob: unknown): Float32Array | null {
  if (!(blob instanceof Uint8Array) || blob.byteLength % 4 !== 0) return null
  // Copy to guarantee 4-byte alignment.
  const copy = new Uint8Array(blob)
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

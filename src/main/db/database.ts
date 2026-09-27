import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

export type Db = DatabaseSync

/**
 * Opens (or creates) the SQLite database and applies pending migrations.
 * Uses Node's built-in `node:sqlite`, so the app has no native modules to compile.
 */
export function openDatabase(filePath: string): Db {
  const db = new DatabaseSync(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  let version = row.user_version
  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue
    transaction(db, () => {
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
    })
    version = migration.version
  }
}

/** Runs `fn` inside a transaction. Nested calls join the outer transaction. */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

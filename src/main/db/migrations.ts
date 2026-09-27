/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 * Never edit a migration that has already shipped: add a new one instead.
 * The schema is documented in docs/context/base-de-datos.md — keep it in sync.
 */
export interface Migration {
  version: number
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: /* sql */ `
      CREATE TABLE cases (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        client_name   TEXT NOT NULL DEFAULT '',
        case_number   TEXT NOT NULL DEFAULT '',
        court         TEXT NOT NULL DEFAULT '',
        counterparty  TEXT NOT NULL DEFAULT '',
        description   TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'activo',
        local_only    INTEGER NOT NULL DEFAULT 0,
        folder_path   TEXT NOT NULL UNIQUE,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE documents (
        id           TEXT PRIMARY KEY,
        scope        TEXT NOT NULL CHECK (scope IN ('case', 'library')),
        case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
        path         TEXT NOT NULL UNIQUE,
        rel_path     TEXT NOT NULL,
        file_name    TEXT NOT NULL,
        ext          TEXT NOT NULL,
        size         INTEGER NOT NULL DEFAULT 0,
        mtime_ms     REAL NOT NULL DEFAULT 0,
        hash         TEXT,
        status       TEXT NOT NULL DEFAULT 'pendiente',
        error        TEXT,
        char_count   INTEGER NOT NULL DEFAULT 0,
        chunk_count  INTEGER NOT NULL DEFAULT 0,
        description  TEXT NOT NULL DEFAULT '',
        content      TEXT NOT NULL DEFAULT '',
        indexed_at   TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX idx_documents_case ON documents(case_id);

      CREATE TABLE chunks (
        id               INTEGER PRIMARY KEY,
        document_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        ordinal          INTEGER NOT NULL,
        text             TEXT NOT NULL,
        embedding        BLOB,
        embedding_model  TEXT
      );
      CREATE INDEX idx_chunks_document ON chunks(document_id);

      -- Full-text index over chunks. Accent-insensitive so "contestacion" matches "contestación".
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        text,
        content = 'chunks',
        content_rowid = 'id',
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
      END;
      CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
      END;
      CREATE TRIGGER chunks_au AFTER UPDATE OF text ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
        INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
      END;

      CREATE TABLE templates (
        id           TEXT PRIMARY KEY,
        file_name    TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        description  TEXT NOT NULL DEFAULT '',
        rules        TEXT NOT NULL DEFAULT '',
        fields_json  TEXT NOT NULL DEFAULT '[]',
        error        TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE drafts (
        id                        TEXT PRIMARY KEY,
        case_id                   TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        template_id               TEXT REFERENCES templates(id) ON DELETE SET NULL,
        title                     TEXT NOT NULL,
        instructions              TEXT NOT NULL DEFAULT '',
        source_document_ids_json  TEXT NOT NULL DEFAULT '[]',
        field_values_json         TEXT NOT NULL DEFAULT '{}',
        body                      TEXT NOT NULL DEFAULT '',
        status                    TEXT NOT NULL DEFAULT 'borrador',
        output_path               TEXT,
        error                     TEXT,
        created_at                TEXT NOT NULL,
        updated_at                TEXT NOT NULL
      );
      CREATE INDEX idx_drafts_case ON drafts(case_id);

      CREATE TABLE chat_messages (
        id            TEXT PRIMARY KEY,
        case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content       TEXT NOT NULL,
        sources_json  TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT NOT NULL
      );
      CREATE INDEX idx_chat_case ON chat_messages(case_id, created_at);
    `
  }
]

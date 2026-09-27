# Base de datos

SQLite mediante `node:sqlite` (incluido en Electron, sin módulos nativos). Archivo:
`<espacio de trabajo>\.abogangster\abogangster.db`, modo WAL, `foreign_keys = ON`.

La versión del esquema se guarda en `PRAGMA user_version`. Las migraciones están en
`src/main/db/migrations.ts` y se aplican en orden, cada una dentro de una transacción.
**Nunca edites una migración ya publicada**: agrega una nueva con `version` siguiente.

## Esquema (versión 1)

### `cases`: un caso o expediente = un índice de documentos
| Columna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | UUID |
| title, client_name, case_number, court, counterparty | TEXT | Datos del caso |
| description | TEXT | Contexto que recibe la IA en cada escrito y pregunta |
| status | TEXT | `activo` \| `en_espera` \| `cerrado` |
| local_only | INTEGER | 1 = solo IA local (confidencial) |
| folder_path | TEXT UNIQUE | Carpeta absoluta del caso |
| created_at, updated_at | TEXT | ISO 8601 |

### `documents`: archivos de un caso o de la biblioteca
| Columna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | UUID |
| scope | TEXT | `case` \| `library` |
| case_id | TEXT FK → cases (CASCADE) | NULL en la biblioteca |
| path | TEXT UNIQUE | Ruta absoluta |
| rel_path, file_name, ext | TEXT | `rel_path` es relativa a la raíz (carpeta del caso o de la biblioteca) |
| size, mtime_ms | INTEGER/REAL | Para detectar cambios sin leer el archivo |
| hash | TEXT | sha256 del contenido (evita reindexar si solo cambió la fecha) |
| status | TEXT | `pendiente` \| `indexado` \| `error` \| `no_soportado` |
| error | TEXT | Motivo en español, visible para el usuario |
| content | TEXT | Texto extraído completo (se usa como "documento a contestar") |
| char_count, chunk_count | INTEGER | |
| description | TEXT | Nota del usuario sobre el documento |
| indexed_at, created_at | TEXT | |

### `chunks`: fragmentos de búsqueda
| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | rowid (lo usa FTS) |
| document_id | TEXT FK → documents (CASCADE) | |
| ordinal | INTEGER | Orden dentro del documento |
| text | TEXT | ~1200 caracteres |
| embedding | BLOB | Float32Array serializado; NULL si falta |
| embedding_model | TEXT | `proveedor:modelo`; si cambia el modelo se recalcula |

### `chunks_fts`: índice de texto completo
Tabla virtual FTS5 con *external content* sobre `chunks` y `tokenize='unicode61 remove_diacritics 2'`
(ignora acentos: "contestacion" encuentra "contestación"). Se mantiene sincronizada con los triggers
`chunks_ai`, `chunks_ad` y `chunks_au`. Las consultas se arman con `buildFtsQuery()` (comillas +
prefijo + OR), así que el usuario no puede inyectar sintaxis FTS.

### `templates`: configuración sobre los .docx de `Plantillas\`
| Columna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | |
| file_name | TEXT UNIQUE | Nombre del .docx dentro de `Plantillas\` |
| name, description, rules | TEXT | Editables por el usuario |
| fields_json | TEXT | `TemplateField[]`: `{name, label, mode: 'ia'\|'manual', instruction}` |
| error | TEXT | Problema detectado al leer el .docx |

### `drafts`: escritos
| Columna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | |
| case_id | TEXT FK → cases (CASCADE) | |
| template_id | TEXT FK → templates (SET NULL) | NULL = escrito libre |
| title, instructions | TEXT | |
| source_document_ids_json | TEXT | IDs de los documentos que se contestan |
| field_values_json | TEXT | `{campo: texto}` (escritos con plantilla) |
| body | TEXT | Texto completo (escritos libres) |
| status | TEXT | `borrador` \| `generando` \| `listo` \| `exportado` |
| output_path | TEXT | .docx generado |
| error | TEXT | Último error de redacción |

Al arrancar, los escritos que quedaron en `generando` (por un cierre forzado) vuelven a `borrador`.

### `chat_messages`
`id`, `case_id` (FK CASCADE), `role` (`user`\|`assistant`), `content`, `sources_json`
(`SourceRef[]`), `created_at`.

## Consultas útiles para soporte

```sql
-- Documentos con problemas
SELECT rel_path, status, error FROM documents WHERE status IN ('error','no_soportado');
-- Avance de embeddings
SELECT COUNT(*) total, SUM(embedding IS NOT NULL) con_vector FROM chunks;
-- Forzar recálculo de embeddings
UPDATE chunks SET embedding = NULL, embedding_model = NULL;
```
Para abrir la BD: [DB Browser for SQLite](https://sqlitebrowser.org/) con la app **cerrada**.

# IPC: comunicación entre la interfaz y el proceso principal

Todo el contrato está en `src/shared/ipc.ts`. Hay dos tipos de mensajes:

- **Llamadas** (`InvokeContract`): el renderer llama con `invoke('canal', ...args)` y espera una
  respuesta. En el cable viaja un sobre `{ ok: true, data } | { ok: false, error }`; el preload lo
  desenvuelve y, si hay error, lanza `Error(mensaje en español)`.
- **Eventos** (`EventContract`): main → renderer, con `useEvent('canal', handler)`.

## Agregar una llamada nueva

1. `src/shared/ipc.ts`: agrégala a `InvokeContract` con sus `args` y `result`.
2. Mismo archivo: agrégala a `INVOKE_CHANNEL_MAP` (si falta, TypeScript no compila).
3. `src/main/ipc/handlers.ts`: `handle('canal', (...) => ...)`, validando cada argumento con zod
   (`src/main/ipc/schemas.ts`). Lanza `UserError` para los mensajes al usuario.
4. Renderer: `await invoke('canal', ...)`: los tipos se infieren solos.

## Canales

| Grupo | Canales |
|---|---|
| app | `info`, `openPath`, `showInFolder` (solo dentro del espacio de trabajo), `pickFiles`, `pickFolder` |
| cases | `list`, `get`, `create`, `update`, `delete` |
| documents | `list(caseId\|null)`, `import(caseId\|null, rutas)`, `setDescription`, `reindex`, `trash`, `search` |
| indexing | `status`, `rescan` |
| templates | `list`, `update`, `import`, `openFolder` |
| drafts | `list(caseId\|null)`, `get`, `create`, `update`, `generate`, `regenerateField`, `cancel`, `export`, `delete` |
| chat | `history`, `ask`, `cancel`, `clear` |
| settings | `get`, `update`, `testChat`, `testEmbedding`, `ollamaModels`, `changeWorkspace` |

`caseId: null` en `documents:*` significa **biblioteca**.

## Eventos

| Evento | Carga | Cuándo |
|---|---|---|
| `indexing:status` | `{pending, running, currentFile}` | Cambia la cola del indexador |
| `documents:changed` | `{caseId\|null}` | Se agregó, cambió o borró un documento (agrupado cada ~0.8 s) |
| `templates:changed` | `{}` | Cambió la carpeta `Plantillas\` |
| `chat:delta` | `{caseId, delta}` | Texto de la respuesta en vivo |
| `drafts:progress` | `field-start` \| `delta` \| `field-end` \| `done` \| `error` | Avance de la redacción |

Las llamadas largas (`drafts:generate`, `chat:ask`) se resuelven al terminar; mientras tanto el
avance llega por eventos. Se cancelan con `drafts:cancel` / `chat:cancel` (AbortController).

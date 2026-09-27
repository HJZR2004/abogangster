# Arquitectura

## Procesos

```
┌──────────────────────── Electron ────────────────────────┐
│ Renderer (React, sandbox, sin Node)                       │
│   window.api.invoke(canal, ...args)  /  window.api.on()   │
│                     │  IPC (contrato en shared/ipc.ts)     │
│ Preload (CJS): lista blanca de canales, sobre {ok,data}   │
│                     │                                      │
│ Main (Node 24, ESM)                                        │
│   ipc/handlers.ts ── zod ──► servicios (AppContext)        │
│   ├─ CaseService       casos y carpetas                    │
│   ├─ Indexer + Watcher archivos → texto → fragmentos       │
│   ├─ SearchService     FTS5 + embeddings (RRF)             │
│   ├─ TemplateService   .docx con {{campos}}                │
│   ├─ DraftingService   redacción por secciones → .docx     │
│   ├─ ChatService       preguntas sobre el caso (RAG)       │
│   └─ AiService         AI SDK → Ollama/Claude/OpenAI/…     │
│   SQLite (node:sqlite) en <espacio>/.abogangster/          │
└──────────────────────────────────────────────────────────┘
```

## Dónde viven los datos

| Qué | Dónde | Notas |
|---|---|---|
| Espacio de trabajo | `Documentos\Abogangster\` (configurable) | Respaldar esta carpeta = respaldar todo |
| Casos | `Casos\<Nombre - Expediente>\Documentos\` y `Escritos generados\` | Carpetas normales de Windows |
| Biblioteca | `Biblioteca\` | Compartida por todos los casos |
| Plantillas | `Plantillas\*.docx` | El .docx manda en el formato; la BD guarda reglas e instrucciones |
| Índice + metadatos | `.abogangster\abogangster.db` | SQLite WAL. Casos, descripciones, escritos, chat, fragmentos |
| Configuración | `%APPDATA%\Abogangster\settings.json` | Claves de API cifradas con DPAPI (safeStorage) |
| Registros | `%APPDATA%\Abogangster\logs\abogangster.log` | Rota a `.old` al pasar 2 MB |

Borrar la BD hace perder los metadatos (descripciones, escritos, chat), pero **no los documentos**.
Los documentos se vuelven a indexar solos al abrir la app.

## Flujo: indexación

1. Al iniciar: `Indexer.scanAll()` recorre cada raíz (biblioteca + carpeta de cada caso), compara
   tamaño y fecha con la BD, encola lo que cambió y borra de la BD lo que ya no existe.
2. En vivo: `FolderWatcher` (chokidar, `awaitWriteFinish` 1.5 s) avisa de altas, cambios y bajas.
3. Por archivo: hash sha256 (si no cambió el contenido, no se reprocesa) → `extractText` →
   `chunkText` (~1200 caracteres, 200 de solapamiento) → `replaceChunks` (transacción; FTS por triggers).
4. Después, `backfillEmbeddings` calcula vectores en lotes de 32 si hay un modelo de embeddings.
   Si falla (p. ej. Ollama cerrado), se pausa 5 minutos. **La búsqueda por palabras funciona igual.**

## Flujo: redactar un escrito

1. `NewDraftPage` → `drafts:create`: se llenan los campos automáticos (`fields.ts`: expediente,
   juzgado, cliente, fecha, datos del abogado…).
2. `DraftPage?redactar=1` → `drafts:generate`:
   - `prepare()`: verifica la privacidad, arma el contexto (datos del caso + texto completo de los
     documentos elegidos + fragmentos relevantes del caso y la biblioteca) dentro del presupuesto de
     caracteres (`contextBudget`).
   - Por cada campo `ia` de la plantilla, en orden: una llamada al modelo con el mismo prefijo de
     contexto (cacheable) + la tarea de esa sección + las secciones ya redactadas.
   - El avance se transmite con eventos `drafts:progress` (el texto aparece en vivo).
3. El abogado revisa y edita (se guarda solo en ~0.8 s) y regenera secciones sueltas si hace falta.
4. `drafts:export` → docxtemplater llena la plantilla → `Escritos generados\<título> <fecha>.docx`.
   Ese archivo queda dentro del caso, así que también se indexa (sirve de referencia a futuro).

## Decisiones y por qué

| Decisión | Motivo | Alternativas descartadas |
|---|---|---|
| **Electron + TypeScript** en un solo lenguaje | Un solo desarrollador mantiene todo; ecosistema maduro para .docx | Tauri (obliga a usar Rust), Python + backend aparte (empaquetado frágil), CAP/SAP (pensado para servidores empresariales) |
| **`node:sqlite`** en lugar de better-sqlite3 | Sin módulos nativos: `npm ci` funciona en cualquier Windows sin Visual Studio. Trae FTS5 con `remove_diacritics` | better-sqlite3 (compilar para el ABI de Electron), LanceDB (nativo) |
| **Vectores en BLOB + coseno en JS** | Un despacho tiene miles de fragmentos, no millones; buscar por caso es instantáneo | sqlite-vec (extensión nativa), servidor vectorial |
| **Búsqueda híbrida con RRF** | Las palabras exactas importan en derecho (artículos, nombres); los embeddings encuentran sinónimos | Solo embeddings (falla con números de artículo), solo FTS |
| **Vercel AI SDK** | Una interfaz para todos los proveedores; Ollama y LM Studio vía API compatible con OpenAI | SDKs de cada proveedor por separado |
| **Plantillas .docx + docxtemplater** | El formato lo pone Word, no la IA: márgenes, tipografía y encabezados quedan exactos | Pedir a la IA el documento completo (el formato varía), Pandoc (binario externo) |
| **Redacción sección por sección** | Funciona con modelos locales pequeños, permite regenerar una sola sección y mostrar avance | Una sola llamada con JSON estructurado (falla con modelos locales) |
| **Carpetas como fuente de la verdad** | Se sigue usando el Explorador de Windows; los respaldos son copias de carpetas | Guardar los archivos dentro de la BD |
| **Casos confidenciales ("solo IA local")** | Secreto profesional: el abogado decide qué nunca sale de la máquina | Todo en la nube |

## Seguridad

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP estricta en `index.html`.
- Preload con lista blanca de canales; todo argumento se valida con zod en main.
- El renderer solo puede abrir rutas dentro del espacio de trabajo.
- Navegación bloqueada; los enlaces `https` se abren en el navegador del sistema.
- Claves de API: cifradas con `safeStorage` (DPAPI de Windows) y nunca enviadas al renderer.

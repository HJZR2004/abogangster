# Abogangster — contexto para IA y desarrolladores

App de escritorio local (Windows) para un abogado: organiza **casos** (cada uno es un índice de
documentos propio), lee sus archivos Word/PDF y usa IA (Ollama, Claude, OpenAI o cualquier
proveedor compatible con OpenAI) para **redactar contestaciones dentro de las plantillas .docx del
despacho**. El usuario final es un abogado de 50 años, hispanohablante, que solo revisa lo que la IA
redacta; el desarrollador (su hijo) instala y mantiene por AnyDesk.

**Lee este archivo primero. No leas todo el repo**: usa el mapa de abajo y abre solo lo necesario.
El detalle por tema está en `docs/context/`.

## Comandos

```bash
npm ci                 # instalar (sin módulos nativos que compilar)
npm run dev            # app en modo desarrollo con recarga en caliente
npm test               # vitest: 44 pruebas, ~8 s, sin red ni IA
npm run typecheck      # tsc de main+preload (node) y renderer (web)
npm run build          # typecheck + bundle en out/
npm run build:win      # instalador de Windows en dist/ (ejecutar en Windows)
```

Variables de entorno de desarrollo y mantenimiento: `ABOGANGSTER_DATA_DIR` (perfil aislado),
`ABOGANGSTER_DEMO=1` (datos de demostración), `ABOGANGSTER_SCREENSHOTS=<dir>` (capturas de cada
pantalla y salir). Ver `src/main/dev-tools.ts`.

## Stack

Electron 44 · TypeScript 5.9 estricto · electron-vite 5 (Vite 7) · React 19 + react-router 7
(HashRouter) · Tailwind 4 · **`node:sqlite`** (incluido en Electron, con FTS5) · Vercel AI SDK 7 ·
docxtemplater (plantillas) · mammoth (leer .docx) · unpdf (leer PDF) · docx (generar .docx) ·
chokidar 5 · zod 4 · vitest 4.

## Mapa del código

```
src/shared/          Tipos y contrato IPC compartidos por las 3 capas (solo tipos + constantes)
  types.ts           Modelo de dominio: Case, Document, Template, Draft, Chat, Settings
  ipc.ts             InvokeContract / EventContract: TODOS los canales main<->renderer
  text.ts            countPending ([COMPLETAR]), stripMarkdown
src/main/            Proceso principal de Electron (Node)
  index.ts           Arranque: ventana, menú, seguridad, logs
  app-context.ts     Raíz de composición: conecta todos los servicios (sin APIs de Electron → testeable)
  ipc/handlers.ts    Un handler por canal; valida con zod (ipc/schemas.ts)
  db/                SQLite: database.ts (abrir+migraciones), migrations.ts (esquema), *-repo.ts
  ingestion/         extract.ts (docx/pdf/txt→texto), chunker.ts, indexer.ts (cola), watcher.ts
  search/            search-service.ts: híbrida FTS5 (bm25) + coseno sobre embeddings, fusión RRF
  ai/                providers.ts (único archivo que conoce proveedores), ai-service.ts (stream/embeddings),
                     prompts.ts (TODO el texto de los prompts), errors.ts (mensajes de error en español)
  templates/         template-service.ts (detectar {{campos}}, render), fields.ts (campos automáticos),
                     docx-writer.ts (docx libre + plantillas de ejemplo)
  services/          case-service.ts, drafting-service.ts (redacción por secciones), chat-service.ts
  settings/          settings-store.ts (JSON en userData, claves de API cifradas con safeStorage)
  workspace.ts       Estructura de carpetas del espacio de trabajo
src/preload/index.ts Puente mínimo: window.api.invoke/on con lista blanca de canales
src/renderer/src/    Interfaz React (en español)
  pages/             HomePage, CasesPage, CasePage (pestañas), NewDraftPage (asistente), DraftPage (revisión),
                     LibraryPage, TemplatesPage, SettingsPage
  components/        ui.tsx (componentes base), feedback.tsx (avisos, modal, confirmar), DocumentsPanel,
                     ChatPanel, CaseForm, DraftList, Layout
  lib/               api.ts (invoke/useEvent/useLoad), format.ts (etiquetas y fechas), settings-context.tsx
tests/               vitest; helpers.ts tiene fakeStreamer/fakeCipher; ai-service.test.ts usa un
                     servidor HTTP falso compatible con Ollama
docs/                Documentación para humanos + docs/context/ (contexto técnico por tema)
```

## Reglas que el código debe respetar (invariantes)

1. **Privacidad**: un caso con `localOnly` (o `localOnlyGlobal`) nunca va a proveedores en la nube.
   Chat/redacción → `AiService.assertChatAllowed`. Embeddings → `Indexer` excluye esos casos si el
   embedder no es local. Prueba: `tests/embeddings.test.ts`.
2. **Mensajes al usuario en español**. Todo lo que el usuario deba leer se lanza como `UserError`
   (`src/main/errors.ts`); los demás errores se registran con stack y se muestran como "error inesperado".
3. **El contrato IPC vive en `src/shared/ipc.ts`**. Agregar un canal = contrato + `INVOKE_CHANNEL_MAP`
   (el compilador lo exige) + handler en `ipc/handlers.ts` con validación zod.
4. **El renderer no tiene acceso a Node** (`contextIsolation`, `sandbox`, preload con lista blanca).
   Solo puede abrir rutas dentro del espacio de trabajo (`assertWorkspacePath`).
5. **Nada se borra sin confirmación**: los documentos van a la Papelera; quitar un caso conserva su
   carpeta. Toda acción destructiva en la UI pasa por `useFeedback().confirm`.
6. **La IA no debe inventar**: dato faltante → `[COMPLETAR: …]`, punto dudoso → `[REVISAR: …]`.
   La UI los cuenta. Los prompts viven solo en `ai/prompts.ts`.
7. **Sin módulos nativos** (obligarían a compilar en la máquina del abogado). Usar `node:sqlite`.
8. **Esquema**: nunca editar una migración ya publicada; agregar otra en `db/migrations.ts` y
   actualizar `docs/context/base-de-datos.md`.

## Convenciones

- Código, identificadores y comentarios en inglés; UI, documentación y prompts en español.
- Los comentarios explican el *por qué*, no el *qué*. Funciones cortas; los servicios reciben sus
  dependencias por constructor.
- UI: trato de "usted", objetivos grandes (mín. 44 px), etiqueta visible siempre, verbos en los
  botones, sin jerga técnica en las pantallas del abogado (lo técnico solo en Configuración → IA).
- Pruebas: todo cambio de lógica en servicios va con una prueba en `tests/`. Las pruebas no usan red.

## Dónde cambiar cada cosa (guía rápida)

| Quiero… | Archivo |
|---|---|
| Mejorar lo que redacta la IA | `src/main/ai/prompts.ts` |
| Agregar un proveedor de IA | `src/main/ai/providers.ts` + uniones en `shared/types.ts` + `SettingsPage.tsx` |
| Nuevo campo automático en plantillas | `src/main/templates/fields.ts` (`AUTO_FIELDS`) + `docs/PLANTILLAS.md` |
| Soportar otro tipo de archivo | `src/main/ingestion/extract.ts` |
| Nueva tabla/columna | `src/main/db/migrations.ts` (migración nueva) + repo + `docs/context/base-de-datos.md` |
| Nueva pantalla | `src/renderer/src/pages/` + ruta en `App.tsx` + `Layout.tsx` si va en el menú |

## Contexto por tema (abrir solo si hace falta)

- `docs/context/arquitectura.md` — procesos, flujos de datos, decisiones y sus razones
- `docs/context/base-de-datos.md` — esquema completo
- `docs/context/ipc.md` — canales, eventos y cómo agregar uno
- `docs/context/ia-y-busqueda.md` — proveedores, prompts, redacción por secciones, RAG, embeddings
- `docs/context/interfaz.md` — pantallas, componentes, reglas de UX
- `docs/INSTALACION.md`, `docs/MANTENIMIENTO.md` — instalación y soporte en la máquina del abogado

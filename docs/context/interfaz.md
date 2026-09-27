# Interfaz

React 19 + react-router 7 (`HashRouter`, porque la app se carga desde `file://`) + Tailwind 4.
Todo el texto visible está en español, con trato de **usted**.

## Principios de UX (usuario de 50 años, poco técnico)

1. **Una acción principal por pantalla**, en botón azul grande (`Button variant="primary" size="lg"`).
2. **Letra grande**: 18 px por defecto; ajustable en Configuración (14–26 px) o con Ctrl +/−.
   Todo usa `rem`, así que escala completo.
3. **Nada técnico** fuera de Configuración → Inteligencia artificial. Sin "embeddings", "tokens" ni
   "indexar" en las demás pantallas ("Leyendo documentos", "Búsqueda inteligente").
4. **Nunca se pierde nada**: confirmación antes de borrar (`useFeedback().confirm`), documentos a la
   Papelera, guardado automático en la revisión.
5. **Siempre se explica qué pasó**: avisos (`success`/`error`) y mensajes de error accionables
   ("Verifique que Ollama esté abierto…").
6. **Estados vacíos que enseñan** (`EmptyState` con el siguiente paso).
7. Accesibilidad: etiquetas asociadas (`Field`), foco visible, `role`/`aria-*` en pestañas, avisos y
   diálogos; objetivos de 44 px o más.

## Pantallas (`src/renderer/src/pages/`)

| Ruta | Pantalla | Propósito |
|---|---|---|
| `/` | HomePage | Saludo, 3 acciones grandes, **escritos listos para revisar** |
| `/casos` | CasesPage | Lista y filtro sin acentos; `?nuevo=1` abre el formulario |
| `/casos/:id` | CasePage | Pestañas `?tab=`: resumen, documentos, escritos, preguntar |
| `/escritos/nuevo` | NewDraftPage | Asistente de 4 pasos (caso → documento → tipo → indicaciones); `?caso=` preselecciona |
| `/escritos/:id` | DraftPage | Revisión: datos generales, secciones con texto en vivo, regenerar sección, crear .docx. `?redactar=1` inicia la redacción |
| `/biblioteca` | LibraryPage | DocumentsPanel con `caseId = null` |
| `/plantillas` | TemplatesPage | Tarjetas, editor de reglas y campos, ayuda para crear plantillas |
| `/configuracion` | SettingsPage | Datos del abogado, reglas, letra, privacidad, IA (técnico), carpeta |

## Componentes (`src/renderer/src/components/`)

- `ui.tsx`: `Button`, `Card`, `PageHeader`, `Field` (etiqueta + control + pista), `Input`, `Select`,
  `Textarea` (crece sola), `Checkbox`, `Badge`, `Alert`, `Spinner`, `EmptyState`, `Tabs`.
- `feedback.tsx`: `FeedbackProvider` (avisos y confirmaciones) y `Modal` (`<dialog>` nativo).
- `DocumentsPanel.tsx`: agregar archivos o carpetas, arrastrar y soltar, buscar, descripción por
  documento, abrir, reintentar, enviar a la Papelera.
- `ChatPanel.tsx`: conversación con respuesta en vivo, fuentes desplegables y preguntas de ejemplo.
- `CaseForm.tsx`: alta y edición; en el alta permite importar una carpeta completa del cliente.

## Datos en el renderer (`lib/api.ts`)

- `invoke(canal, ...args)`: llamada tipada.
- `useLoad(loader, deps)` → `{data, error, loading, reload, setData}`.
- `useEvent(canal, handler)`: suscripción a eventos con limpieza automática.
- `useSettings()` (`lib/settings-context.tsx`): configuración pública y `reload()`.

Patrón: cargar con `useLoad` y refrescar con `reload()` cuando llega un evento relevante
(`documents:changed`, `drafts:progress`, `templates:changed`). No hay store global.

## Tokens de diseño (`styles.css`)

Colores `paper`, `surface`, `ink`, `muted`, `line`, `brand-*`, `ok-*`, `warn-*`, `bad-*`; fuente
Segoe UI; `.document-text` (serif, interlineado 1.7) para el texto jurídico.

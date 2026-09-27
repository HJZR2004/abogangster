# IA y búsqueda

## Proveedores (`src/main/ai/providers.ts`)

| Proveedor | Cómo se conecta | ¿Local? |
|---|---|---|
| `ollama` | `@ai-sdk/openai-compatible` → `http://127.0.0.1:11434/v1` | Sí |
| `anthropic` | `@ai-sdk/anthropic` con clave de API | No |
| `openai` | `@ai-sdk/openai` con clave de API | No |
| `compatible` | `@ai-sdk/openai-compatible` con URL y clave opcional (LM Studio, OpenRouter, Groq, vLLM…) | Sí, si la URL es localhost o de red privada (`isLocalUrl`) |

Este es el **único** archivo que conoce proveedores concretos. El resto usa `AiService`:
- `stream({system, messages, onDelta, abortSignal})`: texto en streaming; los errores se traducen a
  español con `humanizeAiError`.
- `embedderFor(restricted)`: devuelve `null` si no hay modelo de embeddings, o si el contenido es
  confidencial y el embedder no es local.
- `assertChatAllowed(case)`: lanza `UserError` si un caso confidencial intenta usar un modelo en la nube.

**Contexto de modelos locales**: Ollama usa por defecto una ventana de contexto chica. Por eso en la
instalación se define `OLLAMA_CONTEXT_LENGTH` (ver `docs/INSTALACION.md`). Además la app limita el
contexto que envía (`contextBudget`: 24 000 caracteres en local, 150 000 en la nube; se puede
cambiar en Configuración).

## Prompts (`src/main/ai/prompts.ts`)

Todo el texto que recibe el modelo está aquí:
- `systemPrompt`: rol, perfil del abogado, jurisdicción, **reglas obligatorias** (no inventar,
  `[COMPLETAR: …]`, `[REVISAR: …]`, texto plano sin Markdown), reglas generales del despacho y
  reglas de la plantilla.
- `buildContext`: bloque `<caso>` (datos y descripción), `<documento_principal>` (texto completo de
  los documentos que se contestan) y `<fragmentos_relevantes>` numerados `[1]`, `[2]`… (RAG).
  Respeta el presupuesto de caracteres: 70 % para los documentos principales, el resto para fragmentos.
- `draftBriefing`: tipo de escrito, título, secciones e indicaciones del abogado.
- `fieldTask` / `freeformTask`: la tarea concreta de cada llamada.
- `CHAT_INSTRUCTIONS`: para "Preguntar sobre el caso" (citar fuentes con `[n]`).

Para mejorar la calidad, empieza por las reglas del `systemPrompt` y las instrucciones por sección
(`SECTION_HINTS` en `templates/fields.ts`, editables por el usuario en cada plantilla).

## Redacción por secciones (`services/drafting-service.ts`)

- Cada campo `ia` de la plantilla es una llamada independiente, en el orden del documento.
- Todas las llamadas comparten el mismo prefijo (`sharedContext`), marcado con
  `cacheControl: ephemeral` para Anthropic (caché de prompt) y reutilizable por la caché KV de Ollama.
- Cada llamada recibe las secciones ya redactadas (hasta 3000 caracteres cada una) para mantener
  la coherencia.
- La salida pasa por `stripMarkdown` (algunos modelos insisten en usar `**`).
- `regenerateField` rehace una sola sección con una indicación adicional.
- Los escritos libres (sin plantilla) se redactan en una sola llamada y se exportan con
  `docx-writer.ts` (Arial 12, interlineado 1.5, justificado; las líneas en MAYÚSCULAS se vuelven títulos).

## Búsqueda (`search/search-service.ts`)

Híbrida, siempre filtrada por caso (+ biblioteca):
1. **Por palabras**: FTS5 con `bm25`. `buildFtsQuery` pone cada palabra entre comillas (sin inyección
   de sintaxis), usa prefijo (`"demand"*` encuentra demanda/demandado), quita palabras vacías del
   español e ignora acentos.
2. **Semántica**: coseno entre el embedding de la pregunta y los vectores guardados del caso. Es
   fuerza bruta en JS, suficiente para miles de fragmentos por caso.
3. **Fusión RRF** (Reciprocal Rank Fusion, k=60): combina ambas listas sin comparar puntajes.

Si no hay embeddings (sin modelo, Ollama cerrado, caso confidencial con embedder en la nube), la
búsqueda funciona solo por palabras, sin errores.

## Embeddings

- Se calculan en segundo plano después de indexar (`Indexer.backfillEmbeddings`), en lotes de 32.
- Cada vector guarda `embedding_model = proveedor:modelo`; al cambiar de modelo se recalculan solos.
- Si el proveedor falla, se pausa 5 minutos (para que la interfaz no parezca siempre ocupada).
  "Probar búsqueda inteligente" en Configuración reinicia el intento.
- Modelo recomendado: `bge-m3` en Ollama (multilingüe). Los modelos solo en inglés funcionan peor
  con textos jurídicos en español.

## Modelos de redacción recomendados

- **Mejor calidad**: Claude (`claude-sonnet-5` o `claude-opus-5-5`) para casos no confidenciales.
- **Local (Ollama)**: el modelo más grande que quepa en la máquina, con buen español. Con 16 GB de
  RAM y sin GPU dedicada, un modelo de ~8–14B cuantizado; con GPU de 12 GB o más, uno de 14–32B.
  Los modelos chicos (≤ 4B) redactan mal textos jurídicos.
- Siempre verifica con **Configuración → Guardar y probar conexión**, que usa exactamente el mismo
  camino que la redacción real.

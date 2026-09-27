# Abogangster

Asistente local de redacción legal con IA para Windows. Organiza **casos** (cada uno con su índice
de documentos y su descripción), lee los documentos Word/PDF de cada cliente y redacta
**contestaciones y escritos dentro de las plantillas de Word del despacho**, para que el abogado
solo tenga que revisarlos.

- **Local**: los documentos se quedan en carpetas normales de la computadora; el índice es SQLite.
- **Cualquier modelo**: Ollama (sin internet), Claude, OpenAI o cualquier API compatible con OpenAI
  (LM Studio, OpenRouter…). Se elige en Configuración.
- **Confidencialidad**: por caso o global, *solo IA local*.
- **Siempre actualizado**: vigila las carpetas; si se agrega o cambia un documento, se reindexa solo.
- **No inventa**: marca con `[COMPLETAR: …]` lo que falta y la interfaz lo cuenta antes de exportar.

## Inicio rápido (desarrollo)

Requisitos: Node.js 22.12+ (recomendado 24 LTS).

```bash
npm ci
npm run dev       # abre la app con recarga en caliente
npm test          # pruebas (sin red ni IA)
npm run build:win # instalador de Windows en dist/ (ejecutar en Windows)
```

## Documentación

| Para… | Leer |
|---|---|
| Instalar en la computadora del abogado | [docs/INSTALACION.md](docs/INSTALACION.md) |
| Actualizar, respaldar, resolver problemas | [docs/MANTENIMIENTO.md](docs/MANTENIMIENTO.md) |
| Crear plantillas de Word | [docs/PLANTILLAS.md](docs/PLANTILLAS.md) |
| Enseñar a usarla (imprimible) | [docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md) |
| Entender el código (humanos e IA) | [CLAUDE.md](CLAUDE.md) → `docs/context/` |
| Historial de cambios | [CHANGELOG.md](CHANGELOG.md) |

## Stack

Electron 44 · TypeScript · React 19 · Tailwind 4 · `node:sqlite` (FTS5) · Vercel AI SDK ·
docxtemplater · mammoth · unpdf · chokidar · zod · vitest.

# Historial de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con
[SemVer](https://semver.org/lang/es/).

## [0.1.0] - 2026-09-26

Primera versión.

### Agregado
- Casos con datos, descripción, estado y marca de confidencial (solo IA local); cada caso tiene su
  carpeta (`Documentos`, `Escritos generados`) y su propio índice.
- Importación de archivos y carpetas completas (copia; los originales no se tocan), arrastrar y
  soltar, y vigilancia de carpetas con reindexado automático.
- Lectura de .docx, .pdf (con texto), .txt y .md; avisos claros para .doc, escaneos y archivos dañados.
- Búsqueda híbrida por palabras (FTS5, sin acentos) y por significado (embeddings), por caso y biblioteca.
- Biblioteca compartida del despacho.
- Plantillas .docx con `{{campos}}`: detección automática, campos que se llenan solos con datos del
  caso y del abogado, reglas e instrucciones por campo; dos plantillas de ejemplo.
- Redacción sección por sección con texto en vivo, regenerar una sección con indicaciones,
  guardado automático, conteo de `[COMPLETAR]`, exportación a Word en la carpeta del caso.
- Escrito libre sin plantilla.
- "Preguntar sobre el caso" con fuentes citadas.
- Proveedores de IA: Ollama, Anthropic (Claude), OpenAI y compatibles con OpenAI; prueba de conexión.
- Claves de API cifradas (DPAPI de Windows).
- Interfaz en español, letra ajustable, pensada para un usuario no técnico.
- Scripts `instalar.ps1` y `actualizar.ps1` (con respaldo de la base de datos).
- Modo de demostración y capturas automáticas para soporte remoto.

# Mantenimiento y soporte

## Actualizar a una versión nueva

En tu máquina: haces los cambios, corres `npm test`, subes la versión en `package.json`
(`npm version patch` / `minor`), anotas los cambios en `CHANGELOG.md` y haces push.

En la máquina del abogado (por AnyDesk):

```powershell
cd $HOME\Documents\abogangster-codigo
powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1
```

El script respalda la base de datos (guarda las últimas 10 en
`Documentos\Abogangster\.abogangster\respaldos\`), hace `git pull`, instala dependencias, corre las
pruebas (si fallan, **no** instala nada), construye el instalador, cierra la app, instala en modo
silencioso y la vuelve a abrir. Los documentos del abogado nunca se tocan.

## Dónde está cada cosa

| Qué | Ruta |
|---|---|
| Código (clon del repo) | `%USERPROFILE%\Documents\abogangster-codigo\` |
| App instalada | `%LOCALAPPDATA%\Programs\Abogangster\` |
| Espacio de trabajo (sus datos) | `%USERPROFILE%\Documents\Abogangster\` (se cambia en Configuración) |
| Base de datos | `<espacio>\.abogangster\abogangster.db` |
| Configuración y claves | `%APPDATA%\Abogangster\settings.json` |
| Registros | `%APPDATA%\Abogangster\logs\abogangster.log` (menú Ayuda → Abrir registros) |

## Respaldos

**Respaldar la carpeta `Documentos\Abogangster\` completa** (OneDrive, disco externo, etc.) respalda
casos, documentos, escritos, plantillas y base de datos. La configuración (`settings.json`) no va
ahí porque las claves están cifradas para ese usuario de Windows; si se pierde, basta con volver a
capturarla.

Para restaurar en otra computadora: copia la carpeta, instala la app y en Configuración →
Carpeta de trabajo → "Usar otra carpeta…".

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "No se pudo conectar con Ollama" | Ollama cerrado | Abrir Ollama desde el menú Inicio. Normalmente arranca con Windows; si no, poner un acceso directo de Ollama en la carpeta `shell:startup` |
| "El modelo X no está instalado" | Falta `ollama pull` | `ollama pull X` o elegir otro modelo en Configuración |
| La redacción es muy lenta | Modelo grande sin GPU | Usar un modelo más chico o Claude para casos no confidenciales |
| El escrito ignora partes del documento | Contexto de Ollama chico | Revisar `OLLAMA_CONTEXT_LENGTH` (INSTALACION §2) y el "Límite de contexto" |
| Sale "[COMPLETAR…]" en muchas partes | Faltan datos en el caso | Agregar la descripción del caso y los documentos que faltan; es el comportamiento esperado: la IA no inventa |
| Un documento dice "No se pudo leer" | PDF escaneado, archivo dañado o con contraseña | Conseguir el Word o un PDF con texto; o pasarlo por OCR |
| "Formato no compatible" en un .doc | Word antiguo | Abrir en Word → Guardar como → .docx |
| "La plantilla tiene campos mal escritos" | Llaves incompletas `{{campo` | Corregir en Word. Consejo: escribir el campo de una sola vez, sin cambiar el formato a la mitad |
| "El documento está abierto en Word" al crear el .docx | El archivo anterior está abierto | Cerrarlo en Word y repetir |
| La búsqueda no encuentra por significado | Embeddings desactivados o pausados | Configuración → "Guardar y probar búsqueda inteligente" |
| La app no abre | Ver el registro | `%APPDATA%\Abogangster\logs\abogangster.log` |

## Operaciones de soporte

- **Reindexar todo**: Configuración → *Volver a revisar documentos*. Si hace falta empezar de cero,
  cierra la app y borra `<espacio>\.abogangster\abogangster.db*`. **Ojo**: esto borra también las
  descripciones, los escritos en la app y el chat; los archivos .docx generados se conservan.
- **Probar sin tocar sus datos**: `ABOGANGSTER_DATA_DIR` crea un perfil aislado (ver INSTALACION).
- **Capturas de pantalla remotas**: `ABOGANGSTER_SCREENSHOTS=<carpeta>` abre cada pantalla, guarda
  un PNG y cierra; sirve para revisar la UI después de actualizar.
- **Herramientas de desarrollo**: menú Ayuda → Herramientas de desarrollo (consola del renderer).

## Desarrollo en tu máquina

```bash
npm ci
npm run dev        # recarga en caliente
npm test           # antes de cada push
npm run typecheck
```

En WSL/Linux las pruebas y el `build` funcionan; para abrir la ventana de Electron en WSL faltan
librerías gráficas (GTK), así que prueba la interfaz en Windows (`npm run dev` desde PowerShell) o
con el modo de capturas.

`npm install` puede mostrar avisos de *allow-scripts*: no afectan (esbuild y Electron traen sus
binarios por otros medios). Si una versión futura de npm bloquea los scripts de instalación y algo
falla, ejecuta `npm approve-scripts --allow-scripts-pending`.

# Instalación en la computadora del abogado (Windows 10/11)

Tiempo estimado: 30–60 minutos, casi todo en descargas. Todo se puede hacer por AnyDesk.

## 0. Requisitos de hardware

| | Mínimo | Recomendado para IA local |
|---|---|---|
| RAM | 8 GB | 16–32 GB |
| Disco libre | 5 GB | 30 GB (los modelos locales pesan de 5 a 20 GB) |
| GPU | No necesaria | NVIDIA con 8 GB de VRAM o más |

Sin GPU, los modelos locales funcionan pero son lentos: unos minutos por escrito. Si la máquina es
modesta, conviene usar Claude para los casos no confidenciales y Ollama solo para los confidenciales.

## 1. Instalar los programas base

1. **Git**: https://git-scm.com/download/win (opciones por defecto).
2. **Node.js LTS** (versión 22 o superior): https://nodejs.org (opciones por defecto).
3. **Ollama** (para IA local): https://ollama.com/download → instalador de Windows.

Cierra y vuelve a abrir PowerShell para que se reconozcan los comandos nuevos.

## 2. Preparar Ollama

En PowerShell:

```powershell
# Ventana de contexto más grande (por defecto Ollama usa una muy chica y corta los documentos)
setx OLLAMA_CONTEXT_LENGTH 16384

# Modelo de búsqueda inteligente (multilingüe)
ollama pull bge-m3

# Modelo de redacción: elige según el hardware (ver docs/context/ia-y-busqueda.md)
ollama pull <modelo>
```

Después de `setx`, **reinicia Ollama** (clic derecho en el icono de la llama junto al reloj → Quit,
y ábrelo otra vez desde el menú Inicio). Comprueba con `ollama list`.

> Si la máquina tiene poca RAM y el modelo falla por memoria, baja a `setx OLLAMA_CONTEXT_LENGTH 8192`
> y en Abogangster → Configuración → "Límite de contexto" pon `16000`.

## 3. Descargar e instalar Abogangster

```powershell
cd $HOME\Documents
git clone https://github.com/HJZR2004/abogangster.git abogangster-codigo
cd abogangster-codigo
powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
```

El script verifica los requisitos, instala dependencias (`npm ci`), corre las pruebas, construye el
instalador (`dist\Abogangster-<versión>-instalador.exe`) y lo abre. En el instalador: Siguiente →
Instalar. Se crea un acceso directo **Abogangster** en el escritorio.

> Si el repositorio es privado, primero inicia sesión en GitHub en esa máquina
> (`gh auth login` o un token personal), o clona con tu usuario.

## 4. Primera configuración (dentro de la app)

Abre Abogangster → **Configuración**:

1. **Sus datos**: nombre como aparece en los escritos, cédula, despacho, domicilio, ciudad y
   jurisdicción (p. ej. "México, Jalisco"). → *Guardar mis datos*.
2. **Reglas generales de redacción**: revísalas con el abogado; son las reglas que la IA sigue siempre.
3. **Inteligencia artificial**:
   - Proveedor *Ollama* → elige el modelo de la lista → **Guardar y probar conexión**
     (la primera vez puede tardar mientras el modelo se carga en memoria).
   - Opcional, *Claude*: proveedor *Claude (Anthropic)*, modelo `claude-sonnet-5`, pega la clave de
     API (https://console.anthropic.com) → Guardar y probar.
   - Búsqueda inteligente: *Ollama* + `bge-m3` → **Guardar y probar búsqueda inteligente**.
4. **Privacidad**: si el abogado prefiere que nada salga nunca de la computadora, activa
   *Usar solo IA local para todos los casos*.
5. **Tamaño de la letra**: ajústalo con él frente a la pantalla.

## 5. Adaptar las plantillas del despacho

La app crea dos plantillas de ejemplo en `Documentos\Abogangster\Plantillas\`. Lo importante es
convertir **sus formatos reales** en plantillas; ver [PLANTILLAS.md](PLANTILLAS.md). Se hace una
sola vez y es lo que más mejora el resultado.

## 6. Cargar sus documentos

- **Biblioteca**: leyes, códigos, jurisprudencia y escritos modelo que sirvan para todos los casos.
- **Casos**: *Nuevo caso* → datos + descripción → "Elegir carpeta" para copiar de una vez los
  documentos que ya tiene de ese cliente.

Los .doc antiguos no se pueden leer: la app los marca y dice cómo convertirlos a .docx
(Word → Guardar como → Documento de Word).

## 7. Enseñarle el flujo (10 minutos)

Usa [GUIA-DE-USO.md](GUIA-DE-USO.md); puedes imprimirla. El flujo es:
**Nuevo escrito → elegir caso → marcar el documento a contestar → tipo de escrito → Redactar →
revisar los [COMPLETAR] → Crear documento de Word → Abrir en Word.**

## Datos de demostración (opcional, para practicar)

Para mostrarle cómo se ve sin tocar sus datos reales:

```powershell
$env:ABOGANGSTER_DATA_DIR = "$env:TEMP\abogangster-demo"; $env:ABOGANGSTER_DEMO = '1'
& "$env:LOCALAPPDATA\Programs\Abogangster\Abogangster.exe"
```

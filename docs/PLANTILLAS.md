# Cómo crear plantillas

Una plantilla es un **documento de Word normal** con el formato del despacho (márgenes, tipografía,
encabezado, firma) en el que las partes que cambian se marcan con **campos entre llaves dobles**.
La IA escribe solo dentro de esos campos; todo lo demás queda exactamente como en el Word.

## Paso a paso

1. Abre en Word un escrito real que sirva de modelo (por ejemplo, una contestación ya presentada).
2. *Guardar como* → con un nombre claro, p. ej. `Contestación de demanda civil.docx`.
3. Borra lo que cambia de un caso a otro y en su lugar escribe un campo:

   ```
   EXPEDIENTE: {{expediente}}
   {{juzgado}}
   P R E S E N T E.

   {{proemio}}

   CONTESTACIÓN A LOS HECHOS
   {{contestacion_hechos}}
   ...
   ```
4. En Abogangster → **Plantillas** → *Agregar plantilla de Word* (o copia el archivo a la carpeta
   `Plantillas`). Los campos se detectan solos.
5. Abre la plantilla en la app y, para cada campo:
   - **¿Quién lo llena?** *La IA lo redacta* o *Dato fijo*.
   - **¿Qué debe contener?**: instrucciones concretas para la IA, p. ej. "Contestar cada hecho en
     el mismo orden, diciendo si es cierto, falso o no es propio."
6. Escribe las **reglas del escrito** (una por línea), p. ej. "Citar artículos solo del Código de
   Procedimientos Civiles del Estado".

## Reglas para escribir los campos

- Nombre en minúsculas, sin espacios: `{{contestacion_hechos}}`, `{{pruebas}}`.
- **Escribe cada campo de una sola vez** y sin cambiar el formato a la mitad (no pongas en negrita
  solo una parte del nombre). Si Word parte el campo por dentro, la app avisa con "campos mal escritos".
- El formato del campo (negrita, tamaño, sangría) es el que tendrá el texto de la IA.
- Un campo puede repetirse; se llena igual en todos los lugares.
- Los saltos de línea que escribe la IA se respetan dentro del mismo párrafo del campo.

## Campos que se llenan solos

Toman los datos del caso y de **Configuración → Sus datos**:

| Campo | Valor |
|---|---|
| `{{expediente}}` / `{{numero_expediente}}` | Número de expediente del caso |
| `{{juzgado}}` / `{{autoridad}}` | Juzgado o autoridad |
| `{{cliente}}` / `{{nombre_cliente}}` | Cliente |
| `{{contraparte}}` | Contraparte |
| `{{asunto}}` | Nombre del caso |
| `{{fecha}}` | Fecha de hoy ("26 de septiembre de 2026") |
| `{{ciudad}}` | Ciudad |
| `{{abogado}}` / `{{abogado_nombre}}` | Nombre del abogado |
| `{{cedula}}` / `{{cedula_profesional}}` | Cédula profesional |
| `{{despacho}}` | Nombre del despacho |
| `{{domicilio}}` / `{{domicilio_despacho}}` | Domicilio para notificaciones |
| `{{telefono}}`, `{{correo}}` | Teléfono y correo |

(Lista en el código: `AUTO_FIELDS` en `src/main/templates/fields.ts`.)

## Campos con instrucciones sugeridas

Si usas estos nombres, la app ya propone una instrucción adecuada (se puede editar):
`proemio`, `antecedentes`, `hechos`, `contestacion_hechos`, `excepciones`, `defensas`, `pruebas`,
`derecho`, `fundamentos_derecho`, `agravios`, `conceptos_violacion`, `alegatos`, `cuerpo`,
`puntos_petitorios`, `petitorios`.

## Consejos para mejores resultados

- Una plantilla por tipo de escrito (contestación civil, contestación mercantil, amparo, alegatos…).
- Secciones cortas y específicas funcionan mejor que un solo campo gigante.
- Pon en la **biblioteca** escritos anteriores bien hechos del mismo tipo: la IA los consulta como
  referencia de estilo y argumentos.
- Si una sección sale mal de forma repetida, mejora su "¿Qué debe contener?" en lugar de corregir a
  mano cada vez.

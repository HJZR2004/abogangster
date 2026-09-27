import { z } from 'zod'

/**
 * Runtime validation of everything that crosses the IPC boundary.
 * The renderer is treated as untrusted input, as a web page would be.
 */

export const id = z.string().min(1).max(100)
export const nullableId = id.nullable()
export const shortText = z.string().max(500)
export const longText = z.string().max(200_000)
export const pathString = z.string().min(1).max(2000)
export const pathList = z.array(pathString).max(5000)
export const question = z.string().trim().min(1, 'Escriba una pregunta.').max(20_000)

export const caseInput = z.object({
  title: z.string().trim().min(1, 'El caso necesita un nombre.').max(200),
  clientName: shortText,
  caseNumber: shortText,
  court: shortText,
  counterparty: shortText,
  description: z.string().max(20_000),
  status: z.enum(['activo', 'en_espera', 'cerrado']),
  localOnly: z.boolean()
})

export const templateUpdate = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  rules: z.string().max(20_000),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        label: z.string().max(200),
        mode: z.enum(['ia', 'manual']),
        instruction: z.string().max(5000)
      })
    )
    .max(200)
})

export const draftInput = z.object({
  caseId: id,
  templateId: nullableId,
  title: z.string().max(200),
  instructions: z.string().max(20_000),
  sourceDocumentIds: z.array(id).max(50)
})

export const draftPatch = z.object({
  title: z.string().max(200).optional(),
  instructions: z.string().max(20_000).optional(),
  fieldValues: z.record(z.string(), longText).optional(),
  body: longText.optional()
})

const profile = z.object({
  nombre: shortText,
  cedula: shortText,
  despacho: shortText,
  domicilio: shortText,
  telefono: shortText,
  correo: shortText,
  ciudad: shortText,
  jurisdiccion: shortText
})

const secret = z.string().max(500).nullable().optional()

export const settingsUpdate = z.object({
  chat: z.object({ provider: z.enum(['ollama', 'anthropic', 'openai', 'compatible']), model: shortText }).optional(),
  embedding: z.object({ provider: z.enum(['ninguno', 'ollama', 'openai', 'compatible']), model: shortText }).optional(),
  ollama: z.object({ baseUrl: z.string().url('La dirección de Ollama no es válida.') }).optional(),
  compatible: z.object({ baseUrl: z.union([z.literal(''), z.string().url('La dirección no es válida.')]) }).optional(),
  anthropicApiKey: secret,
  openaiApiKey: secret,
  compatibleApiKey: secret,
  contextChars: z.number().int().min(0).max(2_000_000).optional(),
  localOnlyGlobal: z.boolean().optional(),
  profile: profile.optional(),
  generalRules: z.string().max(20_000).optional(),
  fontSize: z.number().int().min(14).max(26).optional()
})

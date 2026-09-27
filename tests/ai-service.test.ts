import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AiService } from '../src/main/ai/ai-service'
import { AppContext } from '../src/main/app-context'
import { createSettings, tempDir } from './helpers'

/**
 * Minimal fake of Ollama's OpenAI-compatible API (/v1/chat/completions with SSE streaming
 * and /v1/embeddings). Exercises the real AI SDK code path end to end, offline.
 */
let server: Server
let baseUrl: string
const received: { path: string; body: Record<string, unknown> }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      received.push({ path: req.url ?? '', body })
      if (req.url === '/v1/chat/completions') {
        if (body['model'] === 'no-existe') {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'model "no-existe" not found, try pulling it first' } }))
          return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const chunk = (delta: object, finish: string | null = null) =>
          `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: body['model'], choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
        res.write(chunk({ role: 'assistant', content: 'Hola, ' }))
        res.write(chunk({ content: 'licenciado.' }))
        res.write(chunk({}, 'stop'))
        res.end('data: [DONE]\n\n')
        return
      }
      if (req.url === '/v1/embeddings') {
        const input = body['input'] as string[]
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            object: 'list',
            model: body['model'],
            data: input.map((_, index) => ({ object: 'embedding', index, embedding: [0.1, 0.2, 0.3] })),
            usage: { prompt_tokens: 1, total_tokens: 1 }
          })
        )
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

let cleanup = (): void => {}
afterEach(() => {
  cleanup()
  received.length = 0
})

function service(model = 'qwen-prueba') {
  const t = tempDir()
  cleanup = t.cleanup
  const settings = createSettings(t.dir)
  settings.update({
    chat: { provider: 'ollama', model },
    embedding: { provider: 'ollama', model: 'bge-m3' },
    ollama: { baseUrl }
  })
  return new AiService(settings)
}

describe('AiService against an Ollama-compatible server', () => {
  it('streams text deltas', async () => {
    const ai = service()
    const deltas: string[] = []
    const text = await ai.stream({ system: 'Sistema', messages: [{ role: 'user', content: 'Hola' }], onDelta: (d) => deltas.push(d) })
    expect(text).toBe('Hola, licenciado.')
    expect(deltas.join('')).toBe(text)
    const call = received.find((r) => r.path === '/v1/chat/completions')!
    expect(call.body['model']).toBe('qwen-prueba')
    expect(JSON.stringify(call.body['messages'])).toContain('Sistema')
  })

  it('computes embeddings', async () => {
    const ai = service()
    const embedder = ai.embedderFor(false)!
    expect(embedder.isLocal).toBe(true)
    expect(await embedder.embed(['a', 'b'])).toEqual([
      [0.1, 0.2, 0.3],
      [0.1, 0.2, 0.3]
    ])
  })

  it('reports a missing model with the install command', async () => {
    const ai = service('no-existe')
    await expect(ai.stream({ system: '', messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('ollama pull no-existe')
  })

  it('connection test succeeds and reports the answer', async () => {
    const result = await service().testChat()
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Hola, licenciado.')
  })

  it('drafts a full template document through the real pipeline', async () => {
    const t = tempDir()
    cleanup = t.cleanup
    const settings = createSettings(t.dir)
    settings.update({ chat: { provider: 'ollama', model: 'qwen-prueba' }, ollama: { baseUrl } })
    const ctx = new AppContext(settings, () => {})
    await ctx.start({ watch: false })
    try {
      const c = ctx.cases.create({ title: 'Caso', clientName: 'Ana', caseNumber: '1/2026', court: '', counterparty: '', description: 'Descripción X', status: 'activo', localOnly: true })
      const template = ctx.templates.list().find((x) => x.name.startsWith('Escrito simple'))!
      const draft = ctx.drafting.create({ caseId: c.id, templateId: template.id, title: 'Promoción', instructions: 'Pedir copias', sourceDocumentIds: [] })
      const done = await ctx.drafting.generate(draft.id)
      expect(done.status).toBe('listo')
      expect(done.fieldValues['cuerpo']).toBe('Hola, licenciado.')
      const chatCalls = received.filter((r) => r.path === '/v1/chat/completions')
      expect(chatCalls).toHaveLength(template.fields.filter((f) => f.mode === 'ia').length)
      expect(JSON.stringify(chatCalls[0]!.body['messages'])).toContain('Pedir copias')
      const exported = await ctx.drafting.export(draft.id)
      expect(exported.outputPath).toMatch(/Promoci/)
    } finally {
      await ctx.stop()
    }
  })

  it('reports Ollama being closed', async () => {
    const t = tempDir()
    cleanup = t.cleanup
    const settings = createSettings(t.dir)
    settings.update({ chat: { provider: 'ollama', model: 'x' }, ollama: { baseUrl: 'http://127.0.0.1:9' } })
    const result = await new AiService(settings).testChat()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Ollama/)
  })
})

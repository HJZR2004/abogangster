import type { ModelMessage } from 'ai'
import type { ChatMessage } from '@shared/types'
import type { AiService, TextStreamer } from '../ai/ai-service'
import { CHAT_INSTRUCTIONS, buildContext, systemPrompt } from '../ai/prompts'
import type { Repos } from '../db'
import { UserError } from '../errors'
import type { SearchService } from '../search/search-service'
import type { SettingsStore } from '../settings/settings-store'

export interface ChatServiceDeps {
  repos: Repos
  search: SearchService
  ai: AiService
  stream: TextStreamer
  settings: SettingsStore
  onDelta: (caseId: string, delta: string) => void
}

const HISTORY_MESSAGES = 8

/** "Preguntar sobre el caso": answers questions grounded in the case documents and the library. */
export class ChatService {
  private readonly running = new Map<string, AbortController>()

  constructor(private readonly deps: ChatServiceDeps) {}

  history(caseId: string): ChatMessage[] {
    return this.deps.repos.chat.history(caseId)
  }

  clear(caseId: string): void {
    this.deps.repos.chat.clear(caseId)
  }

  cancel(caseId: string): void {
    this.running.get(caseId)?.abort()
  }

  async ask(caseId: string, question: string): Promise<ChatMessage> {
    const { repos, ai, search, settings } = this.deps
    const caseRecord = repos.cases.get(caseId)
    if (!caseRecord) throw new UserError('El caso ya no existe.')
    if (this.running.has(caseId)) throw new UserError('Espere a que termine la respuesta anterior.')
    ai.assertChatAllowed(caseRecord)

    const controller = new AbortController()
    this.running.set(caseId, controller)
    try {
      const restricted = ai.isRestricted(caseRecord)
      const hits = await search.search(question, { caseId, includeLibrary: true, limit: 10 }, restricted)
      const { text: context, refs } = buildContext({ caseRecord, sources: [], excerpts: hits, budget: ai.contextBudget() })

      const history: ModelMessage[] = repos.chat
        .history(caseId, HISTORY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content }))

      const s = settings.get()
      const answer = await this.deps.stream({
        system: `${systemPrompt({ profile: s.profile, generalRules: s.generalRules })}\n\n${CHAT_INSTRUCTIONS}`,
        messages: [...history, { role: 'user', content: `${context}\n\nPregunta: ${question}` }],
        abortSignal: controller.signal,
        maxOutputTokens: 3000,
        onDelta: (delta) => this.deps.onDelta(caseId, delta)
      })

      repos.chat.add(caseId, 'user', question)
      return repos.chat.add(caseId, 'assistant', answer.trim(), refs)
    } finally {
      this.running.delete(caseId)
    }
  }
}

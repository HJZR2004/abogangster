import { useEffect, useRef, useState } from 'react'
import { MessageSquareText, Send, Square, Trash2 } from 'lucide-react'
import type { ChatMessage } from '@shared/types'
import { errorText, invoke, useEvent, useLoad } from '../lib/api'
import { useFeedback } from './feedback'
import { Button, EmptyState, Spinner, Textarea, cx } from './ui'

const EXAMPLES = ['¿Cuáles son los plazos importantes de este caso?', '¿Qué reclama la contraparte y con qué fundamento?', 'Haz un resumen cronológico de los hechos.']

function Bubble({ message }: { message: Pick<ChatMessage, 'role' | 'content' | 'sources'> }) {
  const mine = message.role === 'user'
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[85%] rounded-2xl px-5 py-4', mine ? 'bg-brand-600 text-white' : 'border border-line bg-surface')}>
        <p className={cx('whitespace-pre-wrap', !mine && 'document-text')}>{message.content}</p>
        {!mine && message.sources.length > 0 && (
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer font-semibold">Fuentes consultadas ({message.sources.length})</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">
              {message.sources.map((s, i) => (
                <li key={`${s.documentId}-${i}`}>
                  <span className="font-semibold text-ink">{s.fileName}</span>: {s.excerpt.slice(0, 200)}…
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  )
}

export function ChatPanel({ caseId }: { caseId: string }) {
  const feedback = useFeedback()
  const history = useLoad(() => invoke('chat:history', caseId), [caseId])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEvent('chat:delta', (e) => {
    if (e.caseId === caseId) setPending((p) => (p ? { ...p, answer: p.answer + e.delta } : p))
  })

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [history.data, pending?.answer])

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || pending) return
    setPending({ question: q, answer: '' })
    setQuestion('')
    try {
      await invoke('chat:ask', caseId, q)
      await history.reload()
    } catch (err) {
      feedback.error(errorText(err))
      setQuestion(q)
    } finally {
      setPending(null)
    }
  }

  const clear = async () => {
    const ok = await feedback.confirm({
      title: 'Borrar conversación',
      message: '¿Borrar todas las preguntas y respuestas de este caso? Los documentos no se modifican.',
      confirmLabel: 'Borrar conversación',
      danger: true
    })
    if (!ok) return
    await invoke('chat:clear', caseId)
    await history.reload()
  }

  const messages = history.data ?? []

  return (
    <div className="flex flex-col gap-5">
      {history.loading ? (
        <Spinner />
      ) : messages.length === 0 && !pending ? (
        <EmptyState icon={MessageSquareText} title="Pregunte lo que necesite sobre este caso">
          La respuesta se basa en los documentos del caso y de la biblioteca, e indica de dónde sacó cada dato.
          <div className="mt-4 flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => void ask(ex)} className="rounded-lg border border-line bg-surface px-4 py-2 text-left text-ink hover:border-brand-600 hover:bg-brand-50">
                {ex}
              </button>
            ))}
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {pending && (
            <>
              <Bubble message={{ role: 'user', content: pending.question, sources: [] }} />
              <Bubble message={{ role: 'assistant', content: pending.answer || 'Buscando en los documentos…', sources: [] }} />
            </>
          )}
          <div ref={bottom} />
        </div>
      )}

      <form
        className="sticky bottom-0 flex flex-col gap-3 rounded-xl border border-line bg-paper/95 p-4 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <Textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(question)
            }
          }}
          placeholder="Escriba su pregunta y presione Enter…"
          aria-label="Pregunta"
          disabled={pending !== null}
        />
        <div className="flex flex-wrap justify-between gap-3">
          {messages.length > 0 ? (
            <Button variant="ghost" icon={Trash2} onClick={() => void clear()} disabled={pending !== null}>
              Borrar conversación
            </Button>
          ) : (
            <span />
          )}
          {pending ? (
            <Button icon={Square} onClick={() => void invoke('chat:cancel', caseId)}>
              Detener
            </Button>
          ) : (
            <Button type="submit" variant="primary" icon={Send} disabled={!question.trim()}>
              Preguntar
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

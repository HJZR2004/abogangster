import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { Button, cx } from './ui'

/**
 * App-wide feedback: toasts (short confirmations/errors) and confirmation dialogs.
 * Every destructive action must go through `useConfirm`.
 */

interface Toast {
  id: number
  tone: 'ok' | 'bad'
  message: string
}

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
}

interface FeedbackApi {
  success: (message: string) => void
  error: (message: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider')
  return ctx
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className={cx('m-auto w-[92vw] rounded-2xl bg-surface p-0 text-ink shadow-2xl', wide ? 'max-w-4xl' : 'max-w-xl')}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
            <h2 id="modal-title" className="text-2xl font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-stone-100" aria-label="Cerrar">
              <X className="size-6" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const nextId = useRef(1)

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 9000 : 4500)
  }, [])

  // Stable identity: consumers put these functions in hook dependency lists.
  const api = useMemo<FeedbackApi>(
    () => ({
      success: (m) => push('ok', m),
      error: (m) => push('bad', m),
      confirm: (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve }))
    }),
    [push]
  )

  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Modal
        open={pending !== null}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-lg">{pending?.message}</div>
      </Modal>
      <div className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-[28rem] max-w-[90vw] flex-col gap-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg',
              t.tone === 'ok' ? 'border-ok-700/30 bg-ok-50 text-ok-700' : 'border-bad-700/30 bg-bad-50 text-bad-700'
            )}
            role={t.tone === 'bad' ? 'alert' : 'status'}
          >
            {t.tone === 'ok' ? <CheckCircle2 className="size-6 shrink-0" /> : <XCircle className="size-6 shrink-0" />}
            <p className="flex-1 font-semibold">{t.message}</p>
            <button type="button" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Cerrar aviso">
              <X className="size-5" />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

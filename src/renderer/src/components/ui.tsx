import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react'

/** Basic building blocks. Large targets (min 44px), visible labels, plain Spanish. */

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-brand-50 hover:border-brand-600',
  danger: 'bg-surface text-bad-700 border border-bad-700/40 hover:bg-bad-50',
  ghost: 'text-brand-700 hover:bg-brand-50'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'lg'
  icon?: LucideIcon
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'min-h-14 px-6 text-lg' : 'min-h-11 px-4',
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : Icon ? <Icon className="size-5 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-line bg-surface p-6 shadow-sm', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-lg text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  )
}

interface FieldProps {
  label: string
  hint?: string
  children: (id: string) => ReactNode
}

/** Label + control + optional hint, correctly associated for screen readers. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  )
}

const CONTROL = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, 'min-h-11', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'min-h-11', props.className)} />
}

/** Textarea that grows with its content. */
export function Textarea({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={ref} value={value} {...props} className={cx(CONTROL, 'resize-y', className)} />
}

export function Checkbox({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 accent-brand-600" />
      <label htmlFor={id} className="cursor-pointer">
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
    </div>
  )
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'brand'

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700',
  ok: 'bg-ok-50 text-ok-700',
  warn: 'bg-warn-50 text-warn-700',
  bad: 'bg-bad-50 text-bad-700',
  brand: 'bg-brand-50 text-brand-700'
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap', TONES[tone])}>{children}</span>
}

const ALERT_ICON: Record<Exclude<Tone, 'neutral' | 'brand'> | 'info', LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
  info: Info
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'ok' | 'warn' | 'bad' | 'info'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = ALERT_ICON[tone]
  const colors = tone === 'info' ? 'bg-brand-50 text-brand-800 border-brand-100' : cx(TONES[tone], 'border-current/20')
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-lg border p-4', colors)}>
      <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className="mt-0.5">{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-muted" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line px-6 py-12 text-center">
      <Icon className="size-12 text-brand-600/70" aria-hidden />
      <p className="text-xl font-semibold">{title}</p>
      {children && <div className="max-w-xl text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export interface TabItem<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  count?: number
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: TabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex flex-wrap gap-2 border-b border-line">
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={cx(
            '-mb-px flex min-h-12 items-center gap-2 border-b-4 px-4 font-semibold transition-colors',
            active === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'
          )}
        >
          <Icon className="size-5" aria-hidden />
          {label}
          {count !== undefined && <span className="rounded-full bg-stone-100 px-2 text-sm text-stone-700">{count}</span>}
        </button>
      ))}
    </div>
  )
}

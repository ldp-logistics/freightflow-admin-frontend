import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'brand'
}) {
  const styles: Record<string, string> = {
    primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
    brand: 'bg-[var(--brand)] text-white hover:opacity-90',
    secondary:
      'bg-white border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--elevate)]',
    danger: 'bg-[var(--danger)] text-white hover:opacity-90',
    ghost: 'bg-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--elevate)]',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-[var(--radius)] border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10 ${className}`}
        {...props}
      />
    )
  },
)

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-[var(--radius)] border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-[var(--radius)] border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10 ${className}`}
      {...props}
    />
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
    >
      {children}
    </label>
  )
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function PageHeader({
  eyebrow = 'FreightFlow',
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="ldp-eyebrow mb-0">{eyebrow}</p>
        <h2 className="ldp-page-title">{title}</h2>
        {description ? <p className="ldp-page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children,
  className = '',
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`ldp-card overflow-hidden ${className}`}>
      {title ? (
        <div className="border-b border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight text-[var(--ink)]">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  footer,
  wide = false,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-[var(--ink)]/40" aria-label="Close" onClick={onClose} />
      <div
        className={`relative z-10 max-h-[92vh] w-full overflow-auto rounded-t-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-md)] sm:rounded-[var(--radius)] ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--line)] bg-white px-5 py-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  id?: string
}) {
  const cid = id || label.replace(/\s+/g, '-').toLowerCase()
  return (
    <label htmlFor={cid} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ink)]">
      <input
        id={cid}
        type="checkbox"
        className="h-4 w-4 rounded border-[var(--line)] accent-[var(--brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]">
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-[var(--line)] px-3 py-3 align-middle ${className}`}>{children}</td>
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'
}) {
  const tones = {
    neutral: 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)]',
    brand: 'bg-[var(--brand-soft)] text-[var(--brand)]',
    ok: 'bg-emerald-50 text-[var(--ok)]',
    warn: 'bg-amber-50 text-[var(--warn)]',
    danger: 'bg-red-50 text-[var(--danger)]',
  }
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)]/50 px-6 py-12 text-center sm:py-14">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
        <span className="text-lg font-bold" aria-hidden>
          ·
        </span>
      </div>
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted)]">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--brand)]/25 bg-[var(--brand-soft)] px-3 py-2.5 text-sm text-[var(--brand)]">
      {message}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="ldp-card flex items-center gap-3 px-4 py-6 text-sm text-[var(--muted)]">
      <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--brand)]/40" />
      {label}
    </div>
  )
}

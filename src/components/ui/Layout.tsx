import { AlertTriangle, ChevronRight, FlaskConical, Info, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/** The large title of a screen. One per page; everything else is smaller. */
export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[34px] font-normal leading-[40px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[50px]">{title}</h1>
        {eyebrow && <div className="mt-1 text-sm font-medium text-copper-700">{eyebrow}</div>}
        {description && <p className="mt-2 max-w-3xl text-base text-muted md:text-[17px] md:leading-[26px]">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A grouped surface: white on the canvas, generous padding, no outline. */
export function Section({
  title, description, actions, children, className, id, tone,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'plain' | 'flush';
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn('card', className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between md:px-6 md:pt-6">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-h` : undefined} className="font-display text-[22px] font-normal leading-[28px] tracking-[-0.01em] text-ink">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={tone === 'flush' ? 'px-2 pb-2 pt-2 md:px-3 md:pb-3' : 'p-5 md:p-6'}>{children}</div>
    </section>
  );
}

/** A table's white tile. Cells carry their own inset, so the tile adds only what lines text up with section titles. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card p-2 md:p-3', className)}>{children}</div>;
}

/** One number that matters, large, with what it counts. Links show a chevron, like any row you can open. */
export function Stat({
  label, value, hint, href, tone = 'neutral',
}: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: 'neutral' | 'amber' | 'red' | 'green' }) {
  const accent = { neutral: 'text-ink', amber: 'text-amber-700', red: 'text-critical-700', green: 'text-approved-700' }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted">{label}</span>
        {href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />}
      </div>
      <div className={cn('mt-3 text-[34px] font-semibold leading-none tracking-[-0.022em]', accent)}>{value}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = 'card group block p-5';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-transform duration-200 ease-out active:scale-[0.98]')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KeyValue({
  items, columns = 2,
}: { items: { label: string; value: ReactNode; hint?: string }[]; columns?: 1 | 2 | 3 }) {
  const grid = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid gap-x-8 gap-y-5', grid)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{i.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">
            {i.value}
            {i.hint && <span className="mt-1 block text-xs text-muted">{i.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type NoticeTone = 'info' | 'warn' | 'danger' | 'synthetic';
export function Notice({
  tone = 'info', title, children, className,
}: { tone?: NoticeTone; title?: string; children?: ReactNode; className?: string }) {
  const Icon = { info: Info, warn: AlertTriangle, danger: ShieldAlert, synthetic: FlaskConical }[tone];
  const style = { info: 'bg-teal-50', warn: 'bg-amber-50', danger: 'bg-critical-50', synthetic: 'bg-amber-50' }[tone];
  const iconStyle = { info: 'text-teal-800', warn: 'text-amber-700', danger: 'text-critical-700', synthetic: 'text-amber-700' }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg px-4 py-3.5 text-sm', style, className)}>
      <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', iconStyle)} aria-hidden />
      <div className="min-w-0 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1">
            {it.href ? (
              <Link href={it.href} className="rounded-md text-copper-700 hover:underline hover:underline-offset-4">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {it.label}
              </span>
            )}
            {i < items.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

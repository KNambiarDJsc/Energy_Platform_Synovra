import { AlertTriangle, FlaskConical, Info, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold leading-tight text-navy md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted md:text-base">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

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
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div>
            {title && (
              <h2 id={id ? `${id}-h` : undefined} className="text-base font-semibold text-navy">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={tone === 'flush' ? '' : 'p-4 md:p-5'}>{children}</div>
    </section>
  );
}

export function Stat({
  label, value, hint, href, tone = 'neutral',
}: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: 'neutral' | 'amber' | 'red' | 'green' }) {
  const accent = { neutral: 'text-navy', amber: 'text-amber-700', red: 'text-critical-700', green: 'text-approved-700' }[tone];
  const body = (
    <>
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className={cn('mt-1 text-3xl font-semibold leading-none', accent)}>{value}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = 'card block p-4';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:border-teal')}>
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
    <dl className={cn('grid gap-x-8 gap-y-4', grid)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">
            {i.value}
            {i.hint && <span className="mt-0.5 block text-xs text-muted">{i.hint}</span>}
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
  const style = {
    info: 'border-teal-100 bg-teal-50',
    warn: 'border-[#E8D6A8] bg-amber-50',
    danger: 'border-[#EBC4C4] bg-critical-50',
    synthetic: 'border-[#E8D6A8] bg-amber-50',
  }[tone];
  const iconStyle = { info: 'text-teal-800', warn: 'text-amber-700', danger: 'text-critical-700', synthetic: 'text-amber-700' }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-md border p-3 text-sm', style, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconStyle)} aria-hidden />
      <div className="min-w-0 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1.5">
            {it.href ? (
              <Link href={it.href} className="hover:text-ink hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {it.label}
              </span>
            )}
            {i < items.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

'use client';
import { AlertTriangle, Inbox, Lock, SearchX } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { errorMessage } from '@/lib/hooks';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-[#DCE6EB]', className)} />;
}

export function LoadingBlock({ label = 'Loading', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3" data-testid="loading">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn('h-10', i === 0 && 'h-12 w-2/3')} />
      ))}
    </div>
  );
}

export function EmptyState({
  title, description, action, icon: Icon = Inbox,
}: { title: string; description?: ReactNode; action?: ReactNode; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-[#9FB2BD] bg-white px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-muted" aria-hidden />
      <h3 className="mt-3 text-base font-semibold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoResults({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No records match these filters"
      description="Try removing a filter or widening the search. Records outside your role or site scope are never listed."
      action={onClear ? <Button variant="secondary" onClick={onClear}>Clear filters</Button> : undefined}
    />
  );
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const code = (error as { code?: string } | null)?.code;
  const forbidden = code === 'FORBIDDEN';
  const missing = code === 'NOT_FOUND';
  const Icon = forbidden ? Lock : AlertTriangle;
  const heading =
    title ?? (forbidden ? 'Your role cannot open this' : missing ? 'Record not found' : 'This could not be loaded');
  return (
    <div role="alert" className="rounded-lg border border-[#EBC4C4] bg-critical-50 p-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-critical-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-critical-700">{heading}</h3>
          <p className="mt-1 text-sm text-ink">{errorMessage(error)}</p>
          {forbidden && (
            <p className="mt-1 text-sm text-muted">
              Permissions are enforced by the service layer for the signed-in demo role. Switch role from the top bar to see what each role can do.
            </p>
          )}
          {onRetry && !forbidden && (
            <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One place that decides loading / error / empty / data so every screen behaves the same. */
export function QueryView<T>({
  query, children, isEmpty, empty, skeleton,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
}) {
  if (query.isLoading || (query.isFetching && query.data === undefined && !query.isError)) {
    return <>{skeleton ?? <LoadingBlock />}</>;
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return <>{skeleton ?? <LoadingBlock />}</>;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>;
  return <>{children(query.data)}</>;
}

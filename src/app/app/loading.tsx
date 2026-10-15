import { Spinner } from '@/components/ui/States';

/** Shown instantly while a route segment loads, so a sidebar click always gives immediate feedback. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-muted">
      <Spinner />
      <span>Opening…</span>
    </div>
  );
}

'use client';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Enables click-to-sort. Return null for unknown so it always sorts last. */
  sort?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  className?: string;
  /** Mobile card handling: `title` becomes the card heading, `hide` omits the field. */
  mobile?: 'title' | 'hide' | 'show';
  /** Hides the column in the desktop table below this breakpoint. It stays in mobile cards. */
  hideBelow?: 'lg' | 'xl' | '2xl';
}

const HIDE_CLASS = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' } as const;

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  rowHref?: (row: T) => string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Rendered inside each mobile card below the fields (e.g. actions). */
  mobileFooter?: (row: T) => ReactNode;
}

/**
 * Sortable, paginated table on desktop; stacked cards under 768px so nothing needs horizontal scrolling.
 */
export function DataTable<T>({ columns, rows, rowKey, caption, rowHref, pageSize = 20, initialSort, mobileFooter }: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'en', { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0];

  function toggle(key: string) {
    setPage(0);
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-canvas">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined;
                const Icon = active ? (sort!.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn('whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted', c.align === 'right' && 'text-right', c.hideBelow && HIDE_CLASS[c.hideBelow], c.className)}
                  >
                    {c.sort ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 rounded hover:text-ink">
                        {c.header}
                        <Icon className={cn('h-3 w-3', !active && 'opacity-50')} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line align-top last:border-0 hover:bg-[#F6FAFB]">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn('px-3 py-3', c.align === 'right' && 'text-right', c.hideBelow && HIDE_CLASS[c.hideBelow], c.className)}>
                    {rowHref && i === 0 ? (
                      <Link href={rowHref(row)} className="font-semibold text-teal-800 underline-offset-2 hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {visible.map((row) => {
          const title = titleCol.cell(row);
          return (
            <li key={rowKey(row)} className="rounded-lg border border-line bg-white p-3.5">
              <div className="text-base font-semibold text-navy">
                {rowHref ? (
                  <Link href={rowHref(row)} className="text-teal-800 underline underline-offset-2">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {columns
                  .filter((c) => c !== titleCol && c.mobile !== 'hide')
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.header}</dt>
                      <dd className="mt-0.5 break-words text-sm text-ink">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
              {mobileFooter && <div className="mt-3 border-t border-line pt-3">{mobileFooter(row)}</div>}
            </li>
          );
        })}
      </ul>

      {sorted.length > pageSize && (
        <nav aria-label="Pagination" className="no-print mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

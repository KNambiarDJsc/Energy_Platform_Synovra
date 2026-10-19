'use client';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { cn, formatDate, formatTime } from '@/lib/format';
import { useScrollFade } from '@/lib/useScrollFade';
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

/** A timestamp in a table: the date on one line that never breaks, the time beneath it. */
export function DateTimeCell({ iso, note }: { iso: string; note?: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      {formatDate(iso)}
      <span className="block text-xs text-muted">{formatTime(iso)}</span>
      {note}
    </span>
  );
}

const ROW = 'border-b border-line align-top transition-colors duration-150 last:border-0 hover:bg-canvas'; // taste-skill-ignore: rows of a real data table
const HIDE_CLASS = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' } as const;

/** Row selection, owned by the page so it can act on the chosen rows (export, bulk actions). */
export interface Selection<T> {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Names the row for assistive technology, e.g. "B-0007". */
  label: (row: T) => string;
}

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
  selection?: Selection<T>;
}

/** A checkbox with a 44px target around an 18px box. */
function Check({ checked, indeterminate, label, onChange }: { checked: boolean; indeterminate?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <label className="-m-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-fill">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; }}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] cursor-pointer accent-copper"
      />
    </label>
  );
}

/**
 * Sortable, paginated table on desktop; stacked cards under 768px so nothing needs horizontal scrolling.
 * Rows are separated by the lightest line the eye still reads; there are no boxes around cells.
 * With `rowHref` the whole row opens its record (the first cell stays a real link for keyboards and screen
 * readers). With `selection` each row gets a checkbox and the header selects the rows on this page.
 */
export function DataTable<T>({ columns, rows, rowKey, caption, rowHref, pageSize = 20, initialSort, mobileFooter, selection }: Props<T>) {
  const router = useRouter();
  // A table wider than its space fades at the edge that has more, so a cut-off column is never mistaken for the last one.
  const [scrollRef, scrollStyle] = useScrollFade<HTMLDivElement>();
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
  const sortable = columns.filter((c) => c.sort);

  function toggle(key: string) {
    setPage(0);
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  }

  const picked = (row: T) => !!selection?.selected.has(rowKey(row));
  const pagePicked = selection ? visible.filter(picked).length : 0;
  function pick(row: T, on: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (on) next.add(rowKey(row)); else next.delete(rowKey(row));
    selection.onChange(next);
  }
  function pickPage(on: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    visible.forEach((r) => (on ? next.add(rowKey(r)) : next.delete(rowKey(r))));
    selection.onChange(next);
  }

  /** A click anywhere on the row opens it, unless it landed on a control or the person was selecting text. */
  function openRow(e: MouseEvent<HTMLTableRowElement>, href: string) {
    if ((e.target as HTMLElement).closest('a, button, input, label, select, textarea')) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  }

  return (
    <div>
      {/* Desktop table */}
      <div ref={scrollRef} style={scrollStyle} className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              {selection && (
                <th scope="col" className="w-10 pb-2.5 pl-4 pr-1 pt-1">
                  <Check checked={visible.length > 0 && pagePicked === visible.length} indeterminate={pagePicked > 0} label="Select all rows on this page" onChange={pickPage} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : undefined;
                const Icon = active && sort!.dir === 'desc' ? ArrowDown : ArrowUp;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn('whitespace-nowrap px-3 pb-2.5 pt-1 text-[13px] font-medium text-muted', c.align === 'right' && 'text-right', c.hideBelow && HIDE_CLASS[c.hideBelow], c.className)}
                  >
                    {c.sort ? (
                      <button type="button" onClick={() => toggle(c.key)} className={cn('group inline-flex items-center gap-1 rounded-md transition-colors hover:text-ink', active && 'text-ink')}>
                        {c.header}
                        <Icon className={cn('h-3 w-3 transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50')} aria-hidden />
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
              <tr
                key={rowKey(row)}
                className={cn(ROW, rowHref && 'cursor-pointer focus-within:bg-canvas', picked(row) && 'bg-copper-50/60 hover:bg-copper-50')}
                data-selected={picked(row) || undefined}
                onClick={rowHref ? (e) => openRow(e, rowHref(row)) : undefined}
              >
                {selection && (
                  <td className="w-10 py-3.5 pl-4 pr-1">
                    <Check checked={picked(row)} label={`Select ${selection.label(row)}`} onChange={(on) => pick(row, on)} />
                  </td>
                )}
                {columns.map((c, i) => (
                  <td key={c.key} className={cn('px-3 py-3.5', c.align === 'right' && 'num text-right', c.hideBelow && HIDE_CLASS[c.hideBelow], c.className)}>
                    {rowHref && i === 0 ? (
                      <Link href={rowHref(row)} className="font-semibold text-copper-700 underline-offset-4 hover:underline">
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
      {sortable.length > 0 && (
        <label className="mb-3 flex items-center gap-2 px-1 text-sm text-muted md:hidden">
          Sort by
          <select
            className="input !min-h-[40px] flex-1 rounded-full border-transparent bg-fill py-1.5 pl-4 font-medium text-ink"
            value={sort ? `${sort.key}:${sort.dir}` : ''}
            onChange={(e) => {
              setPage(0);
              const [key, dir] = e.target.value.split(':');
              setSort(key ? { key, dir: dir as 'asc' | 'desc' } : null);
            }}
          >
            <option value="">Default order</option>
            {sortable.flatMap((c) => [
              <option key={`${c.key}:asc`} value={`${c.key}:asc`}>{c.header}, ascending</option>,
              <option key={`${c.key}:desc`} value={`${c.key}:desc`}>{c.header}, descending</option>,
            ])}
          </select>
        </label>
      )}
      <ul className="space-y-2.5 md:hidden" aria-label={caption}>
        {visible.map((row) => {
          const title = titleCol.cell(row);
          return (
            <li key={rowKey(row)} className={cn('rounded-lg p-4', picked(row) ? 'bg-copper-50' : 'bg-canvas')} data-selected={picked(row) || undefined}>
              <div className="flex items-start gap-3">
                {selection && (
                  <span className="mt-1 shrink-0">
                    <Check checked={picked(row)} label={`Select ${selection.label(row)}`} onChange={(on) => pick(row, on)} />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-[17px] font-semibold leading-6 text-ink">
                  {rowHref ? (
                    <Link href={rowHref(row)} className="flex items-center justify-between gap-2 text-copper-700">
                      <span className="min-w-0">{title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  ) : (
                    title
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {columns
                  .filter((c) => c !== titleCol && c.mobile !== 'hide')
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs font-medium text-muted">{c.header}</dt>
                      <dd className="mt-0.5 break-words text-sm text-ink">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
              {mobileFooter && <div className="mt-4">{mobileFooter(row)}</div>}
            </li>
          );
        })}
      </ul>

      {sorted.length > pageSize && (
        <nav aria-label="Pagination" className="no-print mt-5 flex items-center justify-between gap-3 text-sm text-muted">
          <span className="num">
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

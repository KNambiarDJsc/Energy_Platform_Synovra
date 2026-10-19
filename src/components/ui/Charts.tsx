'use client';
import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatDateTime, formatNumber } from '@/lib/format';

/** Chart chrome: recessive hairline grid, muted tick text, a baseline one step darker than the grid. */
const TABLE_ROW = 'border-t border-line'; // taste-skill-ignore: rows of a real data table
const GRID = '#E4E4E7';
const BASELINE = '#D4D4D8';
const TICK = { fontSize: 12, fill: '#6B6B70' };

interface LinePoint {
  t: string;
  [key: string]: string | number | null;
}

export interface LineSeries {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

function axisDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short' }).format(new Date(iso));
}

/** The key beside a legend label mirrors the mark: a short line for lines, a small square for bars. */
function Legend({ items, kind }: { items: { name: string; color: string; dashed?: boolean }[]; kind: 'line' | 'bar' }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-2" aria-hidden>
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-2">
          {kind === 'bar' ? (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          ) : (
            <svg width="16" height="4" aria-hidden>
              <line x1="1" y1="2" x2="15" y2="2" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dashed ? '3 3' : undefined} />
            </svg>
          )}
          {s.name}
        </li>
      ))}
    </ul>
  );
}

interface TipRow {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/** Value first and strong, series name second; rows keyed with a short stroke of the series colour. */
function ChartTooltip({ active, payload, label, unit, dateLabel }: { active?: boolean; payload?: TipRow[]; label?: string | number; unit?: string; dateLabel?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-md bg-white px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 text-muted">{dateLabel ? formatDateTime(String(label)) : label}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="num text-sm font-semibold text-ink">
              {p.value === null || p.value === undefined ? 'No reading' : `${formatNumber(Number(p.value), unit ? 2 : 0)}${unit ? ` ${unit}` : ''}`}
            </span>
            <span className="text-muted">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTableDisclosure({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md font-medium text-copper-700 hover:underline hover:underline-offset-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" aria-hidden />
        View chart data as a table
      </summary>
      {children}
    </details>
  );
}

/**
 * Time-series line chart. Gaps stay gaps (no interpolation across missing readings) and the
 * chart has a text alternative plus an expandable data table.
 */
export function TimeSeriesChart({
  points, series, unit, label, height = 240, referenceLine, summary,
}: {
  points: LinePoint[];
  series: LineSeries[];
  unit: string;
  label: string;
  height?: number;
  referenceLine?: { y: number; label: string };
  summary: string;
}) {
  const id = useId();
  const tableRows = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 24)) === 0).slice(-24);
  return (
    <figure>
      <figcaption className="sr-only" id={`${id}-cap`}>
        {label}. {summary}
      </figcaption>
      {series.length > 1 && <Legend items={series} kind="line" />}
      <div role="img" aria-labelledby={`${id}-cap`} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="t" tickFormatter={axisDate} tick={TICK} minTickGap={36} stroke={BASELINE} tickLine={false} />
            <YAxis tick={TICK} width={52} axisLine={false} tickLine={false} domain={['auto', 'auto']} unit={unit ? ` ${unit}` : ''} />
            <Tooltip cursor={{ stroke: BASELINE, strokeWidth: 1 }} content={<ChartTooltip unit={unit} dateLabel />} />
            {referenceLine && (
              <ReferenceLine y={referenceLine.y} stroke="#946718" strokeDasharray="4 4" label={{ value: referenceLine.label, fontSize: 12, fill: '#6F4C0F', position: 'insideTopRight' }} />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: '#FFFFFF', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTableDisclosure>
        <div className="mt-2 max-h-56 overflow-auto rounded-lg bg-canvas">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-canvas">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium text-muted">Time</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 font-medium text-muted">
                    {s.name} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.t} className={TABLE_ROW}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal">{formatDateTime(p.t)}</th>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5">
                      {p[s.key] === null || p[s.key] === undefined ? 'No reading' : formatNumber(Number(p[s.key]), 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataTableDisclosure>
    </figure>
  );
}

/** Grouped columns: at most 24px thick, 4px rounded tops, square at the baseline, 2px apart. */
export function SimpleBarChart({
  data, xKey, bars, label, height = 240, summary, xLabel,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  bars: { key: string; name: string; color: string }[];
  label: string;
  height?: number;
  summary: string;
  /** Header of the first column in the table view. */
  xLabel?: string;
}) {
  const id = useId();
  return (
    <figure>
      <figcaption className="sr-only" id={`${id}-cap`}>
        {label}. {summary}
      </figcaption>
      {bars.length > 1 && <Legend items={bars} kind="bar" />}
      <div role="img" aria-labelledby={`${id}-cap`} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={TICK} stroke={BASELINE} tickLine={false} />
            <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(118,118,128,0.08)' }} content={<ChartTooltip />} />
            {bars.map((b) => (
              <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableDisclosure>
        <div className="mt-2 max-h-56 overflow-auto rounded-lg bg-canvas">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 font-medium text-muted">{xLabel ?? xKey}</th>
                {bars.map((b) => (
                  <th key={b.key} scope="col" className="px-3 py-2 text-right font-medium text-muted">{b.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row[xKey])} className={TABLE_ROW}>
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-normal">{row[xKey]}</th>
                  {bars.map((b) => (
                    <td key={b.key} className="px-3 py-1.5 text-right">{row[b.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataTableDisclosure>
    </figure>
  );
}

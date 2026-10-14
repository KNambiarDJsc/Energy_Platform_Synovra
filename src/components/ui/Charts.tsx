'use client';
import { useId } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatDateTime, formatNumber } from '@/lib/format';

const AXIS = { fontSize: 12, fill: '#566B79' };

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
      <div role="img" aria-labelledby={`${id}-cap`} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#D3DEE4" vertical={false} />
            <XAxis dataKey="t" tickFormatter={axisDate} tick={AXIS} minTickGap={36} stroke="#9FB2BD" />
            <YAxis tick={AXIS} width={48} stroke="#9FB2BD" domain={['auto', 'auto']} unit={unit ? ` ${unit}` : ''} />
            <Tooltip
              labelFormatter={(v) => formatDateTime(String(v))}
              formatter={(v, name) => [v === null || v === undefined ? 'No reading' : `${formatNumber(Number(v), 2)} ${unit}`, name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #D3DEE4', fontSize: 12 }}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {referenceLine && (
              <ReferenceLine y={referenceLine.y} stroke="#946718" strokeDasharray="4 4" label={{ value: referenceLine.label, fontSize: 11, fill: '#6F4C0F', position: 'insideTopRight' }} />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-teal-800 underline underline-offset-2">View chart data as a table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-canvas">
              <tr>
                <th scope="col" className="px-2 py-1.5">Time</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1.5">
                    {s.name} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.t} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal">{formatDateTime(p.t)}</th>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1">
                      {p[s.key] === null || p[s.key] === undefined ? 'No reading' : formatNumber(Number(p[s.key]), 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function SimpleBarChart({
  data, xKey, bars, label, height = 240, summary,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  bars: { key: string; name: string; color: string }[];
  label: string;
  height?: number;
  summary: string;
}) {
  const id = useId();
  return (
    <figure>
      <figcaption className="sr-only" id={`${id}-cap`}>
        {label}. {summary}
      </figcaption>
      <div role="img" aria-labelledby={`${id}-cap`} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#D3DEE4" vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS} stroke="#9FB2BD" />
            <YAxis tick={AXIS} allowDecimals={false} stroke="#9FB2BD" />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #D3DEE4', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {bars.map((b) => (
              <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

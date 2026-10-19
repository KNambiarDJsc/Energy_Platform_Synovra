import { parseCsv } from './csv';

/**
 * A bench export profile says how one lab's tester or spreadsheet lays out a results file, so that file can be
 * read without anyone editing it first. It is plain data: delimiter, decimal mark, date order, which header
 * means which column, constants the file does not carry, and a unit scale for named columns.
 *
 * A profile only rewrites the file into Synovra's own column layout. Every row still goes through the same
 * checks afterwards (known battery, plausible values, required calibration, no duplicates). A profile never
 * guesses: a cell it cannot read is passed on unreadable, and the check quarantines the row.
 *
 * The profiles built in are layouts, not any manufacturer's format. Add the real one by writing a profile for
 * the actual export (see docs/architecture.md, "Pluggability").
 */
export const BENCH_COLUMN_NAMES = [
  'battery', 'test_kind', 'test_date', 'protocol', 'ocv_v', 'internal_resistance_mohm', 'temperature_c', 'capacity_ah',
  'load_current_a', 'cutoff_v', 'ambient_c', 'duration_h', 'instrument', 'calibration_ref', 'notes',
] as const;
export type BenchColumnName = (typeof BENCH_COLUMN_NAMES)[number];

const NUMERIC: BenchColumnName[] = ['ocv_v', 'internal_resistance_mohm', 'temperature_c', 'capacity_ah', 'load_current_a', 'cutoff_v', 'ambient_c', 'duration_h'];

export interface BenchProfile {
  id: string;
  name: string;
  description: string;
  delimiter: ',' | ';' | '\t';
  /** The mark the file uses inside numbers. With ',' a value that contains '.' is unreadable on purpose. */
  decimal: '.' | ',';
  /** iso = 2026-10-12, dmy = 12/10/2026 or 12-10-2026, mdy = 10/12/2026 */
  dateFormat: 'iso' | 'dmy' | 'mdy';
  /** Header texts (any case) that mean each column. A column not listed here is looked for by its own name. */
  columns: Partial<Record<BenchColumnName, string[]>>;
  /** Used only where the file has no such column or the cell is empty. Stated by whoever wrote the profile. */
  constants?: Partial<Record<BenchColumnName, string>>;
  /** Multiplies these numeric columns, for example 0.001 for a file exported in mAh. Reported in the preview. */
  scale?: Partial<Record<BenchColumnName, number>>;
}

export const STANDARD_BENCH_PROFILE: BenchProfile = {
  id: 'synovra', name: 'Synovra standard CSV', description: 'Comma-separated, decimal point, ISO dates, the column names Synovra uses.',
  delimiter: ',', decimal: '.', dateFormat: 'iso', columns: {},
};

/** A common European spreadsheet layout, as an example of what a profile can express. Not a manufacturer's format. */
export const EXAMPLE_EU_PROFILE: BenchProfile = {
  id: 'example-eu-sheet', name: 'Example: semicolon and decimal comma',
  description: 'Semicolon-separated, decimal comma, day-month-year dates, long header names. An example layout; copy it and edit it for the real export.',
  delimiter: ';', decimal: ',', dateFormat: 'dmy',
  columns: {
    battery: ['Battery', 'Battery label'], test_kind: ['Test type'], test_date: ['Date', 'Test date'], protocol: ['Protocol'],
    ocv_v: ['OCV (V)'], internal_resistance_mohm: ['IR (mOhm)'], temperature_c: ['Cell temp (C)'], capacity_ah: ['Capacity (Ah)'],
    load_current_a: ['Load (A)'], cutoff_v: ['Cut-off (V)'], ambient_c: ['Ambient (C)'], duration_h: ['Duration (h)'],
    instrument: ['Instrument'], calibration_ref: ['Calibration'], notes: ['Comment'],
  },
};

const registry = new Map<string, BenchProfile>([[STANDARD_BENCH_PROFILE.id, STANDARD_BENCH_PROFILE], [EXAMPLE_EU_PROFILE.id, EXAMPLE_EU_PROFILE]]);

export const benchProfiles = (): BenchProfile[] => [...registry.values()];
export const benchProfile = (id: string | undefined | null): BenchProfile | undefined => registry.get(id || STANDARD_BENCH_PROFILE.id);

/** Throws a plain-English error naming what is wrong, so a bad profile file fails at start-up, not mid-import. */
export function validateBenchProfile(raw: unknown): BenchProfile {
  const p = raw as Partial<BenchProfile> | null;
  const bad = (m: string): never => { throw new Error(`Bench profile ${p && typeof p === 'object' && p.id ? `"${p.id}" ` : ''}is invalid: ${m}`); };
  if (!p || typeof p !== 'object') return bad('it is not an object.');
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.id)) bad('id must be lower-case letters, digits and dashes.');
  if (typeof p.name !== 'string' || !p.name.trim()) bad('name is required.');
  if (!p.delimiter || ![',', ';', '\t'].includes(p.delimiter)) bad('delimiter must be a comma, a semicolon or a tab.');
  if (p.decimal !== '.' && p.decimal !== ',') bad('decimal must be "." or ",".');
  if (p.delimiter === ',' && p.decimal === ',') bad('a comma cannot be both the delimiter and the decimal mark.');
  if (!p.dateFormat || !['iso', 'dmy', 'mdy'].includes(p.dateFormat)) bad('dateFormat must be iso, dmy or mdy.');
  const known = new Set<string>(BENCH_COLUMN_NAMES);
  for (const key of [...Object.keys(p.columns ?? {}), ...Object.keys(p.constants ?? {}), ...Object.keys(p.scale ?? {})]) {
    if (!known.has(key)) bad(`"${key}" is not a bench column.`);
  }
  for (const [k, v] of Object.entries(p.scale ?? {})) {
    if (!NUMERIC.includes(k as BenchColumnName)) bad(`scale applies only to number columns, not "${k}".`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) bad(`scale for "${k}" must be a positive number.`);
  }
  return {
    id: p.id!, name: p.name!, description: p.description ?? '', delimiter: p.delimiter!, decimal: p.decimal!, dateFormat: p.dateFormat!,
    columns: p.columns ?? {}, constants: p.constants, scale: p.scale,
  };
}

export function registerBenchProfile(raw: unknown): BenchProfile {
  const p = validateBenchProfile(raw);
  if (p.id === STANDARD_BENCH_PROFILE.id) throw new Error('The standard profile cannot be replaced.');
  registry.set(p.id, p);
  return p;
}

function toIso(value: string, format: BenchProfile['dateFormat']): string {
  const v = value.trim();
  if (format === 'iso' || v === '') return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return v;
  const [day, month] = format === 'dmy' ? [m[1], m[2]] : [m[2], m[1]];
  const iso = `${m[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  // 31/02/2026 is not a date: leave the original so the check reports it instead of rolling it over.
  const back = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(back.getTime()) || back.toISOString().slice(0, 10) !== iso ? v : iso;
}

const quote = (cell: string) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

/** Rewrites a file laid out by `profile` into the standard CSV, and says what it changed. */
export function normalizeBenchText(text: string, profile: BenchProfile): { text: string; notes: string[] } {
  if (profile.id === STANDARD_BENCH_PROFILE.id) return { text, notes: [] };
  const { headers, rows } = parseCsv(text, profile.delimiter);
  const lower = headers.map((h) => h.trim().toLowerCase());
  const source = new Map<BenchColumnName, number>();
  for (const col of BENCH_COLUMN_NAMES) {
    const accepted = (profile.columns[col] ?? [col]).map((h) => h.toLowerCase());
    const at = lower.findIndex((h) => accepted.includes(h));
    if (at >= 0) source.set(col, at);
  }
  const notes: string[] = [];
  const dropped = headers.filter((_, i) => ![...source.values()].includes(i));
  if (dropped.length) notes.push(`Columns not used: ${dropped.join(', ')}.`);
  const usedConstants = new Set<BenchColumnName>();
  const scaled = new Map<BenchColumnName, number>();
  const outRows = rows.map((r) => BENCH_COLUMN_NAMES.map((col) => {
    const at = source.get(col);
    let cell = at === undefined ? '' : (r[at] ?? '').trim();
    if (cell === '' && profile.constants?.[col] !== undefined) { cell = profile.constants[col]!; usedConstants.add(col); }
    if (col === 'test_date') return toIso(cell, profile.dateFormat);
    if (NUMERIC.includes(col) && cell !== '') {
      if (profile.decimal === ',') cell = cell.includes('.') ? 'unreadable' : cell.replace(',', '.');
      const factor = profile.scale?.[col];
      if (factor !== undefined && Number.isFinite(Number(cell))) { cell = String(Math.round(Number(cell) * factor * 1e9) / 1e9); scaled.set(col, (scaled.get(col) ?? 0) + 1); }
    }
    return cell;
  }));
  for (const col of usedConstants) notes.push(`${col} is blank or absent in the file; the profile supplies "${profile.constants![col]}".`);
  for (const [col, f] of Object.entries(profile.scale ?? {})) notes.push(`${col} multiplied by ${f} as the profile declares (${scaled.get(col as BenchColumnName) ?? 0} values converted).`);
  const csv = [BENCH_COLUMN_NAMES.join(','), ...outRows.map((r) => r.map(quote).join(','))].join('\n');
  return { text: csv, notes };
}

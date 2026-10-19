import type { ImportFieldValue, ImportIssue, ImportTemplate } from './types';

/** Minimal RFC-4180 style CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string, delimiter: ',' | ';' | '\t' = ','): { headers: string[]; rows: string[][] } {
  const src = text.replace(/^﻿/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows };
}

export const CANONICAL_FIELDS = [
  'serial', 'manufacturer', 'model', 'voltage', 'capacity', 'manufactured', 'location', 'acquisition_cost', 'legacy_id',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export function mapHeaders(template: ImportTemplate, headers: string[]): Partial<Record<CanonicalField, number>> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const map: Partial<Record<CanonicalField, number>> = {};
  for (const field of CANONICAL_FIELDS) {
    const accepted = (template.columns[field] ?? []).map((c) => c.toLowerCase());
    const idx = lower.findIndex((h) => accepted.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

export interface NormalizedFields {
  fields: Record<string, ImportFieldValue>;
  issues: ImportIssue[];
}

function parseNumberWithUnit(raw: string, unit: RegExp, field: string, label: string, issues: ImportIssue[], allowedUnits: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const m = t.match(/^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z%]*)$/);
  if (!m) {
    issues.push({ severity: 'error', field, message: `${label} "${raw}" is not a number with a unit (${allowedUnits}).` });
    return null;
  }
  const unitText = m[2];
  if (unitText && !unit.test(unitText)) {
    issues.push({ severity: 'error', field, message: `${label} unit "${unitText}" is not accepted. Use ${allowedUnits}.` });
    return null;
  }
  return Number(m[1].replace(',', '.'));
}

export function parseDate(raw: string, now: Date): { iso: string | null; error?: string } {
  const t = raw.trim();
  if (!t) return { iso: null };
  let y: number, m: number, d: number;
  let match = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else return { iso: null, error: `Date "${raw}" is not recognised. Use YYYY-MM-DD or DD/MM/YYYY.` };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { iso: null, error: `Date "${raw}" does not exist.` };
  if (dt.getTime() > now.getTime()) return { iso: null, error: `Date "${raw}" is in the future.` };
  return { iso: dt.toISOString().slice(0, 10) };
}

/** Normalises one source row. Original values are always preserved beside the normalised value. */
export function normalizeRow(
  headers: string[], cells: string[], map: Partial<Record<CanonicalField, number>>, now: Date,
): NormalizedFields {
  const issues: ImportIssue[] = [];
  const get = (f: CanonicalField) => (map[f] === undefined ? '' : (cells[map[f]!] ?? '').trim());
  const fields: Record<string, ImportFieldValue> = {};
  const put = (f: string, original: string, normalized: string | number | null) => { fields[f] = { original, normalized }; };

  for (const f of CANONICAL_FIELDS) if (map[f] === undefined && ['manufacturer', 'model', 'voltage', 'capacity'].includes(f)) {
    issues.push({ severity: 'error', field: f, message: `Template column for "${f}" was not found in the file.` });
  }

  const serialRaw = get('serial');
  put('serial', serialRaw, serialRaw === '' ? null : serialRaw);
  if (serialRaw === '') issues.push({ severity: 'warning', field: 'serial', message: 'Manufacturer serial is missing. Identity will rely on the legacy ID.' });

  const manuf = get('manufacturer');
  put('manufacturer', manuf, manuf || null);
  if (!manuf) issues.push({ severity: 'error', field: 'manufacturer', message: 'Manufacturer is required.' });
  const model = get('model');
  put('model', model, model || null);
  if (!model) issues.push({ severity: 'error', field: 'model', message: 'Model is required.' });

  const vRaw = get('voltage');
  const v = parseNumberWithUnit(vRaw, /^v$/i, 'voltage', 'Rated voltage', issues, 'V');
  put('voltage', vRaw, v);
  if (vRaw === '' && map.voltage !== undefined) issues.push({ severity: 'error', field: 'voltage', message: 'Rated voltage is missing.' });
  if (v !== null && ![2, 6, 12].includes(v)) issues.push({ severity: 'warning', field: 'voltage', message: `Rated voltage ${v} V is unusual for a single unit (expected 2, 6 or 12 V).` });

  const cRaw = get('capacity');
  const c = parseNumberWithUnit(cRaw, /^ah$/i, 'capacity', 'Rated capacity', issues, 'Ah');
  put('capacity', cRaw, c);
  if (cRaw === '' && map.capacity !== undefined) issues.push({ severity: 'error', field: 'capacity', message: 'Rated capacity is missing.' });

  const dRaw = get('manufactured');
  const dt = parseDate(dRaw, now);
  put('manufactured', dRaw, dt.iso);
  if (dt.error) issues.push({ severity: 'error', field: 'manufactured', message: dt.error });
  else if (dRaw === '') issues.push({ severity: 'warning', field: 'manufactured', message: 'Manufacture date is missing and will be recorded as unknown.' });

  const loc = get('location');
  put('location', loc, loc || null);

  const costRaw = get('acquisition_cost');
  let cost: number | null = null;
  if (costRaw === '') {
    issues.push({ severity: 'warning', field: 'acquisition_cost', message: 'Acquisition cost is missing. It is recorded as unknown, not zero.' });
  } else {
    const m = costRaw.replace(/^aed\s*/i, '').replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(m)) issues.push({ severity: 'error', field: 'acquisition_cost', message: `Cost "${costRaw}" is not a valid AED amount.` });
    else cost = Number(m);
  }
  put('acquisition_cost', costRaw, cost);

  const legacy = get('legacy_id');
  put('legacy_id', legacy, legacy || null);

  return { fields, issues };
}

export const SAMPLE_CSV = `serial,manufacturer,model,rated_voltage,rated_capacity,manufacture_date,location,acquisition_cost_aed,legacy_id
AV200-25-410021,Arvento Power (fictional),AV-12-200 FT AGM,12V,200Ah,2024-03-18,Receiving bay,1150,LAB-2001
AV200-25-410022,Arvento Power (fictional),AV-12-200 FT AGM,12V,200Ah,2024-03-18,Receiving bay,1150,LAB-2002
AV200-25-410023,Arvento Power (fictional),AV-12-200 FT AGM,12V,200Ah,18/03/2024,Receiving bay,,LAB-2003
AV200 25 410021,Arvento Power (fictional),AV-12-200 FT AGM,12V,200Ah,2024-03-18,Receiving bay,1150,LAB-2004
HC150-25-220118,Halden Cells (fictional),HC-12-150 GEL,12V,150Ah,2024-05-02,Receiving bay,980,LAB-2005
,Kestrel Energy (fictional),KE-OPzS-600,2V,600Ah,2023-11-30,Receiving bay,,LAB-2006
KE600-318877,Kestrel Energy (fictional),KE-OPzS-600,2V,600 kWh,2023-11-30,Rack R4,1700,LAB-2007
AV200-25-410027,Arvento Power (fictional),AV-12-200 FT AGM,24V,200Ah,2031-02-30,Receiving bay,abc,LAB-2008
`;

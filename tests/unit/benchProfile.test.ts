import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_EU_PROFILE, STANDARD_BENCH_PROFILE, normalizeBenchText, registerBenchProfile, validateBenchProfile, type BenchProfile,
} from '@/domain/benchProfile';
import { parseCsv } from '@/domain/csv';
import { harness, USERS } from './helpers';

/** Re-lays the standard sample out the way the example European profile expects it. */
function asEuSheet(standard: string): string {
  const { headers, rows } = parseCsv(standard);
  const names = headers.map((h) => (EXAMPLE_EU_PROFILE.columns[h as keyof typeof EXAMPLE_EU_PROFILE.columns] ?? [h])[0]);
  const numeric = new Set(['ocv_v', 'internal_resistance_mohm', 'temperature_c', 'capacity_ah', 'load_current_a', 'cutoff_v', 'ambient_c', 'duration_h']);
  const body = rows.map((r) => r.map((cell, i) => {
    if (headers[i] === 'test_date') { const [y, m, d] = cell.split('-'); return `${d}/${m}/${y}`; }
    return numeric.has(headers[i]) ? cell.replace('.', ',') : cell;
  }).join(';'));
  return [names.join(';'), ...body].join('\n');
}

describe('bench export profiles', () => {
  it('reads a semicolon, decimal-comma, day-first sheet to the same result as the standard file', async () => {
    const h = harness(USERS.lab);
    const standard = h.svc.bench.sample();
    const a = await h.svc.bench.preview({ fileName: 'a.csv', text: standard });
    const b = await h.svc.bench.preview({ fileName: 'b.csv', text: asEuSheet(standard), profileId: EXAMPLE_EU_PROFILE.id });
    expect(b.profile.id).toBe(EXAMPLE_EU_PROFILE.id);
    expect(b.rows.map((r) => [r.rowNumber, r.batteryLabel, r.outcome, r.date, r.capacityAh])).toEqual(a.rows.map((r) => [r.rowNumber, r.batteryLabel, r.outcome, r.date, r.capacityAh]));
    expect(b.counts).toEqual(a.counts);
  });

  it('hashes the file as exported, so the same sheet is recognised as already committed', async () => {
    const h = harness(USERS.lab);
    const sheet = asEuSheet(h.svc.bench.sample());
    const first = await h.svc.bench.commit({ fileName: 'b.csv', text: sheet, profileId: EXAMPLE_EU_PROFILE.id });
    expect(first.created).toBeGreaterThan(0);
    const again = await h.svc.bench.preview({ fileName: 'b.csv', text: sheet, profileId: EXAMPLE_EU_PROFILE.id });
    expect(again.priorCommitAt).not.toBeNull();
    expect(again.counts.create).toBe(0);
  });

  it('refuses an unknown profile', async () => {
    const h = harness(USERS.lab);
    await expect(h.svc.bench.preview({ fileName: 'x.csv', text: h.svc.bench.sample(), profileId: 'nope' })).rejects.toThrow(/No export profile/);
  });

  it('does not guess a number it cannot read, and does not roll an impossible date over', () => {
    const text = 'Battery;Date;Capacity (Ah);Load (A)\nB-0001;31/02/2026;1.234;20,5\n';
    const { text: csv } = normalizeBenchText(text, EXAMPLE_EU_PROFILE);
    const row = parseCsv(csv).rows[0];
    const head = parseCsv(csv).headers;
    expect(row[head.indexOf('test_date')]).toBe('31/02/2026'); // left alone so the check reports it
    expect(row[head.indexOf('capacity_ah')]).toBe('unreadable'); // a "." in a decimal-comma file is ambiguous (1.234 or 1234)
    expect(row[head.indexOf('load_current_a')]).toBe('20.5');
  });

  it('applies a declared unit scale and a declared constant only where the file is blank, and says so', () => {
    const profile: BenchProfile = {
      ...STANDARD_BENCH_PROFILE, id: 'tester-x', name: 'Tester X', delimiter: ';', decimal: '.', dateFormat: 'iso',
      columns: { battery: ['Cell'], capacity_ah: ['Cap mAh'], instrument: ['Unit'] },
      constants: { calibration_ref: 'CAL-X-2026', instrument: 'Bench X' }, scale: { capacity_ah: 0.001 },
    };
    const { text, notes } = normalizeBenchText('Cell;Cap mAh;Unit\nB-0001;98500;\nB-0002;100000;Bench Y\n', profile);
    const { headers, rows } = parseCsv(text);
    expect(rows.map((r) => r[headers.indexOf('capacity_ah')])).toEqual(['98.5', '100']);
    expect(rows.map((r) => r[headers.indexOf('instrument')])).toEqual(['Bench X', 'Bench Y']);
    expect(rows.map((r) => r[headers.indexOf('calibration_ref')])).toEqual(['CAL-X-2026', 'CAL-X-2026']);
    expect(notes.join(' ')).toMatch(/capacity_ah multiplied by 0\.001.*2 values/);
    expect(notes.join(' ')).toMatch(/calibration_ref is blank or absent/);
  });

  it('rejects an invalid profile with a reason', () => {
    const base = { ...EXAMPLE_EU_PROFILE };
    expect(() => validateBenchProfile({ ...base, id: 'Bad Id' })).toThrow(/id must be/);
    expect(() => validateBenchProfile({ ...base, delimiter: ',', decimal: ',' })).toThrow(/cannot be both/);
    expect(() => validateBenchProfile({ ...base, columns: { nonsense: ['x'] } })).toThrow(/not a bench column/);
    expect(() => validateBenchProfile({ ...base, scale: { notes: 2 } })).toThrow(/number columns/);
    expect(() => validateBenchProfile({ ...base, scale: { capacity_ah: 0 } })).toThrow(/positive/);
    expect(() => registerBenchProfile({ ...base, id: 'synovra' })).toThrow(/standard profile/);
  });
});

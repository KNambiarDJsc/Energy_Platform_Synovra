/**
 * The synthetic battery the landing page demonstrates with. Values match the demo seed
 * (src/data/seed.ts: B-0002, 120 Ah before restoration, 174 Ah after, AV-12-200 FT family).
 * Nothing here is a real battery, customer or result.
 */
export const B0002 = {
  label: 'B-0002',
  model: 'AV-12-200 FT',
  spec: '12 V · 200 Ah AGM',
  ratedAh: 200,
  serial: 'AV200-25-10482',
  lookupRef: 'SYN-7Q4K-M2XD',
  protocol: 'C10 capacity discharge, rev B (placeholder)',
  instrument: 'Discharge bench DB-2 (demo)',
  calibration: 'CAL-DEMO-2026-03',
  initialAh: 120,
  finalAh: 174,
  thresholdPct: 85,
} as const;

export const pct = (ah: number) => Math.round((ah / B0002.ratedAh) * 100);

export type StageKey = 'intake' | 'test' | 'restore' | 'qualify';

export const STAGES: { key: StageKey; name: string; clause: string; proof: string }[] = [
  { key: 'intake', name: 'Intake', clause: 'First, one identity for life', proof: 'The identity never changes. A printed label and a QR reference only point to it.' },
  { key: 'test', name: 'Test', clause: 'Then, what was measured', proof: 'Every result carries its instrument, calibration, protocol revision and operator.' },
  { key: 'restore', name: 'Restore', clause: 'Then, the work and its cost', proof: 'Attempts stay on the same identity. A cost nobody entered stays unknown, never zero.' },
  { key: 'qualify', name: 'Qualify', clause: 'Last, a person decides', proof: 'The rule check informs. A battery engineer approves, with a written reason.' },
];

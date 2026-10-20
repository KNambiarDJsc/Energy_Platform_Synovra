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

/** The four stages the passport fills in through. `chip` is the lifecycle state the product shows after each. */
export const STAGES: { key: StageKey; name: string; chip: string; tone: 'neutral' | 'wait' | 'ok'; clause: string; proof: string }[] = [
  { key: 'intake', name: 'Intake', chip: 'Received', tone: 'neutral', clause: 'First, one identity for life', proof: 'The identity never changes. A printed label and a QR reference only point to it.' },
  { key: 'test', name: 'Test', chip: 'Restoration candidate', tone: 'wait', clause: 'Then, what was measured', proof: 'Every result carries its instrument, calibration, protocol revision and operator.' },
  { key: 'restore', name: 'Service', chip: 'In service work', tone: 'wait', clause: 'Then, the work, with its evidence', proof: 'Service stays on the same identity and shows as completed only once an engineer approves it. The method stays confidential.' },
  { key: 'qualify', name: 'Approve', chip: 'Approved', tone: 'ok', clause: 'Last, a person decides', proof: 'A rule shows what to look at. A battery engineer approves the test and the work, with a written reason.' },
];

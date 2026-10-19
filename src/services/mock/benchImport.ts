import { benchProfile, benchProfiles, normalizeBenchText } from '@/domain/benchProfile';
import { parseCsv } from '@/domain/csv';
import { ValidationError } from '@/domain/permissions';
import type { TestKind, TestSession } from '@/domain/types';
import { audit, authorize, canSeeBattery, db, hashText, latency, newEvidence, pushEvent, type Ctx } from '../core';
import type { BenchImportRepository, BenchRow } from '../types';

/**
 * Bench results by CSV: what a capacity tester or the lab's own spreadsheet exports. Every row is checked
 * against the battery it names. Good rows become tests submitted for an engineer's review, never approved
 * ones; doubtful rows are quarantined with the reason; nothing is converted or guessed.
 */
export const BENCH_COLUMNS = [
  'battery', 'test_kind', 'test_date', 'protocol', 'ocv_v', 'internal_resistance_mohm', 'temperature_c', 'capacity_ah',
  'load_current_a', 'cutoff_v', 'ambient_c', 'duration_h', 'instrument', 'calibration_ref', 'notes',
] as const;

export const BENCH_SAMPLE_CSV = `battery,test_kind,test_date,protocol,ocv_v,internal_resistance_mohm,temperature_c,capacity_ah,load_current_a,cutoff_v,ambient_c,duration_h,instrument,calibration_ref,notes
B-0001,initial,2026-10-12,proto_c10,12.61,4.6,25.1,126.5,20,10.8,25,6.3,Discharge bench DB-2,CAL-DEMO-2026-03,Intake capacity test
B-0041,initial,2026-10-12,proto_c10,12.48,5.1,24.8,112,20,10.8,25,5.6,Discharge bench DB-2,CAL-DEMO-2026-03,
B-0042,initial,2026-10-12,proto_c10,12.70,4.9,25.4,98500,15,10.8,25,6.5,Discharge bench DB-2,CAL-DEMO-2026-03,Exported in mAh by mistake
B-0030,final,2026-10-12,proto_c10,12.83,3.4,25.2,181.4,20,10.8,25,9.1,Discharge bench DB-2,CAL-DEMO-2026-03,After restoration
B-0043,initial,2026-10-12,proto_c10,2.11,0.6,25.0,402,60,1.8,25,6.7,Discharge bench DB-2,,No calibration reference on the sheet
B-0099,initial,2026-10-12,proto_c10,12.50,4.5,25.0,130,20,10.8,25,6.5,Discharge bench DB-2,CAL-DEMO-2026-03,Unknown battery
B-0001,initial,2026-10-12,proto_c10,12.61,4.6,25.1,126.5,20,10.8,25,6.3,Discharge bench DB-2,CAL-DEMO-2026-03,Same row twice
`;

const KINDS: TestKind[] = ['intake_inspection', 'initial', 'final', 'periodic'];

export function createBenchImport(ctx: Ctx): BenchImportRepository {
  function check(text: string, profileId?: string): { hash: string; rows: BenchRow[]; profile: { id: string; name: string }; conversions: string[] } {
    const d = db(ctx);
    const profile = benchProfile(profileId);
    if (!profile) throw new ValidationError(`No export profile "${profileId}" is installed.`);
    // The hash is of the file as exported; the checks below read it in Synovra's layout.
    const converted = normalizeBenchText(text, profile);
    const { headers, rows } = parseCsv(converted.text);
    const col = (name: string) => headers.findIndex((h) => h.trim().toLowerCase() === name);
    const missingCols = ['battery', 'test_kind', 'test_date', 'protocol', 'capacity_ah', 'instrument', 'calibration_ref'].filter((c) => col(c) < 0);
    if (missingCols.length) throw new ValidationError('The file is missing required columns', missingCols.map((c) => `Column "${c}" not found`));
    const get = (r: string[], name: string) => { const i = col(name); return i < 0 ? '' : (r[i] ?? '').trim(); };
    const num = (r: string[], name: string) => { const v = get(r, name); if (v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : NaN; };
    const seen = new Set<string>();
    const out: BenchRow[] = [];
    rows.forEach((r, i) => {
      const issues: string[] = [];
      const label = get(r, 'battery').toUpperCase();
      const b = d.batteries.find((x) => x.label.toUpperCase() === label && canSeeBattery(ctx, x));
      const fam = b ? d.families.find((f) => f.id === b.familyId) ?? null : null;
      const kind = get(r, 'test_kind') as TestKind;
      const date = get(r, 'test_date');
      const values = {
        ocv: num(r, 'ocv_v'), ir: num(r, 'internal_resistance_mohm'), temp: num(r, 'temperature_c'), capacity: num(r, 'capacity_ah'),
        load: num(r, 'load_current_a'), cutoff: num(r, 'cutoff_v'), ambient: num(r, 'ambient_c'), duration: num(r, 'duration_h'),
      };
      if (!b) issues.push('No battery with this label, or not one you can see.');
      if (!KINDS.includes(kind)) issues.push(`Test kind "${get(r, 'test_kind')}" is not one of ${KINDS.join(', ')}.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) issues.push('Test date must be YYYY-MM-DD.');
      else if (Date.parse(date) > Date.parse(ctx.store.now())) issues.push('Test date is in the future.');
      if (!d.protocols.some((p) => p.id === get(r, 'protocol'))) issues.push(`Protocol "${get(r, 'protocol')}" is not on file.`);
      Object.entries(values).forEach(([k, v]) => { if (Number.isNaN(v as number)) issues.push(`${k} is not a number.`); });
      if (!get(r, 'instrument') || !get(r, 'calibration_ref')) issues.push('Instrument and calibration reference are both required.');
      if (fam && values.capacity !== null && !Number.isNaN(values.capacity) && values.capacity > fam.ratedCapacityAh * 1.3) {
        issues.push(`Capacity ${values.capacity} Ah is more than 130% of rated ${fam.ratedCapacityAh} Ah. Check the unit (mAh?). Not converted.`);
      }
      if (fam && values.ocv !== null && !Number.isNaN(values.ocv) && (values.ocv < fam.ratedVoltageV * 0.5 || values.ocv > fam.ratedVoltageV * 1.4)) {
        issues.push(`Open-circuit voltage ${values.ocv} V is implausible for a ${fam.ratedVoltageV} V ${fam.unitType}. Check the unit.`);
      }
      if (values.capacity !== null && (values.load === null || values.cutoff === null || values.ambient === null)) {
        issues.push('A capacity result needs load current, cut-off voltage and ambient temperature.');
      }
      let attemptId: string | null = null;
      if (b && kind === 'final') {
        attemptId = d.attempts.find((a) => a.batteryId === b.id && a.status === 'in_restoration')?.id ?? null;
        if (!attemptId) issues.push('A final test needs an open restoration attempt for this battery.');
      }
      const key = `${b?.id}|${kind}|${date}|${values.capacity}`;
      const existing = b && d.tests.some((t) => t.batteryId === b.id && t.kind === kind && t.startedAt.slice(0, 10) === date && t.result.capacityAh === values.capacity);
      let outcome: BenchRow['outcome'] = issues.length ? 'quarantine' : 'create';
      let note = issues.length ? 'Held for a person to check. Nothing is created.' : 'Will be created as a test submitted for engineering review.';
      if (!issues.length && (seen.has(key) || existing)) {
        outcome = 'skip';
        note = existing ? 'Already recorded: skipped.' : 'Same as an earlier row in this file: skipped.';
      }
      seen.add(key);
      const fields = Object.fromEntries(headers.map((h, j) => [h.trim().toLowerCase(), (r[j] ?? '').trim()]));
      out.push({ rowNumber: i + 2, batteryLabel: label || '(empty)', batteryId: b?.id ?? null, kind: KINDS.includes(kind) ? kind : null, date, capacityAh: Number.isNaN(values.capacity as number) ? null : values.capacity, attemptId, issues, outcome, note, fields });
    });
    return { hash: hashText(text), rows: out, profile: { id: profile.id, name: profile.name }, conversions: converted.notes };
  }

  const authorizeImport = () => {
    authorize(ctx, 'battery.import');
    return authorize(ctx, 'test.create');
  };
  const priorCommit = (hash: string) => db(ctx).audit.find((a) => a.action === 'import.bench_commit' && a.summary.includes(`hash ${hash}`))?.at ?? null;

  return {
    columns: () => [...BENCH_COLUMNS],
    sample: () => BENCH_SAMPLE_CSV,
    profiles: () => benchProfiles().map(({ id, name, description }) => ({ id, name, description })),

    async preview({ fileName, text, profileId }) {
      await latency(ctx);
      authorizeImport();
      const { hash, rows, profile, conversions } = check(text, profileId);
      const prior = priorCommit(hash);
      const shown = prior ? rows.map((r) => (r.outcome === 'create' ? { ...r, outcome: 'skip' as const, note: 'This exact file was committed before: skipped.' } : r)) : rows;
      return { fileName, fileHash: hash, profile, conversions, priorCommitAt: prior, rows: shown, counts: tally(shown) };
    },

    async commit({ fileName, text, profileId }, stored) {
      await latency(ctx);
      const actor = authorizeImport();
      const d = db(ctx);
      const { hash, rows } = check(text, profileId);
      const prior = priorCommit(hash);
      const toCreate = prior ? [] : rows.filter((r) => r.outcome === 'create');
      const created: string[] = [];
      if (toCreate.length) {
        // The source file itself is the evidence behind every row it produced.
        const ev = newEvidence(ctx, { batteryId: null, kind: 'import_source', fileName, sizeKb: Math.max(1, Math.round(text.length / 1024)), classification: 'internal' }, stored);
        d.evidence.push(ev);
        const now = ctx.store.now();
        for (const r of toCreate) {
          const s = (name: string) => r.fields[name] ?? '';
          const g = (name: string) => (s(name) === '' ? null : Number(s(name)));
          const t: TestSession = {
            id: ctx.store.nextId('test'), batteryId: r.batteryId, stringId: null, level: 'battery', kind: r.kind!, protocolId: s('protocol'),
            status: 'submitted', operatorId: actor.userId, operatorName: actor.name, witnessName: null,
            instrument: s('instrument'), calibrationRef: s('calibration_ref'),
            conditions: { ambientTempC: g('ambient_c'), loadCurrentA: g('load_current_a'), cutoffVoltageV: g('cutoff_v'), durationH: g('duration_h') },
            result: { openCircuitVoltageV: g('ocv_v'), internalResistanceMOhm: g('internal_resistance_mohm'), temperatureC: g('temperature_c'), capacityAh: g('capacity_ah'), notes: s('notes') },
            evidenceIds: [ev.id], attemptId: r.attemptId, startedAt: `${r.date}T06:00:00.000Z`, submittedAt: now, submittedById: actor.userId,
            reviewedAt: null, reviewerId: null, reviewerName: null, reviewReason: null, reviewReasonCode: null,
          };
          d.tests.push(t);
          created.push(t.id);
          const b = d.batteries.find((x) => x.id === r.batteryId)!;
          const was = b.lifecycleState;
          if (was === 'received') b.lifecycleState = 'testing';
          pushEvent(ctx, b.id, 'test', 'Test imported from bench file', `${fileName}, row ${r.rowNumber}. Submitted for engineering review.`, {
            previousState: was === 'received' ? 'received' : null, newState: was === 'received' ? 'testing' : null, approvalState: 'pending', ref: { kind: 'test', id: t.id }, evidenceIds: [ev.id], occurredAt: `${r.date}T06:00:00.000Z`, sourceSystem: 'Bench CSV import',
          });
        }
      }
      const counts = tally(prior ? rows.map((r) => (r.outcome === 'create' ? { ...r, outcome: 'skip' as const } : r)) : rows);
      audit(ctx, 'import.bench_commit', 'import', fileName, `Bench file ${fileName} (hash ${hash}): ${created.length} tests submitted, ${counts.skipped} skipped, ${counts.quarantined} quarantined`);
      ctx.store.save();
      return { fileName, fileHash: hash, created: created.length, counts, testIds: created, alreadyCommittedAt: prior };
    },
  };
}

function tally(rows: BenchRow[]) {
  return {
    create: rows.filter((r) => r.outcome === 'create').length,
    skipped: rows.filter((r) => r.outcome === 'skip').length,
    quarantined: rows.filter((r) => r.outcome === 'quarantine').length,
  };
}

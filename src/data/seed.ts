/**
 * Deterministic synthetic seed data.
 *
 * Everything here is invented for demonstration. No real customer, site, sensor,
 * cloud account or measurement is represented. Manufacturer names are fictional.
 * The generator uses a seeded PRNG so every build produces identical data.
 */
import type {
  Alert, AlertType, Battery, BatteryAlias, BatteryAssignment, BatteryFamily, CostEntry, DemoDb,
  EvidenceClassification, EvidenceFile, Gateway, LifecycleEvent, LifecycleEventType, LifecycleState,
  Prediction, RecyclingRecord, RestorationAttempt, RestorationBatch, Sensor, SensorAssignment,
  ServiceTask, Site, Slot, StringUnit, Bank, TestProtocolRevision, TestSession, User, WarrantyRecord,
  ApprovalState, TelemetryObservation,
} from '@/domain/types';

export const DEMO_NOW = '2026-10-13T05:00:00.000Z'; // 09:00 Gulf Standard Time
export const DEMO_NOTICE = 'Synthetic demonstration data. No live customer, cloud or sensor connection.';
/** Configurable demonstration threshold. Not an approved criterion until engineering/customer sign-off. */
export const QUALIFICATION_THRESHOLD_PCT = 85;
export const DEMO_CRITERION_TEXT = `Demonstration threshold: measured capacity at or above ${QUALIFICATION_THRESHOLD_PCT}% of rated under the stated protocol. A configurable example until the engineer and customer approve a real criterion.`;

const DAY = 86_400_000;
const NOW = Date.parse(DEMO_NOW);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(): DemoDb {
  const rnd = mulberry32(20261013);
  const rr = (min: number, max: number) => min + rnd() * (max - min);
  const ri = (min: number, max: number) => Math.floor(rr(min, max + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(rnd() * 4)]}${hex(3)}-${hex(12)}`;
  const iso = (daysAgo: number, hour = 9, minute = 0) => {
    const base = new Date(NOW - daysAgo * DAY);
    base.setUTCHours(hour, minute, 0, 0);
    return base.toISOString();
  };
  const dateOnly = (daysAgo: number) => iso(daysAgo).slice(0, 10);
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const usedRefs = new Set<string>();
  const publicRef = () => {
    for (;;) {
      const s = Array.from({ length: 8 }, () => REF_ALPHABET[Math.floor(rnd() * REF_ALPHABET.length)]).join('');
      const ref = `SYN-${s.slice(0, 4)}-${s.slice(4)}`;
      if (!usedRefs.has(ref)) {
        usedRefs.add(ref);
        return ref;
      }
    }
  };

  /* ------------------------------ Tenants & users ------------------------------ */
  const tenants = [
    { id: 't_ops', name: 'Synovra Operations (demo tenant)', kind: 'operator' as const },
    { id: 't_custA', name: 'Demo Customer Tenant A', kind: 'customer' as const },
    { id: 't_custB', name: 'Demo Customer Tenant B', kind: 'customer' as const },
  ];
  const users: User[] = [
    { id: 'u_lab1', name: 'Rania Khoury', title: 'Lab operator', email: 'rania.khoury@demo.invalid', role: 'lab_operator', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_lab2', name: 'Omar Farouk', title: 'Lab operator', email: 'omar.farouk@demo.invalid', role: 'lab_operator', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_eng1', name: 'Hamid Rahimi', title: 'Battery engineer (approver)', email: 'hamid.rahimi@demo.invalid', role: 'battery_engineer', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_eng2', name: 'Priya Menon', title: 'Battery engineer (approver)', email: 'priya.menon@demo.invalid', role: 'battery_engineer', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_field1', name: 'Tariq Aziz', title: 'Field technician', email: 'tariq.aziz@demo.invalid', role: 'field_technician', tenantId: 't_ops', siteScope: ['s1', 's2'], active: true },
    { id: 'u_field2', name: 'Lucas Ferreira', title: 'Field technician', email: 'lucas.ferreira@demo.invalid', role: 'field_technician', tenantId: 't_ops', siteScope: ['s3', 's4', 's5'], active: true },
    { id: 'u_noc', name: 'Sofia Marin', title: 'NOC / service manager', email: 'sofia.marin@demo.invalid', role: 'noc_manager', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_fin', name: 'Daniel Hughes', title: 'Finance / business owner', email: 'daniel.hughes@demo.invalid', role: 'finance_owner', tenantId: 't_ops', siteScope: 'all', active: true },
    { id: 'u_cust', name: 'Layla Mansour', title: 'Customer auditor', email: 'layla.mansour@demo.invalid', role: 'customer_auditor', tenantId: 't_custA', siteScope: ['s1', 's2'], active: true },
    { id: 'u_admin', name: 'Ibrahim Saleh', title: 'Platform administrator', email: 'ibrahim.saleh@demo.invalid', role: 'platform_admin', tenantId: 't_ops', siteScope: 'all', active: true },
  ];
  const U = Object.fromEntries(users.map((u) => [u.id, u]));

  /* ------------------------------ Families ------------------------------ */
  const families: BatteryFamily[] = [
    { id: 'f1', manufacturer: 'Arvento Power (fictional)', model: 'AV-12-200 FT AGM', chemistry: 'VRLA AGM', unitType: '12V block', ratedVoltageV: 12, ratedCapacityAh: 200, ratingConditions: 'C10 discharge at 25 °C to 10.80 V per block', rateHours: 10, ratedTempC: 25, endVoltagePerUnitV: 10.8 },
    { id: 'f2', manufacturer: 'Kestrel Energy (fictional)', model: 'KE-OPzS-600', chemistry: 'Flooded OPzS', unitType: '2V cell', ratedVoltageV: 2, ratedCapacityAh: 600, ratingConditions: 'C10 discharge at 25 °C to 1.80 V per cell', rateHours: 10, ratedTempC: 25, endVoltagePerUnitV: 1.8 },
    { id: 'f3', manufacturer: 'Halden Cells (fictional)', model: 'HC-12-150 GEL', chemistry: 'VRLA Gel', unitType: '12V block', ratedVoltageV: 12, ratedCapacityAh: 150, ratingConditions: 'C10 discharge at 25 °C to 10.50 V per block', rateHours: 10, ratedTempC: 25, endVoltagePerUnitV: 10.5 },
  ];
  const FAM = Object.fromEntries(families.map((f) => [f.id, f]));

  /* ------------------------------ Sites, strings, slots ------------------------------ */
  const sites: Site[] = [
    { id: 's1', tenantId: 't_custA', name: 'Demo Site A — Rooftop Cabinet', city: 'Dubai', kind: 'Rooftop cabinet site' },
    { id: 's2', tenantId: 't_custA', name: 'Demo Site B — Indoor Battery Room', city: 'Abu Dhabi', kind: 'Indoor site' },
    { id: 's3', tenantId: 't_custB', name: 'Demo Site C — Ground Tower', city: 'Sharjah', kind: 'Ground tower site' },
    { id: 's4', tenantId: 't_custB', name: 'Demo Site D — Exchange Battery Room', city: 'Al Ain', kind: 'Exchange / hub battery room' },
    { id: 's5', tenantId: 't_custB', name: 'Demo Site E — Rooftop Cabinet', city: 'Fujairah', kind: 'Rooftop cabinet site' },
  ];
  const banks: Bank[] = sites.map((s, i) => ({ id: `b${i + 1}`, siteId: s.id, name: 'Bank 1' }));
  const strDefs = [
    { id: 'str1', bank: 'b1', site: 's1', name: 'String 1', fam: 'f1', n: 4 },
    { id: 'str2', bank: 'b1', site: 's1', name: 'String 2', fam: 'f1', n: 4 },
    { id: 'str3', bank: 'b2', site: 's2', name: 'String 1', fam: 'f3', n: 4 },
    { id: 'str4', bank: 'b3', site: 's3', name: 'String 1', fam: 'f1', n: 4 },
    { id: 'str5', bank: 'b4', site: 's4', name: 'String 1', fam: 'f2', n: 6 },
    { id: 'str6', bank: 'b5', site: 's5', name: 'String 1', fam: 'f1', n: 4 },
  ];
  const strings: StringUnit[] = strDefs.map((s) => ({
    id: s.id, bankId: s.bank, siteId: s.site, name: s.name, familyId: s.fam,
    nominalVoltageV: FAM[s.fam].ratedVoltageV * s.n,
  }));
  const slots: Slot[] = strDefs.flatMap((s) =>
    Array.from({ length: s.n }, (_, i) => ({ id: `${s.id}-p${i + 1}`, stringId: s.id, bankId: s.bank, siteId: s.site, position: i + 1 })),
  );

  /* ------------------------------ Protocols ------------------------------ */
  const protocols: TestProtocolRevision[] = [
    { id: 'proto_intake', name: 'Intake inspection (placeholder)', revision: 'rev A', status: 'placeholder', summary: 'Visual and open-circuit voltage check on receipt. Placeholder revision for demonstration.' },
    { id: 'proto_c10', name: 'C10 capacity discharge (placeholder)', revision: 'rev B', status: 'placeholder', summary: 'Constant-current discharge to the family end voltage at the stated rate. Not an approved Synovra protocol; the applicable standard (e.g. IEC 60896-21 methods) is for the domain engineer to select.' },
    { id: 'proto_periodic', name: 'Periodic impedance check (placeholder)', revision: 'rev A', status: 'placeholder', summary: 'Internal resistance and voltage spot check for deployed units.' },
  ];

  /* ------------------------------ Batteries & history ------------------------------ */
  const batteries: Battery[] = [];
  const aliases: BatteryAlias[] = [];
  const events: LifecycleEvent[] = [];
  const tests: TestSession[] = [];
  const attempts: RestorationAttempt[] = [];
  const assignments: BatteryAssignment[] = [];
  const costs: CostEntry[] = [];
  const warranties: WarrantyRecord[] = [];
  const recycling: RecyclingRecord[] = [];
  const evidence: EvidenceFile[] = [];

  const batches: RestorationBatch[] = [
    { id: 'RB-2026-07', name: 'RB-2026-07 · AGM 12V 200Ah', familyId: 'f1', openedOn: '2026-06-15', status: 'closed', plannedCount: 14 },
    { id: 'RB-2026-08', name: 'RB-2026-08 · Gel 12V 150Ah', familyId: 'f3', openedOn: '2026-07-06', status: 'closed', plannedCount: 8 },
    { id: 'RB-2026-09', name: 'RB-2026-09 · AGM 12V 200Ah', familyId: 'f1', openedOn: '2026-08-24', status: 'open', plannedCount: 14 },
    { id: 'RB-2026-10', name: 'RB-2026-10 · OPzS 2V 600Ah', familyId: 'f2', openedOn: '2026-09-14', status: 'open', plannedCount: 10 },
  ];

  const LOC: Record<LifecycleState, string> = {
    received: 'Receiving bay',
    testing: 'Lab bay 1',
    restoration_candidate: 'Lab staging rack',
    in_restoration: 'Restoration bay (controlled area)',
    awaiting_review: 'Lab review shelf',
    rework: 'Rework bench',
    qualified: 'Qualified store',
    reserved: 'Qualified store — reserved shelf',
    deployed: 'Installed at site',
    returned: 'Returns bay',
    rejected: 'Quarantine shelf',
    recycling_queue: 'Recycling staging area',
    recycled: 'Consigned to recycler',
  };
  const END_AGO: Record<LifecycleState, [number, number]> = {
    received: [1, 4], testing: [3, 8], restoration_candidate: [4, 11], in_restoration: [3, 9],
    awaiting_review: [1, 4], rework: [2, 6], qualified: [5, 24], reserved: [2, 8], deployed: [36, 110],
    returned: [3, 14], rejected: [10, 40], recycling_queue: [2, 18], recycled: [30, 80],
  };

  const addEvidence = (
    batteryId: string | null, kind: EvidenceFile['kind'], fileName: string,
    classification: EvidenceClassification, at: string, by: string,
  ): string => {
    const id = `ev_${evidence.length + 1}`;
    evidence.push({ id, batteryId, kind, fileName, sizeKb: ri(40, 1800), uploadedAt: at, uploadedByName: by, checksum: hex(64), classification });
    return id;
  };

  type Plan = { state: LifecycleState; fam: string; slot?: string; flag?: string; ratios?: [number, number] };
  const plan: Plan[] = [];
  const add = (state: LifecycleState, fam: string, extra: Partial<Plan> = {}) => plan.push({ state, fam, ...extra });
  // Walkthrough scenarios from the demo blueprint (illustrative records B-0001..B-0006)
  add('received', 'f1');                                                         // B-0001 received, not tested
  add('qualified', 'f1', { ratios: [0.60, 0.87] });                             // B-0002 pre 120 Ah -> post 174 Ah
  add('rejected', 'f1', { flag: 'after_review', ratios: [0.55, 0.78] });        // B-0003 final below threshold
  add('deployed', 'f1', { slot: 'str1-p1' });                                   // B-0004 qualified, moved to site
  add('deployed', 'f1', { slot: 'str1-p2', flag: 'claim' });                    // B-0005 warranty claim after deployment
  add('recycled', 'f1', { slot: 'str6-p1', flag: 'handover' });                 // B-0006 recycled with handover document
  // remaining deployed, aligned to strings
  [['str1', 'f1', [3, 4]], ['str2', 'f1', [1, 2, 3]], ['str3', 'f3', [1, 2, 3]], ['str4', 'f1', [1, 2]], ['str5', 'f2', [1, 2, 3, 4]]].forEach(([s, f, ps]) => {
    (ps as number[]).forEach((i) => add('deployed', f as string, { slot: `${s}-p${i}` }));
  });
  (['f1', 'f3', 'f2', 'f1'] as const).forEach((f) => add('qualified', f));
  add('reserved', 'f1'); add('reserved', 'f3');
  add('awaiting_review', 'f1'); add('awaiting_review', 'f3'); add('awaiting_review', 'f1', { flag: 'borderline', ratios: [0.5, 0.855] });
  (['f1', 'f2', 'f2'] as const).forEach((f) => add('in_restoration', f));
  (['f1', 'f1', 'f2'] as const).forEach((f) => add('restoration_candidate', f));
  add('rework', 'f1');
  (['f1', 'f3', 'f1', 'f2'] as const).forEach((f) => add('testing', f));
  (['f1', 'f3', 'f2'] as const).forEach((f) => add('received', f));
  add('returned', 'f1', { slot: 'str4-p3' }); add('returned', 'f3', { slot: 'str3-p4' });
  add('rejected', 'f2', { flag: 'at_test' });
  add('recycling_queue', 'f1'); add('recycling_queue', 'f3');
  add('recycled', 'f2');

  const RESTORED_PATH: LifecycleState[] = ['received', 'testing', 'restoration_candidate', 'in_restoration', 'awaiting_review'];
  const pathFor = (p: Plan): LifecycleState[] => {
    switch (p.state) {
      case 'received': return ['received'];
      case 'testing': return ['received', 'testing'];
      case 'restoration_candidate': return RESTORED_PATH.slice(0, 3);
      case 'in_restoration': return RESTORED_PATH.slice(0, 4);
      case 'awaiting_review': return RESTORED_PATH;
      case 'rework': return [...RESTORED_PATH, 'rework'];
      case 'qualified': return [...RESTORED_PATH, 'qualified'];
      case 'reserved': return [...RESTORED_PATH, 'qualified', 'reserved'];
      case 'deployed': return [...RESTORED_PATH, 'qualified', 'deployed'];
      case 'returned': return [...RESTORED_PATH, 'qualified', 'deployed', 'returned'];
      case 'rejected': return p.flag === 'after_review' ? [...RESTORED_PATH, 'rejected'] : ['received', 'testing', 'rejected'];
      case 'recycling_queue': return ['received', 'testing', 'rejected', 'recycling_queue'];
      case 'recycled': return p.flag === 'handover'
        ? [...RESTORED_PATH, 'qualified', 'deployed', 'returned', 'recycling_queue', 'recycled']
        : ['received', 'testing', 'rejected', 'recycling_queue', 'recycled'];
    }
  };
  const STEP_DAYS: Partial<Record<LifecycleState, number>> = {
    testing: 1, restoration_candidate: 2, in_restoration: 2, awaiting_review: 7, qualified: 2, rework: 2,
    reserved: 4, deployed: 3, returned: 40, rejected: 1, recycling_queue: 3, recycled: 9,
  };

  const baseRint: Record<string, number> = { f1: 2.9, f2: 0.35, f3: 3.6 };
  const massKg: Record<string, number> = { f1: 60, f2: 41, f3: 46 };
  const makeResult = (famId: string, ratio: number, tempC: number) => {
    const fam = FAM[famId];
    const v12 = fam.unitType === '12V block';
    return {
      openCircuitVoltageV: round(v12 ? 11.9 + ratio * 0.9 + rr(-0.05, 0.08) : 1.93 + ratio * 0.12 + rr(-0.01, 0.01), 2),
      internalResistanceMOhm: round(baseRint[famId] * (2.5 - 1.5 * ratio) * rr(0.95, 1.08), famId === 'f2' ? 2 : 1),
      temperatureC: round(tempC, 1),
      capacityAh: round(fam.ratedCapacityAh * ratio, 1),
      notes: '',
    };
  };

  let seq = 0;
  const evSeq = () => `evt_${++seq}`;
  const costSource = (a: CostEntry['allocation']) =>
    a === 'direct' ? 'Purchase / work record (synthetic)' : a === 'allocated' ? 'Lab allocation sheet (synthetic)' : 'Planner estimate (synthetic)';
  const pushEventFor = (
    batteryId: string, type: LifecycleEventType, daysAgo: number, actor: { id: string; name: string } | 'system',
    title: string, reason: string, o: Partial<LifecycleEvent> = {},
  ) => {
    events.push({
      id: evSeq(), batteryId, type,
      occurredAt: iso(daysAgo, ri(7, 16), ri(0, 59)), dateCertainty: 'exact',
      recordedAt: iso(daysAgo, ri(7, 16), ri(0, 59)),
      actorId: actor === 'system' ? 'system' : actor.id,
      actorName: actor === 'system' ? 'System rule engine' : actor.name,
      title, reason, evidenceIds: [], approvalState: 'not_required' as ApprovalState,
      sourceSystem: 'Lab register (demo)', previousState: null, newState: null, ref: null, ...o,
    });
  };

  plan.forEach((p, idx) => {
    const fam = FAM[p.fam];
    const id = uuid();
    const path = pathFor(p);
    const [lo, hi] = END_AGO[p.state];
    let cursor = ri(lo, hi); // days ago of the final step
    const stepAgo: number[] = new Array(path.length);
    for (let i = path.length - 1; i >= 0; i--) {
      stepAgo[i] = cursor;
      cursor += STEP_DAYS[path[i]] ?? 1;
    }
    const intakeAgo = stepAgo[0];
    const hasSerial = !(idx % 11 === 7); // a few records arrive without serial
    const serialNo = ri(100000, 999999);
    const serialPrefix = p.fam === 'f1' ? 'AV200-25-' : p.fam === 'f2' ? 'KE600-' : 'HC150-';
    const batch =
      p.state === 'received' || p.state === 'testing' || p.flag === 'at_test' || path.length <= 2
        ? null
        : p.fam === 'f1'
          ? (intakeAgo > 90 ? 'RB-2026-07' : 'RB-2026-09')
          : p.fam === 'f3' ? 'RB-2026-08' : 'RB-2026-10';
    const battery: Battery = {
      id,
      label: `B-${String(idx + 1).padStart(4, '0')}`,
      publicRef: publicRef(),
      manufacturerSerial: hasSerial || idx < 6 ? `${serialPrefix}${serialNo}` : null,
      familyId: p.fam,
      manufacturedOn: idx % 9 === 4 ? null : dateOnly(intakeAgo + ri(700, 1500)),
      tenantId: 't_ops',
      lifecycleState: p.state,
      siteId: null,
      currentAssignmentId: null,
      physicalLocation: p.state === 'qualified' ? `Qualified store — rack Q${ri(1, 4)}` : LOC[p.state],
      restorationBatchId: batch,
      replacesBatteryId: null,
      createdAt: iso(intakeAgo, 8, 30),
      updatedAt: iso(stepAgo[path.length - 1], 11, 0),
      sourceSystem: idx % 3 === 0 ? 'Intake CSV import' : 'Lab register (demo)',
      internalNotes: '',
    };
    batteries.push(battery);

    const lab = pick([U.u_lab1, U.u_lab2]);
    const eng = pick([U.u_eng1, U.u_eng2]);
    const pushEvent = (
      type: LifecycleEventType, daysAgo: number, actor: { id: string; name: string } | 'system',
      title: string, reason: string, o: Partial<LifecycleEvent> = {},
    ) => pushEventFor(id, type, daysAgo, actor, title, reason, o);

    let prev: LifecycleState | null = null;
    let initialTestId: string | null = null;
    let finalTestId: string | null = null;
    let attemptId: string | null = null;
    const initialRatio = p.ratios?.[0] ?? rr(0.38, 0.72);
    const finalRatio = p.ratios?.[1] ?? (p.state === 'rework' ? rr(0.78, 0.84) : rr(0.86, 0.96));
    const decided = ['qualified', 'reserved', 'deployed', 'returned', 'rework', 'rejected'].includes(p.state) || path.includes('qualified');
    const deployIdx = path.indexOf('deployed');
    const deployAgo = deployIdx >= 0 ? stepAgo[deployIdx] : null;

    path.forEach((state, i) => {
      const ago = stepAgo[i];
      switch (state) {
        case 'received': {
          const legacyImport = battery.sourceSystem === 'Intake CSV import';
          const evId = addEvidence(id, legacyImport ? 'import_source' : 'photo',
            legacyImport ? 'intake_batch_sheet.csv' : `intake_photo_${id.slice(0, 6)}.jpg`, 'internal', iso(ago, 8, 40), lab.name);
          pushEvent('intake', ago, lab, 'Received into lab', 'Physical receipt and identity assignment. QR reference issued.', {
            newState: 'received', evidenceIds: [evId], sourceSystem: battery.sourceSystem,
            dateCertainty: legacyImport && idx % 2 === 0 ? 'approximate' : 'exact',
          });
          break;
        }
        case 'testing': {
          const tid = `test_${tests.length + 1}`;
          initialTestId = tid;
          const ev1 = addEvidence(id, 'test_report', `initial_test_${tid}.pdf`, 'customer_visible', iso(ago, 15), lab.name);
          const result = makeResult(p.fam, initialRatio, 25 + rr(-1.2, 1.2));
          tests.push({
            id: tid, batteryId: id, stringId: null, level: 'battery', kind: 'initial', protocolId: 'proto_c10',
            status: 'approved', operatorId: lab.id, operatorName: lab.name, witnessName: idx % 4 === 0 ? 'Omar Farouk' : null,
            instrument: 'Discharge bench DB-2 (demo)', calibrationRef: 'CAL-DEMO-2026-03',
            conditions: { ambientTempC: result.temperatureC, loadCurrentA: round(fam.ratedCapacityAh / fam.rateHours, 1), cutoffVoltageV: fam.endVoltagePerUnitV, durationH: round((result.capacityAh ?? 0) / (fam.ratedCapacityAh / fam.rateHours), 1) },
            result, evidenceIds: [ev1], attemptId: null,
            startedAt: iso(ago, 9), submittedAt: iso(ago, 15), submittedById: lab.id,
            reviewedAt: iso(ago, 16), reviewerId: eng.id, reviewerName: eng.name, reviewReason: 'Record verified against bench log.',
          });
          pushEvent('test', ago, lab, 'Initial capacity test recorded', `Measured ${result.capacityAh} Ah vs ${fam.ratedCapacityAh} Ah rated (${fam.ratingConditions}).`, {
            previousState: prev, newState: 'testing', evidenceIds: [ev1], approvalState: 'approved', ref: { kind: 'test', id: tid },
          });
          break;
        }
        case 'restoration_candidate':
          pushEvent('approval', ago, eng, 'Selected as restoration candidate', 'Initial result and intake inspection reviewed. Candidate decision by engineer.', {
            previousState: prev, newState: 'restoration_candidate', approvalState: 'approved',
          });
          break;
        case 'in_restoration': {
          attemptId = `att_${attempts.length + 1}`;
          const lotEv = addEvidence(id, 'other', `process_sheet_${attemptId}.pdf`, 'controlled', iso(ago, 12), lab.name);
          attempts.push({
            id: attemptId, batchId: batch ?? 'RB-2026-09', batteryId: id, attemptNo: 1, status: 'in_restoration',
            beforeTestId: initialTestId, afterTestId: null,
            notes: [{ id: `${attemptId}_n1`, at: iso(ago, 12), actorName: lab.name, text: 'Attempt opened. Process steps are recorded in the controlled lab system and are not reproduced in this demo.' }],
            lotRefs: [{ kind: 'material', ref: `LOT-REF-DEMO-${ri(1000, 9999)}` }, ...(idx % 2 === 0 ? [{ kind: 'solvent' as const, ref: `LOT-REF-DEMO-${ri(1000, 9999)}` }] : [])],
            evidenceIds: [lotEv], startedAt: iso(ago, 12), submittedAt: null, decidedAt: null, deciderName: null, decisionReason: null,
          });
          pushEvent('restoration', ago, lab, 'Restoration attempt 1 started', 'Attempt opened in the restoration batch. Same battery identity retained.', {
            previousState: prev, newState: 'in_restoration', evidenceIds: [lotEv], ref: { kind: 'attempt', id: attemptId },
          });
          break;
        }
        case 'awaiting_review': {
          const tid = `test_${tests.length + 1}`;
          finalTestId = tid;
          const result = makeResult(p.fam, finalRatio, 25 + rr(-1, 1));
          const ev1 = addEvidence(id, 'test_report', `final_test_${tid}.pdf`, 'customer_visible', iso(ago, 14), lab.name);
          tests.push({
            id: tid, batteryId: id, stringId: null, level: 'battery', kind: 'final', protocolId: 'proto_c10',
            status: decided ? 'approved' : 'submitted',
            operatorId: lab.id, operatorName: lab.name, witnessName: null,
            instrument: 'Discharge bench DB-2 (demo)', calibrationRef: 'CAL-DEMO-2026-03',
            conditions: { ambientTempC: result.temperatureC, loadCurrentA: round(fam.ratedCapacityAh / fam.rateHours, 1), cutoffVoltageV: fam.endVoltagePerUnitV, durationH: round((result.capacityAh ?? 0) / (fam.ratedCapacityAh / fam.rateHours), 1) },
            result, evidenceIds: [ev1], attemptId,
            startedAt: iso(ago, 9), submittedAt: iso(ago, 14), submittedById: lab.id,
            reviewedAt: decided ? iso(ago, 16) : null, reviewerId: decided ? eng.id : null, reviewerName: decided ? eng.name : null,
            reviewReason: decided ? 'Result matches bench log; conditions per protocol.' : null,
          });
          const att = attempts.find((a) => a.id === attemptId)!;
          att.afterTestId = tid; att.status = 'awaiting_review'; att.submittedAt = iso(ago, 14);
          att.evidenceIds.push(ev1);
          pushEvent('test', ago, lab, 'Post-restoration capacity test recorded', `Measured ${result.capacityAh} Ah vs ${fam.ratedCapacityAh} Ah rated. Submitted for engineer review.`, {
            previousState: prev, newState: 'awaiting_review', evidenceIds: [ev1], approvalState: decided ? 'approved' : 'pending', ref: { kind: 'test', id: tid },
          });
          break;
        }
        case 'qualified': {
          const att = attempts.find((a) => a.id === attemptId)!;
          att.status = 'approved'; att.decidedAt = iso(ago, 16); att.deciderName = eng.name;
          att.decisionReason = `After-test meets the demonstration threshold (${QUALIFICATION_THRESHOLD_PCT}% of rated); evidence complete.`;
          pushEvent('approval', ago, eng, 'Qualified by engineer', 'Qualification approved against the demonstration threshold. Identity unchanged.', {
            previousState: prev, newState: 'qualified', approvalState: 'approved', ref: { kind: 'attempt', id: attemptId! },
            evidenceIds: tests.find((t) => t.id === finalTestId)?.evidenceIds ?? [],
          });
          break;
        }
        case 'rework': {
          const att = attempts.find((a) => a.id === attemptId)!;
          att.status = 'rework'; att.decidedAt = iso(ago, 16); att.deciderName = eng.name;
          att.decisionReason = 'Capacity below threshold. Repeat restoration step and re-test.';
          pushEvent('rework', ago, eng, 'Rework requested', 'Capacity below the demonstration threshold; engineer requested a further attempt.', {
            previousState: prev, newState: 'rework', approvalState: 'rejected', ref: { kind: 'attempt', id: attemptId! },
          });
          break;
        }
        case 'rejected': {
          const atTest = p.flag !== 'after_review';
          if (!atTest && attemptId) {
            const att = attempts.find((a) => a.id === attemptId)!;
            att.status = 'rejected'; att.decidedAt = iso(ago, 16); att.deciderName = eng.name;
            att.decisionReason = 'After restoration, capacity remained below the demonstration threshold.';
          }
          pushEvent('rejection', ago, eng, 'Rejected by engineer', atTest ? 'Initial result and inspection indicate the unit is not a restoration candidate.' : 'Capacity remained below the demonstration threshold after the restoration attempt. No deployment permitted.', {
            previousState: prev, newState: 'rejected', approvalState: 'rejected',
          });
          break;
        }
        case 'reserved':
          pushEvent('movement', ago, U.u_noc, 'Reserved for planned deployment', 'Held on the reserved shelf for the next commissioning visit.', {
            previousState: prev, newState: 'reserved', sourceSystem: 'Deployment planner (demo)',
          });
          break;
        case 'deployed': {
          const slot = p.slot ? slots.find((s) => s.id === p.slot)! : null;
          if (slot) {
            const aid = `asg_${assignments.length + 1}`;
            const field = slot.siteId === 's1' || slot.siteId === 's2' ? U.u_field1 : U.u_field2;
            const closed = path.includes('returned');
            assignments.push({ id: aid, batteryId: id, slotId: slot.id, startAt: iso(ago, 10), endAt: closed ? iso(stepAgo[path.indexOf('returned')], 10) : null, reason: 'Commissioning', actorId: field.id });
            if (!closed) { battery.currentAssignmentId = aid; battery.siteId = slot.siteId; }
            pushEvent('movement', ago + 0.1, field, 'Left qualified store for site', `Moved from the qualified store to site ${slot.siteId.toUpperCase()}. Earlier location history retained.`, {
              sourceSystem: 'Deployment planner (demo)',
            });
            pushEvent('deployment', ago, field, 'Installed in site slot', `Installed at ${slot.siteId.toUpperCase()} / ${slot.stringId} / position ${slot.position}. Assignment history created.`, {
              previousState: prev, newState: 'deployed', sourceSystem: 'Deployment planner (demo)', ref: { kind: 'assignment', id: aid },
            });
          }
          break;
        }
        case 'returned':
          pushEvent('return', ago, U.u_field1, 'Returned from site', 'Removed from service and returned to the lab for disposition. Same battery identity.', {
            previousState: prev, newState: 'returned', sourceSystem: 'Deployment planner (demo)',
          });
          break;
        case 'recycling_queue': {
          recycling.push({ id: `rec_${recycling.length + 1}`, batteryId: id, state: 'queued', recyclerName: 'Licensed recycler (placeholder)', consignmentRef: null, massKg: null, consignedOn: null, certificateState: 'not_received', certificateRef: null });
          pushEvent('recycling', ago, lab, 'Moved to recycling queue', 'Disposition decided. Awaiting consignment to a licensed recycler.', {
            previousState: prev, newState: 'recycling_queue',
          });
          break;
        }
        case 'recycled': {
          const rec = recycling[recycling.length - 1];
          const complete = p.flag === 'handover' || idx % 2 === 0;
          rec.state = 'recycled'; rec.consignmentRef = `CONS-DEMO-${ri(100, 999)}`;
          rec.massKg = complete ? massKg[p.fam] : null; rec.consignedOn = dateOnly(ago);
          rec.certificateState = complete ? 'received' : 'not_received';
          rec.certificateRef = complete ? `CERT-DEMO-${ri(1000, 9999)}` : null;
          const hand = addEvidence(id, 'other', `consignment_handover_${rec.consignmentRef}.pdf`, 'customer_visible', iso(ago, 15), lab.name);
          pushEvent('recycling', ago, lab, 'Consigned for recycling', 'Handed to the recycler under a consignment reference. Battery record closed; history retained.', {
            previousState: prev, newState: 'recycled', evidenceIds: [hand],
          });
          break;
        }
        default: break;
      }
      prev = state;
    });

    /* costs (unknown stays unknown) */
    const batchRef = batch;
    const addCost = (kind: CostEntry['kind'], amount: number | null, allocation: CostEntry['allocation'], note: string, daysAgo: number) =>
      costs.push({
        id: `cost_${costs.length + 1}`, batteryId: id, batchId: batchRef, kind, amountAed: amount, allocation,
        recordedOn: dateOnly(daysAgo), note, source: costSource(allocation),
        allocationBasis: allocation === 'allocated' ? 'Equal split across batch intake' : null,
      });
    addCost('acquisition', idx % 6 === 2 ? null : Math.round(fam.ratedCapacityAh * rr(0.55, 0.85)), 'direct', idx % 6 === 2 ? 'Purchase value not supplied' : 'Acquisition value (synthetic)', intakeAgo);
    if (path.includes('testing')) addCost('testing', Math.round(rr(35, 60)), 'allocated', 'Bench time allocation (synthetic)', stepAgo[1]);
    if (path.includes('in_restoration')) addCost('restoration_inputs', idx % 5 === 1 ? null : Math.round(rr(60, 140)), 'allocated', idx % 5 === 1 ? 'Input cost not yet allocated' : 'Inputs allocated across batch (synthetic)', stepAgo[path.indexOf('in_restoration')]);
    if (deployAgo !== null) {
      addCost('logistics', Math.round(rr(25, 55)), 'allocated', 'Transport share (synthetic)', deployAgo);
      addCost('installation', idx % 4 === 0 ? null : Math.round(rr(30, 70)), 'estimate', 'Installation estimate', deployAgo);
    }
    if (p.flag === 'claim') addCost('service', 240, 'direct', 'Site visit and bench check for warranty claim (synthetic)', 6);

    /* warranty */
    if (deployAgo !== null && !path.includes('recycled')) {
      const known = idx % 7 !== 3 || p.flag === 'claim';
      const endsInDays = 365 - deployAgo;
      let state: WarrantyRecord['state'] = endsInDays < 0 ? 'expired' : endsInDays < 45 ? 'expiring' : 'active';
      if (path.includes('returned')) state = 'claim_closed';
      if (p.flag === 'claim') state = 'claim_open';
      if (!known) state = 'unknown';
      warranties.push({
        id: `wty_${warranties.length + 1}`, batteryId: id,
        termsRef: known ? 'DEMO-WTY-12M (placeholder terms)' : null,
        startsOn: known ? dateOnly(deployAgo) : null, endsOn: known ? dateOnly(deployAgo - 365) : null,
        state,
        claims: p.flag === 'claim'
          ? [{ id: 'clm_claim_1', openedOn: dateOnly(7), status: 'open', summary: 'Float voltage drift reported at site; unit under investigation.', finding: 'Measured float voltage 0.18 V below string median (observation only).', confirmedCause: null }]
          : path.includes('returned')
            ? [{ id: `clm_${warranties.length + 1}`, openedOn: dateOnly(stepAgo[path.indexOf('returned')] + 4), status: 'closed', summary: 'Returned from site after service review; disposition recorded.', finding: 'Capacity below target on bench re-test.', confirmedCause: null }]
            : [],
      });
    }
  });

  // --- identity conflicts and duplicates (deliberate) ---
  const dupSource = batteries.find((b) => b.manufacturerSerial && b.lifecycleState === 'deployed' && b.familyId === 'f1')!;
  const dupTarget = batteries.find((b) => b.lifecycleState === 'received' && b.familyId === 'f1')!;
  dupTarget.manufacturerSerial = dupSource.manufacturerSerial;
  dupTarget.internalNotes = 'Re-scanned at receiving bay; serial matches an existing record. Needs identity review.';
  const aliasA = batteries.find((b) => b.lifecycleState === 'qualified' && b.familyId === 'f1')!;
  const aliasB = batteries.find((b) => b.lifecycleState === 'testing' && b.familyId === 'f1')!;
  aliases.push({ id: 'al_1', batteryId: aliasA.id, kind: 'legacy_lab_id', value: 'LAB-0117', source: 'Legacy lab spreadsheet 2025' });
  aliases.push({ id: 'al_2', batteryId: aliasB.id, kind: 'legacy_lab_id', value: 'LAB-0117', source: 'Legacy lab spreadsheet 2025' });
  const serialClash = batteries.find((b) => b.lifecycleState === 'in_restoration' && b.familyId === 'f2')!;
  const tagOwner = batteries.find((b) => b.lifecycleState === 'recycled' && b.familyId === 'f1')!;
  if (tagOwner.manufacturerSerial) aliases.push({ id: 'al_3', batteryId: serialClash.id, kind: 'previous_serial', value: tagOwner.manufacturerSerial, source: 'Customer asset register (demo)' });
  // ordinary aliases
  batteries.filter((_, i) => i % 5 === 0).forEach((b, i) => {
    aliases.push({ id: `al_${i + 10}`, batteryId: b.id, kind: i % 2 ? 'customer_asset_tag' : 'spreadsheet_row', value: i % 2 ? `ASSET-${ri(2000, 2999)}` : `row-${ri(2, 90)}`, source: 'Intake import' });
  });
  // replacement: a returned battery was replaced by a *new* record, not merged
  const returned = batteries.find((b) => b.lifecycleState === 'returned' && b.familyId === 'f1');
  const replacementSource = batteries.find((b) => b.lifecycleState === 'qualified' && b.familyId === 'f1' && b.id !== aliasA.id);
  if (returned && replacementSource) {
    replacementSource.replacesBatteryId = returned.id;
    events.push({
      id: evSeq(), batteryId: returned.id, type: 'identity', occurredAt: iso(10, 11), dateCertainty: 'exact', recordedAt: iso(10, 11), actorId: 'u_eng1', actorName: 'Hamid Rahimi',
      title: 'Replaced by a different physical battery', reason: `Unit was replaced in its slot by battery ${replacementSource.publicRef}. A replacement is a new identity; histories are linked, not merged.`,
      evidenceIds: [], approvalState: 'approved', sourceSystem: 'Deployment planner (demo)', previousState: null, newState: null, ref: { kind: 'battery', id: replacementSource.id },
    });
  }

  /* ------------------------------ Gateways, sensors, telemetry ------------------------------ */
  const gateways: Gateway[] = [
    { id: 'gw1', siteId: 's1', name: 'GW-S1-01', status: 'online', lastSeenAt: iso(0, 4, 55), samplingIntervalMin: 15 },
    { id: 'gw2', siteId: 's2', name: 'GW-S2-01', status: 'degraded', lastSeenAt: iso(1, 14, 0), samplingIntervalMin: 15 },
    { id: 'gw3', siteId: 's3', name: 'GW-S3-01', status: 'offline', lastSeenAt: iso(5, 7, 0), samplingIntervalMin: 15 },
    { id: 'gw4', siteId: 's4', name: 'GW-S4-01', status: 'online', lastSeenAt: iso(0, 4, 50), samplingIntervalMin: 15 },
    { id: 'gw5', siteId: 's5', name: 'GW-S5-01', status: 'online', lastSeenAt: iso(0, 4, 58), samplingIntervalMin: 15 },
  ];
  const sensors: Sensor[] = [];
  const sensorAssignments: SensorAssignment[] = [];
  const sensorOf: Record<string, string> = {}; // slotId -> sensorId
  const sensorStrings: Record<string, string> = { str1: 'gw1', str3: 'gw2', str5: 'gw4' };
  Object.entries(sensorStrings).forEach(([strId, gw]) => {
    slots.filter((s) => s.stringId === strId).forEach((slot) => {
      const sid = `sen_${sensors.length + 1}`;
      sensors.push({
        id: sid, gatewayId: gw, serial: `SM-DEMO-${ri(10000, 99999)}`, kind: 'block_monitor',
        resistanceSource: strId === 'str1' ? 'measured' : strId === 'str5' ? 'inferred' : 'unavailable',
        calibrationRef: `SCAL-DEMO-${strId.toUpperCase()}`,
      });
      sensorAssignments.push({ id: `sa_${sensorAssignments.length + 1}`, sensorId: sid, slotId: slot.id, startAt: iso(115, 10), endAt: null, mappingQuality: slot.stringId === 'str5' && slot.position === 3 ? 'unverified' : 'verified', actorId: 'u_field1' });
      sensorOf[slot.id] = sid;
    });
  });
  // spare sensor that was never mapped
  sensors.push({ id: `sen_${sensors.length + 1}`, gatewayId: 'gw1', serial: 'SM-DEMO-00417', kind: 'block_monitor', resistanceSource: 'measured', calibrationRef: 'SCAL-DEMO-SPARE' });
  sensorAssignments.push({ id: `sa_${sensorAssignments.length + 1}`, sensorId: sensors[sensors.length - 1].id, slotId: null, startAt: iso(20, 10), endAt: null, mappingQuality: 'unverified', actorId: 'u_field1' });
  // history: a sensor that was re-mapped
  sensorAssignments.push({ id: `sa_${sensorAssignments.length + 1}`, sensorId: sensorOf['str1-p2'], slotId: 'str1-p3', startAt: iso(115, 10), endAt: iso(60, 9), mappingQuality: 'unverified', actorId: 'u_field1' });

  /* ------------------------------ Alerts ------------------------------ */
  const batteryInSlot = (slotId: string) => batteries.find((b) => assignments.find((a) => a.id === b.currentAssignmentId)?.slotId === slotId)!;
  const alerts: Alert[] = [];
  const mkAlert = (
    type: AlertType, state: Alert['state'], severity: Alert['severity'], siteId: string, batteryId: string | null,
    title: string, detail: string, rec: string, createdAgoH: number, src: Alert['source'], o: Partial<Alert> = {},
  ) => {
    const created = new Date(NOW - createdAgoH * 3_600_000).toISOString();
    alerts.push({
      id: `ALR-${1001 + alerts.length}`, type, state, severity, batteryId, siteId, source: src, title, detail,
      recommendedAction: rec, createdAt: created, lastEvaluatedAt: iso(0, 4, 30), assigneeId: null,
      evidence: [], resolutionReason: null,
      history: [{ at: created, actorName: src.kind === 'model' ? 'Model (shadow mode)' : 'System rule engine', from: null, to: 'open', note: 'Alert raised.' }],
      ...o,
    });
  };
  const ruleV = (name: string, v = '1.2.0') => ({ kind: 'rule' as const, name, version: `${v} (demo)` });
  const b1p2 = batteryInSlot('str1-p2'); const b1p4 = batteryInSlot('str1-p4');
  const b3p2 = batteryInSlot('str3-p2'); const b5p3 = batteryInSlot('str5-p3'); const b5p1 = batteryInSlot('str5-p1');
  const b2p1 = batteryInSlot('str2-p1'); const b4p1 = batteryInSlot('str4-p1');

  mkAlert('gateway_offline', 'open', 'critical', 's3', null, 'Gateway GW-S3-01 not reporting', 'No data received from the gateway for 5 days. Site C strings are unmonitored; their values are unknown, not normal.', 'Confirm site power and network, then schedule a gateway check.', 120, ruleV('gateway-heartbeat', '1.0.1'), { evidence: [{ label: 'Last heartbeat', value: iso(5, 7, 0) }, { label: 'Expected interval', value: '60 min' }] });
  mkAlert('missing_telemetry', 'acknowledged', 'warning', 's2', null, 'Telemetry gap at Site B', 'Gateway GW-S2-01 is degraded; last reading is older than 3 sampling intervals.', 'Check gateway uplink. Readings from this site are shown as stale.', 20, ruleV('telemetry-gap', '1.1.0'), { assigneeId: 'u_noc', evidence: [{ label: 'Last reading', value: iso(1, 14, 0) }, { label: 'Missing intervals', value: '15' }] });
  mkAlert('sensor_unmapped', 'open', 'info', 's1', null, 'Sensor SM-DEMO-00417 has no slot mapping', 'A sensor on GW-S1-01 reports data that cannot be attributed to a battery.', 'Verify the physical slot and record a sensor assignment.', 470, ruleV('sensor-mapping-check', '1.0.0'), { evidence: [{ label: 'Sensor', value: 'SM-DEMO-00417' }] });
  mkAlert('missing_telemetry', 'assigned', 'warning', 's4', b5p3?.id ?? null, 'Sensor silent for 2 days at S4 / String 1 / pos 3', 'The block monitor stopped reporting while the gateway remains online. Mapping is also unverified.', 'Inspect sensor wiring and confirm slot mapping on site.', 52, ruleV('telemetry-gap', '1.1.0'), { assigneeId: 'u_field2', evidence: [{ label: 'Mapping quality', value: 'unverified' }] });
  mkAlert('voltage_threshold', 'in_progress', 'warning', 's1', b1p2?.id ?? null, 'Float voltage below configured band', 'Measured float voltage has drifted 0.18 V below the string median over 6 days.', 'Check charger setting and terminal torque; re-measure on site.', 150, ruleV('float-voltage-band', '2.0.0'), { assigneeId: 'u_field1', evidence: [{ label: 'Latest measured', value: '13.38 V' }, { label: 'String median', value: '13.56 V' }, { label: 'Configured band', value: '13.40–13.80 V' }] });
  mkAlert('temperature_threshold', 'open', 'critical', 's4', b5p1?.id ?? null, 'Cell temperature above limit', 'Measured temperature exceeded the configured limit on three consecutive readings.', 'Inspect ventilation and cooling; treat as urgent until re-measured.', 9, ruleV('temperature-limit', '1.4.0'), { evidence: [{ label: 'Latest measured', value: '36.4 °C' }, { label: 'Configured limit', value: '35.0 °C' }] });
  mkAlert('resistance_trend', 'acknowledged', 'warning', 's1', b1p4?.id ?? null, 'Internal resistance trending upward', 'Daily resistance readings are up 14% over 30 days (rule-based comparison, not a model).', 'Schedule a bench check at next visit.', 300, ruleV('resistance-trend', '1.0.0'), { assigneeId: 'u_noc', evidence: [{ label: '30-day change', value: '+14%' }] });
  mkAlert('suspected_battery_issue', 'open', 'warning', 's2', b3p2?.id ?? null, 'Possible battery issue flagged by anomaly model', 'Model flagged this unit as different from its string peers. Shadow mode: not validated.', 'Engineer to review telemetry and decide whether a service visit is needed.', 30, { kind: 'model', name: 'string-anomaly-detector', version: '0.2.0-shadow' }, { evidence: [{ label: 'Model status', value: 'Shadow mode — not validated' }, { label: 'Telemetry age', value: 'Stale (gateway degraded)' }] });
  mkAlert('warranty_review', 'open', 'info', 's3', b4p1?.id ?? null, 'Warranty term ending soon', 'Warranty ends within 45 days. Review condition evidence before expiry.', 'Compile the warranty evidence pack and confirm any open concerns.', 200, ruleV('warranty-window', '1.0.0'));
  mkAlert('voltage_threshold', 'resolved', 'warning', 's1', b2p1?.id ?? null, 'Float voltage outside band (resolved)', 'Charger setpoint corrected on site; voltage returned inside band.', 'None — resolved.', 460, ruleV('float-voltage-band', '2.0.0'), { assigneeId: 'u_field1', resolutionReason: 'Charger setpoint corrected on site. Re-measured within band.' });
  mkAlert('temperature_threshold', 'closed', 'info', 's5', null, 'Room temperature spike (closed)', 'Short excursion linked to maintenance work in the room.', 'None — closed.', 700, ruleV('temperature-limit', '1.4.0'), { assigneeId: 'u_field2', resolutionReason: 'Linked to planned maintenance; no battery action.' });
  mkAlert('missing_telemetry', 'resolved', 'warning', 's1', null, 'Gateway reconnect after outage (resolved)', 'Short outage at GW-S1-01; backfill received.', 'None — resolved.', 380, ruleV('telemetry-gap', '1.1.0'), { assigneeId: 'u_noc', resolutionReason: 'Gateway reconnected; backfilled readings accepted.' });
  // append progress history for non-open alerts
  alerts.forEach((a) => {
    const step = (to: Alert['state'], who: string, note: string, mins: number) => {
      const prevState = a.history[a.history.length - 1].to;
      a.history.push({ at: new Date(Date.parse(a.createdAt) + mins * 60_000).toISOString(), actorName: who, from: prevState, to, note });
    };
    if (['acknowledged', 'assigned', 'in_progress', 'resolved', 'closed'].includes(a.state)) step('acknowledged', 'Sofia Marin', 'Acknowledged. No battery action implied.', 25);
    if (['assigned', 'in_progress', 'resolved', 'closed'].includes(a.state)) step('assigned', 'Sofia Marin', 'Assigned for follow-up.', 40);
    if (['in_progress', 'resolved', 'closed'].includes(a.state)) step('in_progress', 'Field team', 'Work started.', 120);
    if (['resolved', 'closed'].includes(a.state)) step('resolved', 'Field team', a.resolutionReason ?? 'Resolved.', 300);
    if (a.state === 'closed') step('closed', 'Sofia Marin', 'Closed after review.', 600);
  });

  /* ------------------------------ Tasks ------------------------------ */
  const tasks: ServiceTask[] = [];
  const mkTask = (o: Omit<ServiceTask, 'id' | 'createdAt' | 'createdByName'> & { createdAgoH?: number; by?: string }) => {
    const { createdAgoH, by, ...rest } = o;
    tasks.push({ id: `TSK-${201 + tasks.length}`, createdAt: new Date(NOW - (createdAgoH ?? 24) * 3_600_000).toISOString(), createdByName: by ?? 'Sofia Marin', ...rest });
  };
  mkTask({ alertId: 'ALR-1001', batteryId: null, siteId: 's3', title: 'Inspect gateway GW-S3-01 power and uplink', description: 'Confirm mains supply and network path; restore reporting.', status: 'open', priority: 'high', assigneeId: 'u_field2', dueOn: dateOnly(-2), origin: 'alert', createdAgoH: 100 });
  mkTask({ alertId: 'ALR-1002', batteryId: null, siteId: 's2', title: 'Check uplink at Site B', description: 'Gateway degraded; check SIM/uplink and power.', status: 'in_progress', priority: 'normal', assigneeId: 'u_field1', dueOn: dateOnly(-1), origin: 'alert', createdAgoH: 18 });
  mkTask({ alertId: 'ALR-1004', batteryId: b5p3?.id ?? null, siteId: 's4', title: 'Inspect sensor at S4 / String 1 / pos 3', description: 'Wiring check and mapping verification.', status: 'open', priority: 'normal', assigneeId: 'u_field2', dueOn: dateOnly(-3), origin: 'alert', createdAgoH: 48 });
  mkTask({ alertId: 'ALR-1005', batteryId: b1p2?.id ?? null, siteId: 's1', title: 'Re-measure float voltage on String 1', description: 'Check charger setpoint and terminal torque.', status: 'in_progress', priority: 'normal', assigneeId: 'u_field1', dueOn: dateOnly(-1), origin: 'alert', createdAgoH: 140 });
  mkTask({ alertId: 'ALR-1006', batteryId: b5p1?.id ?? null, siteId: 's4', title: 'Check ventilation and temperature at Site D', description: 'Urgent re-measure and ventilation inspection.', status: 'open', priority: 'high', assigneeId: 'u_field2', dueOn: dateOnly(0), origin: 'alert', createdAgoH: 8 });
  mkTask({ alertId: 'ALR-1007', batteryId: b1p4?.id ?? null, siteId: 's1', title: 'Bench-check resistance on S1 pos 4', description: 'Pull for bench impedance check at next visit.', status: 'open', priority: 'low', assigneeId: null, dueOn: dateOnly(-14), origin: 'alert', createdAgoH: 280 });
  mkTask({ alertId: null, batteryId: null, siteId: 's5', title: 'Commissioning visit — Site E String 1', description: 'Install reserved batteries and map sensors.', status: 'open', priority: 'normal', assigneeId: 'u_field2', dueOn: dateOnly(-7), origin: 'manual', createdAgoH: 70 });
  mkTask({ alertId: 'ALR-1010', batteryId: b2p1?.id ?? null, siteId: 's1', title: 'Verify charger setpoint (completed)', description: 'Charger setpoint corrected.', status: 'done', priority: 'normal', assigneeId: 'u_field1', dueOn: dateOnly(5), origin: 'alert', createdAgoH: 450 });
  mkTask({ alertId: 'ALR-1011', batteryId: null, siteId: 's5', title: 'Room temperature review (closed)', description: 'No action required.', status: 'cancelled', priority: 'low', assigneeId: 'u_field2', dueOn: null, origin: 'alert', createdAgoH: 690 });
  mkTask({ alertId: 'ALR-1008', batteryId: b3p2?.id ?? null, siteId: 's2', title: 'Draft: review anomaly flag on S2 / String 1 / pos 2', description: 'Draft prepared by the assistant for engineer review. Not yet confirmed.', status: 'draft', priority: 'normal', assigneeId: null, dueOn: null, origin: 'assistant_draft', createdAgoH: 3, by: 'Assistant draft (unconfirmed)' });

  /* ------------------------------ Predictions (all shadow-mode demos) ------------------------------ */
  const predictions: Prediction[] = [];
  const mkPred = (p: Omit<Prediction, 'id' | 'inputAt' | 'predictedAt' | 'status' | 'reviewState' | 'reviewedByName'> & { inputAgoH?: number; reviewState?: Prediction['reviewState']; reviewedByName?: string | null }) => {
    const { inputAgoH, reviewState, reviewedByName, ...rest } = p;
    predictions.push({
      id: `PRD-${predictions.length + 1}`, inputAt: new Date(NOW - (inputAgoH ?? 6) * 3_600_000).toISOString(),
      predictedAt: new Date(NOW - ((inputAgoH ?? 6) - 0.3) * 3_600_000).toISOString(),
      status: 'shadow', reviewState: reviewState ?? 'unreviewed', reviewedByName: reviewedByName ?? null, ...rest,
    });
  };
  // Qualification aid runs BEFORE processing: it may only use intake context and the initial test.
  const candidates = batteries.filter((b) => ['restoration_candidate', 'testing'].includes(b.lifecycleState) && b.familyId === 'f1');
  candidates.slice(0, 3).forEach((b, i) => {
    const t = tests.find((x) => x.batteryId === b.id && x.kind === 'initial');
    mkPred({ kind: 'qualification_aid', batteryId: b.id, siteId: null, modelName: 'restoration-qualification-aid', modelVersion: '0.3.0-shadow',
      output: { label: 'Chance of meeting the demonstration threshold after one attempt', value: i === 2 ? 'Unclear' : i === 0 ? 'Moderate' : 'Low', range: null },
      uncertainty: i === 2 ? 'High: initial capacity is near the edge of the training range; few comparable records.' : 'Moderate: trained on a small synthetic sample; selection bias not corrected.',
      applicability: { inScope: true, note: 'Within family and rating conditions of the synthetic reference set.' },
      sourceRecordIds: [t?.id ?? 'test', b.id], factors: ['Initial capacity vs rated', 'Internal resistance', 'Intake inspection notes'],
      baseline: 'Engineering rule: restore only if initial capacity is above the configured candidate floor.',
      inputsUsed: 'Intake metadata and initial test only. Post-restoration results are excluded because they do not exist at decision time.',
      reviewState: i === 0 ? 'agreed' : 'unreviewed', reviewedByName: i === 0 ? 'Hamid Rahimi' : null, inputAgoH: 20 });
  });
  [b1p2, b1p4, b3p2].filter(Boolean).forEach((b, i) => {
    mkPred({ kind: 'capacity_estimate', batteryId: b.id, siteId: b.siteId, modelName: 'capacity-estimator', modelVersion: '0.1.4-shadow',
      output: { label: 'Estimated capacity (C10, 25 \u00b0C basis)', value: `${round(FAM[b.familyId].ratedCapacityAh * (0.78 + i * 0.04), 0)} Ah`, range: `${round(FAM[b.familyId].ratedCapacityAh * (0.68 + i * 0.04), 0)}\u2013${round(FAM[b.familyId].ratedCapacityAh * (0.9 + i * 0.03), 0)} Ah (interval)` },
      uncertainty: 'Wide interval. Float-service readings carry little discharge information; no recent reference discharge test.',
      applicability: { inScope: i !== 2, note: i === 2 ? 'Outside scope: telemetry is stale and the family is Gel (not in the reference set).' : 'In scope for AGM 12V with at least 14 days of telemetry.' },
      sourceRecordIds: [b.id, 'telemetry:30d'], factors: ['Float voltage stability', 'Resistance trend', 'Temperature history'],
      baseline: 'Last approved reference test capacity, unchanged.',
      inputsUsed: 'Telemetry up to the input timestamp and last approved test.', inputAgoH: 12 });
  });
  [b1p4, b5p1].filter(Boolean).forEach((b, i) => {
    mkPred({ kind: 'failure_risk', batteryId: b.id, siteId: b.siteId, modelName: 'failure-risk-estimator', modelVersion: '0.1.0-shadow',
      output: { label: 'Review priority within 90 days', value: i === 0 ? 'Elevated (qualitative)' : 'Cannot assess', range: null },
      uncertainty: 'Qualitative only. Too few observed failures to calibrate a probability. Units still operating are censored, not counted as successes.',
      applicability: { inScope: i === 0, note: i === 0 ? 'Within AGM reference group.' : 'Outside scope: OPzS family not represented in training data.' },
      sourceRecordIds: [b.id], factors: ['Resistance trend', 'Temperature excursions', 'Service history'],
      baseline: 'Rule: flag if resistance rises by more than the configured percentage over 30 days.',
      inputsUsed: 'Telemetry and service history up to the input timestamp.', inputAgoH: 8 });
  });
  [b3p2, b1p2].filter(Boolean).forEach((b) => {
    mkPred({ kind: 'anomaly_detection', batteryId: b.id, siteId: b.siteId, modelName: 'string-anomaly-detector', modelVersion: '0.2.0-shadow',
      output: { label: 'Deviation from string peers', value: 'Detected', range: 'about 2.6 standard deviations on voltage vs peers' },
      uncertainty: 'Moderate: the peer set is only 3\u20134 units; the deviation may be a charger or sensor effect.',
      applicability: { inScope: true, note: 'Applies to monitored strings with at least 3 mapped units.' },
      sourceRecordIds: [b.id, 'telemetry:7d'], factors: ['Voltage vs string median', 'Temperature vs peers'],
      baseline: 'Rule: voltage outside the configured float band.', inputsUsed: 'Last 7 days of mapped telemetry.', inputAgoH: 5 });
  });
  mkPred({ kind: 'inventory_planning', batteryId: null, siteId: 's5', modelName: 'allocation-planner', modelVersion: '0.1.0-shadow',
    output: { label: 'Qualified or reserved AGM 12V 200Ah units available for Site E (4 needed)', value: `${batteries.filter((b) => ['qualified', 'reserved'].includes(b.lifecycleState) && b.familyId === 'f1').length} available`, range: null },
    uncertainty: 'Depends on pending reviews; units awaiting engineer decision are not counted.',
    applicability: { inScope: true, note: 'Counts qualified and reserved AGM 12V 200Ah units only.' },
    sourceRecordIds: ['inventory:f1', 'RB-2026-09'], factors: ['Qualified stock', 'Awaiting-review queue', 'Planned commissioning date'],
    baseline: 'Count of qualified, unreserved units.', inputsUsed: 'Inventory state at the input timestamp.' });
  mkPred({ kind: 'inventory_planning', batteryId: null, siteId: null, modelName: 'lab-throughput-planner', modelVersion: '0.1.0-shadow',
    output: { label: 'Bench capacity needed for the current review and test queue', value: '6 discharge slots over 5 working days', range: '5\u20139 slots (interval)' },
    uncertainty: 'Assumes constant arrival rate; the lab calendar is not connected.',
    applicability: { inScope: true, note: 'Planning aid only.' }, sourceRecordIds: ['queue:tests'], factors: ['Tests awaiting submission', 'Bench cycle time'],
    baseline: 'Queue length divided by bench count.', inputsUsed: 'Queue snapshot only.' });
  [b4p1, b2p1].filter(Boolean).forEach((b) => {
    mkPred({ kind: 'warranty_risk', batteryId: b.id, siteId: b.siteId, modelName: 'warranty-exposure-estimator', modelVersion: '0.1.0-shadow',
      output: { label: 'Claim likelihood before warranty end', value: 'Insufficient data', range: null },
      uncertainty: 'No claims history for this family; no calibration possible.',
      applicability: { inScope: false, note: 'Family has no recorded claim outcomes.' }, sourceRecordIds: [b.id], factors: ['Warranty window', 'Alert history'],
      baseline: 'Rule: any open alert within 45 days of warranty end triggers review.', inputsUsed: 'Warranty record and alert history.' });
  });

  /* ------------------------------ Misc ------------------------------ */
  const importTemplates = [
    { id: 'tpl_std', name: 'Synovra standard intake', version: 'v1.0', description: 'One row per physical battery, canonical column names.',
      columns: { serial: ['serial', 'manufacturer_serial'], manufacturer: ['manufacturer', 'make'], model: ['model'], voltage: ['rated_voltage', 'voltage_v'], capacity: ['rated_capacity', 'capacity_ah'], manufactured: ['manufacture_date', 'mfg_date'], location: ['location'], acquisition_cost: ['acquisition_cost_aed', 'cost_aed'], legacy_id: ['legacy_id'] } },
    { id: 'tpl_legacy', name: 'Legacy lab spreadsheet', version: 'v0.3', description: 'Older column names and mixed units from the 2025 lab sheet.',
      columns: { serial: ['Serial No', 'serial no'], manufacturer: ['Make'], model: ['Type'], voltage: ['V'], capacity: ['Ah'], manufactured: ['Date of Mfg'], location: ['Rack'], acquisition_cost: ['Cost (AED)'], legacy_id: ['Lab ID'] } },
  ];

  /* ------------------------------ Batch-level costs & string tests ------------------------------ */
  batches.forEach((bt, bi) => {
    const members = batteries.filter((b) => b.restorationBatchId === bt.id);
    const n = Math.max(members.length, 1);
    const qualified = members.filter((b) => ['qualified', 'reserved', 'deployed', 'returned'].includes(b.lifecycleState) || recycling.some((r) => r.batteryId === b.id && r.state === 'recycled')).length;
    const mk = (kind: CostEntry['kind'], amount: number | null, allocation: CostEntry['allocation'], note: string, basis: string | null) =>
      costs.push({ id: `cost_${costs.length + 1}`, batteryId: null, batchId: bt.id, kind, amountAed: amount, allocation, recordedOn: bt.openedOn, note, source: costSource(allocation), allocationBasis: basis });
    mk('collection', bt.id === 'RB-2026-10' ? null : 18 * n, 'allocated', bt.id === 'RB-2026-10' ? 'Collection invoice not yet received' : 'Collection run shared across the batch', 'Equal split across batch intake');
    mk('logistics', 22 * n, 'allocated', 'Inbound transport shared across the batch', 'Equal split across batch intake');
    mk('warranty_provision', 40 * qualified, 'estimate', 'Estimated future warranty cost; not a settled expense', null);
  });

  const stringTests: [string, number, number][] = [['str1', 30, 0.86], ['str5', 55, 0.9]];
  stringTests.forEach(([strId, ago, ratio]) => {
    const st = strings.find((x) => x.id === strId)!;
    const f = FAM[st.familyId];
    const units = strDefs.find((x) => x.id === strId)!.n;
    const evId = addEvidence(null, 'test_report', `string_test_${strId}.pdf`, 'customer_visible', iso(ago, 14), 'Tariq Aziz');
    tests.push({
      id: `test_${tests.length + 1}`, batteryId: null, stringId: strId, level: 'string', kind: 'periodic', protocolId: 'proto_periodic',
      status: 'approved', operatorId: 'u_field1', operatorName: 'Tariq Aziz', witnessName: null,
      instrument: 'String load bank LB-1 (demo)', calibrationRef: 'CAL-DEMO-2026-05',
      conditions: { ambientTempC: 27, loadCurrentA: round(f.ratedCapacityAh / f.rateHours, 1), cutoffVoltageV: round(f.endVoltagePerUnitV * units, 1), durationH: round(f.rateHours * ratio, 1) },
      result: { openCircuitVoltageV: round(st.nominalVoltageV * 1.08, 1), internalResistanceMOhm: null, temperatureC: 27, capacityAh: round(f.ratedCapacityAh * ratio, 1), notes: 'String-level result. It does not establish a capacity for any individual battery.' },
      evidenceIds: [evId], attemptId: null, startedAt: iso(ago, 9), submittedAt: iso(ago, 14), submittedById: 'u_field1',
      reviewedAt: iso(ago, 16), reviewerId: 'u_eng1', reviewerName: 'Hamid Rahimi', reviewReason: 'Conditions per protocol; result recorded at string level.',
    });
  });

  // alert and service events on battery timelines
  alerts.filter((a) => a.batteryId).forEach((a) => {
    const t = Math.max(0, (NOW - Date.parse(a.createdAt)) / DAY);
    pushEventFor(a.batteryId!, 'alert', t, 'system', `${a.title}`, `${a.id}: ${a.detail}`, { sourceSystem: a.source.kind === 'model' ? 'Model (shadow mode)' : 'Rule engine', approvalState: 'not_required', ref: { kind: 'alert', id: a.id } });
  });
  tasks.filter((t) => t.batteryId && ['done', 'in_progress'].includes(t.status)).forEach((t) => {
    const ago = Math.max(0, (NOW - Date.parse(t.createdAt)) / DAY - 0.2);
    pushEventFor(t.batteryId!, 'service', ago, { id: t.assigneeId ?? 'u_field1', name: t.assigneeId ? (U[t.assigneeId]?.name ?? 'Field team') : 'Field team' },
      t.status === 'done' ? 'Service action completed' : 'Service action in progress', `${t.id}: ${t.title}`, { sourceSystem: 'Service tasks (demo)', ref: { kind: 'task', id: t.id } });
  });

  const db: DemoDb = {
    tenants, users, families, batteries, aliases, sites, banks, strings, slots, assignments,
    gateways, sensors, sensorAssignments, events: events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    protocols, tests, batches, attempts, costs, warranties, recycling, evidence,
    alerts, tasks, predictions, reports: [], imports: [], importTemplates,
    notifications: [
      { id: 'n1', label: 'Critical alert raised', channel: 'email', enabled: true },
      { id: 'n2', label: 'Test submitted for review', channel: 'in_app', enabled: true },
      { id: 'n3', label: 'Warranty window within 45 days', channel: 'email', enabled: true },
      { id: 'n4', label: 'Gateway stale for more than 3 intervals', channel: 'in_app', enabled: true },
      { id: 'n5', label: 'Import committed with quarantined rows', channel: 'in_app', enabled: false },
    ],
    audit: [],
  };

  // seed audit trail from a representative subset of events
  db.audit = events
    .filter((e) => ['approval', 'rejection', 'deployment', 'rework'].includes(e.type))
    .slice(-14)
    .map((e, i) => ({
      id: `aud_${i + 1}`, at: e.recordedAt, actorId: e.actorId, actorName: e.actorName,
      role: (users.find((u) => u.id === e.actorId)?.role ?? 'system') as User['role'] | 'system',
      action: `lifecycle.${e.type}`, entityKind: 'battery', entityId: e.batteryId, summary: e.title, outcome: 'success' as const,
    }));
  return db;
}

/* ------------------------------ Telemetry generator ------------------------------ */

/** Deterministic 15-minute telemetry for 30 days, ending at each gateway's last-seen time. */
export function buildTelemetry(db: DemoDb): TelemetryObservation[] {
  const rnd = mulberry32(777);
  const out: TelemetryObservation[] = [];
  const famOfString = new Map(db.strings.map((s) => [s.id, s.familyId]));
  const gwById = new Map(db.gateways.map((g) => [g.id, g]));
  const STEP = 15 * 60_000;
  const STEPS = 30 * 24 * 4;
  for (const sa of db.sensorAssignments) {
    if (sa.endAt || !sa.slotId) continue;
    const sensor = db.sensors.find((s) => s.id === sa.sensorId)!;
    const slot = db.slots.find((s) => s.id === sa.slotId)!;
    const asg = db.assignments.find((a) => a.slotId === slot.id && !a.endAt);
    if (!asg) continue;
    const gw = gwById.get(sensor.gatewayId)!;
    const fam = famOfString.get(slot.stringId)!;
    const lastSeen = Date.parse(gw.lastSeenAt);
    const v12 = fam !== 'f2';
    const floatV = fam === 'f2' ? 2.23 : 13.58;
    const baseR = fam === 'f2' ? 0.36 : fam === 'f3' ? 3.7 : 2.9;
    const key = `${slot.stringId}-p${slot.position}`;
    const lowVoltage = key === 'str1-p2';
    const risingR = key === 'str1-p4';
    const hotTemp = key === 'str5-p1';
    const silentLastDays = key === 'str5-p3';
    for (let h = STEPS; h >= 0; h--) {
      const t = lastSeen - h * STEP;
      const d = new Date(t);
      const hourOfDay = d.getUTCHours() + d.getUTCMinutes() / 60;
      const diurnal = Math.sin(((hourOfDay - 8) / 24) * Math.PI * 2) * 1.6;
      const progress = (STEPS - h) / STEPS;
      let volt = floatV + (rnd() - 0.5) * (v12 ? 0.05 : 0.006);
      if (lowVoltage) volt -= progress > 0.8 ? (progress - 0.8) * (v12 ? 1.0 : 0.1) : 0;
      let temp = 26 + diurnal + (rnd() - 0.5) * 0.6;
      if (hotTemp) temp += progress > 0.9 ? 9 : 0;
      let res: number | null =
        sensor.resistanceSource !== 'unavailable' && hourOfDay === 4
          ? baseR * (1 + (risingR ? progress * 0.14 : progress * 0.02) + (rnd() - 0.5) * 0.02)
          : null;
      let quality: TelemetryObservation['quality'] = 'measured';
      if (silentLastDays && t > lastSeen - 48 * 3_600_000) quality = 'missing';
      if (rnd() < 0.003) quality = 'missing';
      if (quality === 'missing') { res = null; }
      out.push({
        t: new Date(t).toISOString(), sensorId: sensor.id, batteryId: asg.batteryId,
        voltageV: quality === 'missing' ? null : Math.round(volt * 1000) / 1000,
        temperatureC: quality === 'missing' ? null : Math.round(temp * 10) / 10,
        resistanceMOhm: res === null ? null : Math.round(res * 100) / 100,
        quality,
      });
    }
  }
  return out;
}

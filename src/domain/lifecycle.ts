import type { DataQuality, DataQualityLevel, Battery, BatteryFamily, BatteryAlias, LifecycleState } from './types';

export const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  received: 'Received',
  testing: 'Testing',
  restoration_candidate: 'Restoration candidate',
  in_restoration: 'In restoration',
  awaiting_review: 'Awaiting review',
  rework: 'Rework',
  qualified: 'Qualified',
  reserved: 'Reserved',
  deployed: 'Deployed',
  returned: 'Returned',
  rejected: 'Rejected',
  recycling_queue: 'Recycling queue',
  recycled: 'Recycled',
};

export const LIFECYCLE_ORDER: LifecycleState[] = [
  'received', 'testing', 'restoration_candidate', 'in_restoration', 'awaiting_review',
  'rework', 'qualified', 'reserved', 'deployed', 'returned', 'rejected', 'recycling_queue', 'recycled',
];

/**
 * What a person would do next, from the lifecycle state alone. A fixed rule, not a model and not a diagnosis:
 * it never reads a measurement. The passport adds what an open alert or stale telemetry change.
 */
export const NEXT_STEP_BY_STATE: Record<LifecycleState, string> = {
  received: 'Record an intake inspection and an initial capacity test.',
  testing: 'Submit the test for an engineer’s review.',
  restoration_candidate: 'Open a restoration attempt in a batch for this family.',
  in_restoration: 'Finish the attempt, then record and submit the after-test.',
  awaiting_review: 'Waiting for an engineer’s qualification decision.',
  rework: 'Start a further restoration attempt, or reject.',
  qualified: 'Ready to reserve or deploy to a compatible slot.',
  reserved: 'Install at the planned site and record the slot.',
  deployed: 'In service. Nothing needs doing now.',
  returned: 'Test it again before any reuse.',
  rejected: 'Move to the recycling queue.',
  recycling_queue: 'Hand over to a licensed recycler and file the certificate.',
  recycled: 'Closed. Nothing more to do.',
};

/** Where the record itself is in doubt, that comes first: nothing else is reliable until it is settled. */
export function nextStepFor(state: LifecycleState, quality?: { level: DataQualityLevel }): { text: string; attention: boolean } {
  if (quality?.level === 'conflict') return { text: 'Resolve the identity conflict first.', attention: true };
  const attention = state === 'awaiting_review' || state === 'returned' || state === 'rework';
  return { text: NEXT_STEP_BY_STATE[state], attention };
}

/** Allowed transitions. Anything not listed is rejected by the service layer. */
export const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  received: ['testing', 'recycling_queue'],
  testing: ['restoration_candidate', 'qualified', 'rejected', 'testing'],
  restoration_candidate: ['in_restoration', 'rejected', 'testing'],
  in_restoration: ['awaiting_review'],
  awaiting_review: ['qualified', 'rejected', 'rework'],
  rework: ['in_restoration', 'rejected', 'testing'],
  qualified: ['reserved', 'deployed', 'testing', 'recycling_queue'],
  reserved: ['deployed', 'qualified'],
  deployed: ['returned'],
  returned: ['testing', 'recycling_queue'],
  rejected: ['recycling_queue'],
  recycling_queue: ['recycled'],
  recycled: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Inventory board groups, mutually exclusive. See README for the mapping rationale. */
export type InventoryGroup =
  | 'available'
  | 'testing'
  | 'qualified'
  | 'reserved'
  | 'deployed'
  | 'returned'
  | 'recycling_queue'
  | 'closed';

export const INVENTORY_GROUP_LABELS: Record<InventoryGroup, string> = {
  available: 'Available',
  testing: 'Testing & restoration',
  qualified: 'Qualified',
  reserved: 'Reserved',
  deployed: 'Deployed',
  returned: 'Returned',
  recycling_queue: 'Recycling queue',
  closed: 'Closed (rejected / recycled)',
};

export const INVENTORY_GROUP_HINTS: Record<InventoryGroup, string> = {
  available: 'Received stock on hand, not yet tested',
  testing: 'In the lab pipeline, not yet qualified',
  qualified: 'Approved and unassigned, ready to allocate',
  reserved: 'Held for a planned deployment',
  deployed: 'Assigned to a site slot',
  returned: 'Back from site, awaiting disposition',
  recycling_queue: 'Awaiting consignment to a recycler',
  closed: 'Rejected or recycled; history retained',
};

export function inventoryGroupOf(state: LifecycleState): InventoryGroup {
  switch (state) {
    case 'received': return 'available';
    case 'testing':
    case 'restoration_candidate':
    case 'in_restoration':
    case 'awaiting_review':
    case 'rework': return 'testing';
    case 'qualified': return 'qualified';
    case 'reserved': return 'reserved';
    case 'deployed': return 'deployed';
    case 'returned': return 'returned';
    case 'recycling_queue': return 'recycling_queue';
    default: return 'closed';
  }
}

/**
 * Who holds each serial and each alias value (lower-cased), built once so that checking every battery for a
 * duplicate costs one lookup each instead of a scan of every other battery. Build it fresh for each pass over
 * the register: a correction can change a serial, so an index must not outlive the request that built it.
 */
export interface QualityIndex {
  serials: Map<string, string[]>;
  aliasValues: Map<string, string[]>;
}
export function buildQualityIndex(batteries: Battery[], aliases: BatteryAlias[]): QualityIndex {
  const add = (m: Map<string, string[]>, key: string, id: string) => { const l = m.get(key); if (l) l.push(id); else m.set(key, [id]); };
  const serials = new Map<string, string[]>();
  const aliasValues = new Map<string, string[]>();
  for (const b of batteries) if (b.manufacturerSerial) add(serials, b.manufacturerSerial.toLowerCase(), b.id);
  for (const a of aliases) add(aliasValues, a.value.toLowerCase(), a.batteryId);
  return { serials, aliasValues };
}

/** Explainable data-quality: lists exactly what is missing instead of a single score. */
export function assessDataQuality(
  battery: Battery,
  family: BatteryFamily | undefined,
  aliases: BatteryAlias[],
  allBatteries: Battery[],
  allAliases: BatteryAlias[],
  hasApprovedTest: boolean,
  index?: QualityIndex,
): DataQuality {
  const other = (ids: string[] | undefined) => !!ids && ids.some((id) => id !== battery.id);
  const missing: string[] = [];
  const conflicts: string[] = [];
  if (!battery.manufacturerSerial) missing.push('Manufacturer serial');
  if (!battery.manufacturedOn) missing.push('Manufacture date');
  if (!family) missing.push('Battery family');
  if (!hasApprovedTest && !['received', 'testing'].includes(battery.lifecycleState)) missing.push('Approved test');

  if (battery.manufacturerSerial) {
    const dup = index
      ? other(index.serials.get(battery.manufacturerSerial.toLowerCase()))
      : allBatteries.some((b) => b.id !== battery.id && b.manufacturerSerial?.toLowerCase() === battery.manufacturerSerial!.toLowerCase());
    if (dup) conflicts.push(`Serial ${battery.manufacturerSerial} is also recorded on another battery record`);
  }
  for (const alias of aliases) {
    const clash = index
      ? other(index.aliasValues.get(alias.value.toLowerCase()))
      : allAliases.some((a) => a.batteryId !== battery.id && a.value.toLowerCase() === alias.value.toLowerCase());
    if (clash) conflicts.push(`Alias ${alias.value} is also used by another battery record`);
  }
  for (const alias of aliases) {
    const serialClash = index
      ? other(index.serials.get(alias.value.toLowerCase()))
      : allBatteries.some((b) => b.id !== battery.id && b.manufacturerSerial?.toLowerCase() === alias.value.toLowerCase());
    if (serialClash) conflicts.push(`Alias ${alias.value} matches the serial of another battery record`);
  }

  const level = conflicts.length ? 'conflict' : missing.length === 0 ? 'complete' : missing.length <= 1 ? 'partial' : 'incomplete';
  return { level, missing, conflicts };
}

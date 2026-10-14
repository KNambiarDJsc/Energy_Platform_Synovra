import type { DataQuality, Battery, BatteryFamily, BatteryAlias, LifecycleState } from './types';

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

/** Explainable data-quality: lists exactly what is missing instead of a single score. */
export function assessDataQuality(
  battery: Battery,
  family: BatteryFamily | undefined,
  aliases: BatteryAlias[],
  allBatteries: Battery[],
  allAliases: BatteryAlias[],
  hasApprovedTest: boolean,
): DataQuality {
  const missing: string[] = [];
  const conflicts: string[] = [];
  if (!battery.manufacturerSerial) missing.push('Manufacturer serial');
  if (!battery.manufacturedOn) missing.push('Manufacture date');
  if (!family) missing.push('Battery family');
  if (!hasApprovedTest && !['received', 'testing'].includes(battery.lifecycleState)) missing.push('Approved test');

  if (battery.manufacturerSerial) {
    const dup = allBatteries.find(
      (b) => b.id !== battery.id && b.manufacturerSerial?.toLowerCase() === battery.manufacturerSerial!.toLowerCase(),
    );
    if (dup) conflicts.push(`Serial ${battery.manufacturerSerial} is also recorded on another battery record`);
  }
  for (const alias of aliases) {
    const clash = allAliases.find((a) => a.batteryId !== battery.id && a.value.toLowerCase() === alias.value.toLowerCase());
    if (clash) conflicts.push(`Alias ${alias.value} is also used by another battery record`);
  }
  for (const alias of aliases) {
    const serialClash = allBatteries.find(
      (b) => b.id !== battery.id && b.manufacturerSerial?.toLowerCase() === alias.value.toLowerCase(),
    );
    if (serialClash) conflicts.push(`Alias ${alias.value} matches the serial of another battery record`);
  }

  const level = conflicts.length ? 'conflict' : missing.length === 0 ? 'complete' : missing.length <= 1 ? 'partial' : 'incomplete';
  return { level, missing, conflicts };
}

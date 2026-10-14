import type { Actor, Role } from './types';

export type Permission =
  | 'battery.read'
  | 'battery.create'
  | 'battery.import'
  | 'battery.export'
  | 'battery.correct'
  | 'test.read'
  | 'test.create'
  | 'test.review'
  | 'restoration.read'
  | 'restoration.write'
  | 'restoration.review'
  | 'inventory.read'
  | 'deployment.write'
  | 'telemetry.read'
  | 'alert.read'
  | 'alert.act'
  | 'alert.assign'
  | 'task.write'
  | 'cost.read'
  | 'warranty.read'
  | 'prediction.read'
  | 'report.generate'
  | 'report.internal'
  | 'report.approve'
  | 'assistant.use'
  | 'admin.read'
  | 'admin.manage'
  | 'audit.read'
  | 'process.controlled';

const MATRIX: Record<Role, Permission[]> = {
  lab_operator: [
    'battery.read', 'battery.create', 'battery.import', 'battery.export',
    'test.read', 'test.create',
    'restoration.read', 'restoration.write',
    'inventory.read', 'warranty.read', 'assistant.use', 'process.controlled',
  ],
  battery_engineer: [
    'battery.read', 'battery.create', 'battery.import', 'battery.export', 'battery.correct',
    'test.read', 'test.create', 'test.review',
    'restoration.read', 'restoration.write', 'restoration.review',
    'inventory.read', 'deployment.write', 'telemetry.read',
    'alert.read', 'alert.act', 'warranty.read', 'prediction.read',
    'report.generate', 'report.internal', 'report.approve',
    'assistant.use', 'audit.read', 'process.controlled',
  ],
  field_technician: [
    'battery.read', 'test.read', 'inventory.read', 'deployment.write',
    'telemetry.read', 'alert.read', 'alert.act', 'task.write', 'assistant.use',
  ],
  noc_manager: [
    'battery.read', 'battery.export', 'test.read', 'inventory.read', 'deployment.write',
    'telemetry.read', 'alert.read', 'alert.act', 'alert.assign', 'task.write',
    'warranty.read', 'prediction.read', 'report.generate', 'assistant.use',
  ],
  finance_owner: [
    'battery.read', 'battery.export', 'test.read', 'restoration.read', 'inventory.read',
    'cost.read', 'warranty.read', 'prediction.read',
    'report.generate', 'report.internal', 'assistant.use',
  ],
  customer_auditor: [
    'battery.read', 'test.read', 'inventory.read', 'telemetry.read', 'alert.read',
    'warranty.read', 'report.generate', 'assistant.use',
  ],
  // Administrators manage the platform. They deliberately cannot approve qualification.
  platform_admin: [
    'battery.read', 'test.read', 'restoration.read', 'inventory.read', 'telemetry.read',
    'alert.read', 'warranty.read', 'prediction.read', 'report.generate',
    'battery.correct', 'admin.read', 'admin.manage', 'audit.read',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

export const ROLE_LABELS: Record<Role, string> = {
  lab_operator: 'Lab operator',
  battery_engineer: 'Battery engineer',
  field_technician: 'Field technician',
  noc_manager: 'NOC / service manager',
  finance_owner: 'Finance / business owner',
  customer_auditor: 'Customer / auditor',
  platform_admin: 'Platform administrator',
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  lab_operator: 'Records intake and tests, runs restoration attempts. Cannot approve qualification.',
  battery_engineer: 'Reviews tests, approves or rejects qualification, approves reports.',
  field_technician: 'Moves batteries between slots, works alerts and tasks at assigned sites.',
  noc_manager: 'Monitors the fleet, assigns alerts, creates service tasks.',
  finance_owner: 'Sees costs, warranty and internal reports. No approval authority.',
  customer_auditor: 'Read-only view of own-tenant batteries, with internal costs and process data hidden.',
  platform_admin: 'Manages users, mappings and templates. Cannot approve qualification.',
};

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(public permission: Permission | string, message?: string) {
    super(message ?? `Your role does not have permission: ${permission}`);
    this.name = 'ForbiddenError';
  }
}
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(what: string) {
    super(`${what} was not found or is outside your access scope.`);
    this.name = 'NotFoundError';
  }
}
export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  constructor(message: string, public issues: string[] = []) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function canActorSeeSite(actor: Actor, siteId: string | null): boolean {
  if (actor.siteScope === 'all') return true;
  if (siteId === null) return false;
  return actor.siteScope.includes(siteId);
}

/** Customer-audience roles never see internal commercial or process data. */
export function isCustomerAudience(role: Role): boolean {
  return role === 'customer_auditor';
}

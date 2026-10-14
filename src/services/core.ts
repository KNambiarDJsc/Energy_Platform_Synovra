import type { Store } from '@/data/store';
import { QUALIFICATION_THRESHOLD_PCT } from '@/data/seed';
import { assessDataQuality } from '@/domain/lifecycle';
import {
  ForbiddenError, NotFoundError, can, canActorSeeSite, isCustomerAudience, type Permission,
} from '@/domain/permissions';
import type {
  Actor, Battery, BatteryFamily, DataQuality, DemoDb, LifecycleEvent, LifecycleEventType, LifecycleState,
  Role, Site, TestSession,
} from '@/domain/types';

export interface Ctx {
  store: Store;
  actor(): Actor;
}

export const db = (ctx: Ctx): DemoDb => ctx.store.db;

export async function latency(ctx: Ctx): Promise<void> {
  if (ctx.store.latencyMs > 0) await new Promise((r) => setTimeout(r, ctx.store.latencyMs));
}

export function audit(ctx: Ctx, action: string, entityKind: string, entityId: string, summary: string, outcome: 'success' | 'denied' = 'success') {
  const a = ctx.actor();
  ctx.store.db.audit.unshift({
    id: ctx.store.nextId('aud'), at: ctx.store.now(), actorId: a.userId, actorName: a.name, role: a.role,
    action, entityKind, entityId, summary, outcome,
  });
}

/** Service-layer authorisation. The role switcher in the UI is a demo convenience; this is the control. */
export function authorize(ctx: Ctx, permission: Permission): Actor {
  const actor = ctx.actor();
  if (!can(actor.role, permission)) {
    audit(ctx, 'authz.denied', 'permission', permission, `Denied ${permission} for ${actor.role}`, 'denied');
    ctx.store.save();
    throw new ForbiddenError(permission);
  }
  return actor;
}

export function familyOf(ctx: Ctx, b: Battery): BatteryFamily {
  const f = ctx.store.db.families.find((x) => x.id === b.familyId);
  if (!f) throw new NotFoundError(`Battery family ${b.familyId}`);
  return f;
}

export function siteName(ctx: Ctx, siteId: string | null): string | null {
  if (!siteId) return null;
  return ctx.store.db.sites.find((s) => s.id === siteId)?.name ?? null;
}

export function pctOfRated(capacityAh: number | null, ratedAh: number): number | null {
  if (capacityAh === null || capacityAh === undefined) return null;
  return Math.round((capacityAh / ratedAh) * 1000) / 10;
}

/** The demo threshold rule check. It is a rule result, never an approval. */
export function ruleCheck(test: TestSession | null | undefined, family: BatteryFamily) {
  if (!test || test.result.capacityAh === null) return { state: 'unknown' as const, pct: null, label: 'No capacity result' };
  const pct = pctOfRated(test.result.capacityAh, family.ratedCapacityAh)!;
  return {
    state: pct >= QUALIFICATION_THRESHOLD_PCT ? ('meets' as const) : ('below' as const),
    pct,
    label: pct >= QUALIFICATION_THRESHOLD_PCT
      ? `${pct}% of rated — meets the ${QUALIFICATION_THRESHOLD_PCT}% demonstration threshold`
      : `${pct}% of rated — below the ${QUALIFICATION_THRESHOLD_PCT}% demonstration threshold`,
  };
}

/* ------------------------------ Scope ------------------------------ */

function everSites(d: DemoDb, batteryId: string): string[] {
  const slotSite = new Map(d.slots.map((s) => [s.id, s.siteId]));
  return d.assignments.filter((a) => a.batteryId === batteryId).map((a) => slotSite.get(a.slotId)!).filter(Boolean);
}

/** A battery is visible when it is in scope for the actor. Customers see only units that served their sites. */
export function canSeeBattery(ctx: Ctx, b: Battery): boolean {
  const actor = ctx.actor();
  const d = ctx.store.db;
  if (isCustomerAudience(actor.role)) {
    const sites = everSites(d, b.id);
    return sites.some((sid) => canActorSeeSite(actor, sid) && d.sites.find((s) => s.id === sid)?.tenantId === actor.tenantId);
  }
  if (actor.siteScope === 'all') return true;
  if (b.siteId) return canActorSeeSite(actor, b.siteId);
  // Field staff can see stock that is available to deploy.
  return ['qualified', 'reserved', 'returned'].includes(b.lifecycleState);
}

export function canSeeSite(ctx: Ctx, site: Site): boolean {
  const actor = ctx.actor();
  if (isCustomerAudience(actor.role) && site.tenantId !== actor.tenantId) return false;
  return canActorSeeSite(actor, site.id);
}

export function getBatteryOrThrow(ctx: Ctx, id: string): Battery {
  const b = ctx.store.db.batteries.find((x) => x.id === id);
  if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Battery');
  return b;
}

/* ------------------------------ Derived fields ------------------------------ */

export function lastApprovedTest(d: DemoDb, batteryId: string): TestSession | null {
  const list = d.tests
    .filter((t) => t.batteryId === batteryId && t.status === 'approved')
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''));
  return list[0] ?? null;
}

export function qualityOf(ctx: Ctx, b: Battery): DataQuality {
  const d = ctx.store.db;
  return assessDataQuality(
    b, d.families.find((f) => f.id === b.familyId),
    d.aliases.filter((a) => a.batteryId === b.id), d.batteries, d.aliases,
    !!lastApprovedTest(d, b.id),
  );
}

export type EvidenceStatusCode =
  | 'not_tested' | 'initial_tested' | 'test_pending' | 'engineering_review' | 'qualified'
  | 'not_qualified' | 'warranty_investigation' | 'closed';

export function evidenceStatus(d: DemoDb, b: Battery): { code: EvidenceStatusCode; label: string; detail: string } {
  const tests = d.tests.filter((t) => t.batteryId === b.id);
  const claim = d.warranties.find((w) => w.batteryId === b.id && w.state === 'claim_open');
  if (claim) return { code: 'warranty_investigation', label: 'Warranty investigation', detail: 'An open warranty claim is linked to this battery.' };
  if (b.lifecycleState === 'recycled') return { code: 'closed', label: 'Closed — recycled', detail: 'Battery consigned for recycling. History retained.' };
  if (b.lifecycleState === 'rejected') return { code: 'not_qualified', label: 'Not qualified', detail: 'Rejected by an engineer. No deployment permitted.' };
  if (b.lifecycleState === 'awaiting_review') return { code: 'engineering_review', label: 'Engineering review', detail: 'Post-restoration test awaiting engineer decision.' };
  if (['qualified', 'reserved', 'deployed', 'returned'].includes(b.lifecycleState) && tests.some((t) => t.kind === 'final' && t.status === 'approved')) {
    return { code: 'qualified', label: 'Qualified under protocol', detail: 'Approved final test on record under the placeholder C10 protocol and the demonstration threshold.' };
  }
  if (tests.some((t) => ['draft', 'submitted', 'under_review'].includes(t.status))) return { code: 'test_pending', label: 'Test pending review', detail: 'A test record exists but is not yet approved.' };
  if (tests.length === 0) return { code: 'not_tested', label: 'Not tested', detail: 'No test on record. No capacity or health value is shown.' };
  return { code: 'initial_tested', label: 'Initial test only', detail: 'Initial test approved; not yet qualified.' };
}

/** Source-system label for records written by the platform. Demo records are marked as such. */
export function sourceName(ctx: Ctx, base: string): string {
  return ctx.store.mode === 'pilot' ? base : `${base} (demo)`;
}

export function pushEvent(
  ctx: Ctx, batteryId: string, type: LifecycleEventType, title: string, reason: string,
  o: Partial<LifecycleEvent> = {},
): LifecycleEvent {
  const a = ctx.actor();
  const now = ctx.store.now();
  const e: LifecycleEvent = {
    id: ctx.store.nextId('evt'), batteryId, type, occurredAt: now, dateCertainty: 'exact', recordedAt: now,
    actorId: a.userId, actorName: a.name, title, reason, evidenceIds: [], approvalState: 'not_required',
    sourceSystem: sourceName(ctx, 'Synovra platform'), previousState: null, newState: null, ref: null, ...o,
  };
  ctx.store.db.events.push(e);
  return e;
}

export function setState(ctx: Ctx, b: Battery, next: LifecycleState) {
  b.lifecycleState = next;
  b.updatedAt = ctx.store.now();
}

export function hashText(text: string): string {
  // FNV-1a, two lanes. Used only as a demo integrity fingerprint, not for security.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + text.length.toString(16).padStart(4, '0');
}

export function roleOf(ctx: Ctx): Role {
  return ctx.actor().role;
}

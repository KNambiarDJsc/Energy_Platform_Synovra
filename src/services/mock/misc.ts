import { ConflictError, NotFoundError, canActorSeeSite, isCustomerAudience } from '@/domain/permissions';
import type { LifecycleState } from '@/domain/types';
import {
  audit, canSeeBattery, canSeeSite, db, latency, qualityOf, authorize, type Ctx,
} from '../core';
import type { AdminRepository, OverviewData, OverviewRepository, PredictionRepository, PredictionView } from '../types';
import { ACTIVE_ALERT_STATES } from './alerts';

export function createPredictionRepository(ctx: Ctx): PredictionRepository {
  return {
    async list(filter = {}) {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const d = db(ctx);
      return d.predictions
        .filter((p) => {
          if (filter.kind && p.kind !== filter.kind) return false;
          if (filter.batteryId && p.batteryId !== filter.batteryId) return false;
          if (p.batteryId) {
            const b = d.batteries.find((x) => x.id === p.batteryId);
            if (!b || !canSeeBattery(ctx, b)) return false;
          } else if (p.siteId) {
            const s = d.sites.find((x) => x.id === p.siteId);
            if (!s || !canSeeSite(ctx, s)) return false;
          }
          return true;
        })
        .map<PredictionView>((p) => ({
          ...p,
          batteryLabel: p.batteryId ? d.batteries.find((b) => b.id === p.batteryId)?.label ?? null : null,
          siteName: p.siteId ? d.sites.find((s) => s.id === p.siteId)?.name ?? null : null,
        }));
    },
    async review(id, outcome) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.review');
      const p = db(ctx).predictions.find((x) => x.id === id);
      if (!p) throw new NotFoundError('Prediction');
      p.reviewState = outcome;
      p.reviewedByName = actor.name;
      audit(ctx, 'prediction.review', 'prediction', p.id, `Human review: ${outcome}. Status remains ${p.status}.`);
      ctx.store.save();
      return p;
    },
  };
}

export function createAdminRepository(ctx: Ctx): AdminRepository {
  return {
    async users() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).users; },
    async tenants() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).tenants; },
    async sites() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).sites; },
    async families() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).families; },
    async protocols() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).protocols; },
    async importTemplates() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).importTemplates; },
    async notifications() { await latency(ctx); authorize(ctx, 'admin.read'); return db(ctx).notifications; },
    async sensorMappings() {
      await latency(ctx);
      authorize(ctx, 'admin.read');
      const d = db(ctx);
      return d.sensorAssignments.map((assignment) => {
        const sensor = d.sensors.find((s) => s.id === assignment.sensorId)!;
        const gw = d.gateways.find((g) => g.id === sensor.gatewayId)!;
        const slot = assignment.slotId ? d.slots.find((s) => s.id === assignment.slotId) : null;
        return {
          assignment, sensor, siteName: d.sites.find((s) => s.id === gw.siteId)!.name,
          slotLabel: slot ? `${d.strings.find((s) => s.id === slot.stringId)?.name} / pos ${slot.position}` : null,
        };
      });
    },
    async setNotification(id, enabled) {
      await latency(ctx);
      authorize(ctx, 'admin.manage');
      const n = db(ctx).notifications.find((x) => x.id === id);
      if (!n) throw new NotFoundError('Notification setting');
      n.enabled = enabled;
      audit(ctx, 'admin.notification', 'notification', id, `${n.label}: ${enabled ? 'on' : 'off'}`);
      ctx.store.save();
      return n;
    },
    async setUserActive(id, active) {
      await latency(ctx);
      const actor = authorize(ctx, 'admin.manage');
      const u = db(ctx).users.find((x) => x.id === id);
      if (!u) throw new NotFoundError('User');
      if (u.id === actor.userId && !active) throw new ConflictError('You cannot deactivate your own account.');
      u.active = active;
      audit(ctx, 'admin.user_active', 'user', id, `${u.name}: ${active ? 'activated' : 'deactivated'}`);
      ctx.store.save();
      return u;
    },
    async audit(filter = {}) {
      await latency(ctx);
      authorize(ctx, 'audit.read');
      return db(ctx).audit.filter((a) => !filter.outcome || a.outcome === filter.outcome).slice(0, 300);
    },
    async resetDemo() {
      await latency(ctx);
      authorize(ctx, 'admin.manage');
      ctx.store.reset();
    },
  };
}

export function createOverviewRepository(ctx: Ctx): OverviewRepository {
  return {
    async get(): Promise<OverviewData> {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      const d = db(ctx);
      const actor = ctx.actor();
      const batteries = d.batteries.filter((b) => canSeeBattery(ctx, b));
      const count = (...s: LifecycleState[]) => batteries.filter((b) => s.includes(b.lifecycleState)).length;
      const sites = d.sites.filter((s) => canSeeSite(ctx, s));
      const alerts = d.alerts.filter((a) => {
        const s = d.sites.find((x) => x.id === a.siteId);
        return s && canSeeSite(ctx, s) && !(isCustomerAudience(actor.role) && a.source.kind === 'model');
      });
      const active = alerts.filter((a) => ACTIVE_ALERT_STATES.includes(a.state));
      const q = batteries.map((b) => qualityOf(ctx, b).level);
      const inBatches = d.attempts.filter((a) => batteries.some((b) => b.id === a.batteryId));
      const qualifiedBatteries = new Set(inBatches.filter((a) => a.status === 'approved').map((a) => a.batteryId)).size;
      const attempted = new Set(inBatches.map((a) => a.batteryId)).size;
      const decided = new Set(inBatches.filter((a) => ['approved', 'rejected'].includes(a.status)).map((a) => a.batteryId)).size;

      const states: LifecycleState[] = ['received', 'testing', 'restoration_candidate', 'in_restoration', 'awaiting_review', 'rework', 'qualified', 'reserved', 'deployed', 'returned', 'rejected', 'recycling_queue', 'recycled'];
      const events = d.events.filter((e) => batteries.some((b) => b.id === e.batteryId));
      const snapshot = Date.parse(ctx.store.snapshotAt);
      const weeks = Array.from({ length: 8 }, (_, i) => {
        const end = snapshot - (7 - i) * 7 * 86_400_000;
        const start = end - 7 * 86_400_000;
        const inWeek = events.filter((e) => Date.parse(e.occurredAt) > start && Date.parse(e.occurredAt) <= end);
        return {
          week: new Date(end).toISOString().slice(5, 10),
          received: inWeek.filter((e) => e.type === 'intake').length,
          qualified: inWeek.filter((e) => e.newState === 'qualified').length,
          deployed: inWeek.filter((e) => e.type === 'deployment').length,
        };
      });
      const tasks = d.tasks.filter((t) => { const s = d.sites.find((x) => x.id === t.siteId); return s && canActorSeeSite(actor, s.id); });
      const rank = { critical: 3, warning: 2, info: 1 } as const;
      return {
        totals: {
          batteries: batteries.length,
          testing: count('testing', 'restoration_candidate', 'in_restoration', 'rework'),
          qualified: count('qualified', 'reserved'),
          deployed: count('deployed'),
          needsReview: count('awaiting_review') + d.tests.filter((t) => ['submitted', 'under_review'].includes(t.status) && batteries.some((b) => b.id === t.batteryId) && batteries.find((b) => b.id === t.batteryId)?.lifecycleState !== 'awaiting_review').length,
          activeAlerts: active.length, criticalAlerts: active.filter((a) => a.severity === 'critical').length,
        },
        restoration: { qualified: qualifiedBatteries, attempted, yieldPct: decided ? Math.round((qualifiedBatteries / decided) * 1000) / 10 : null },
        completeness: {
          complete: q.filter((x) => x === 'complete').length, partial: q.filter((x) => x === 'partial').length,
          incomplete: q.filter((x) => x === 'incomplete').length, conflict: q.filter((x) => x === 'conflict').length,
          pctComplete: q.length ? Math.round((q.filter((x) => x === 'complete').length / q.length) * 100) : 0,
        },
        byState: states.map((state) => ({ state, count: count(state) })),
        recent: [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
        workload: ['draft', 'open', 'in_progress', 'done'].map((status) => ({ status, count: tasks.filter((t) => t.status === status).length })),
        siteHealth: sites.map((s) => {
          const siteAlerts = active.filter((a) => a.siteId === s.id);
          const worst = siteAlerts.reduce<'critical' | 'warning' | 'info' | null>((m, a) => (!m || rank[a.severity] > rank[m] ? a.severity : m), null);
          return {
            siteId: s.id, siteName: s.name, batteries: batteries.filter((b) => b.siteId === s.id).length,
            openAlerts: siteAlerts.length, gateway: d.gateways.find((g) => g.siteId === s.id)?.status ?? null, worst,
          };
        }),
        trends: weeks,
        snapshotAt: ctx.store.snapshotAt,
      };
    },
  };
}

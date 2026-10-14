import { reasonSchema, taskInputSchema } from '@/domain/schemas';
import { ConflictError, NotFoundError, ValidationError, isCustomerAudience } from '@/domain/permissions';
import type { Alert, AlertState, ServiceTask } from '@/domain/types';
import { audit, canSeeBattery, canSeeSite, db, latency, authorize, type Ctx } from '../core';
import type { AlertFilters, AlertRepository, AlertView, TaskView } from '../types';

const NEXT: Record<AlertState, AlertState[]> = {
  open: ['acknowledged', 'assigned'],
  acknowledged: ['assigned', 'in_progress', 'resolved'],
  assigned: ['in_progress', 'resolved'],
  in_progress: ['resolved'],
  resolved: ['closed', 'open'],
  closed: [],
};

export const ACTIVE_ALERT_STATES: AlertState[] = ['open', 'acknowledged', 'assigned', 'in_progress'];

export function createAlertRepository(ctx: Ctx): AlertRepository {
  const userName = (id: string | null) => (id ? db(ctx).users.find((u) => u.id === id)?.name ?? null : null);

  const toView = (a: Alert): AlertView => {
    const d = db(ctx);
    const ageMin = Math.max(0, (Date.parse(ctx.store.snapshotAt) - Date.parse(a.lastEvaluatedAt)) / 60_000);
    return {
      ...a,
      siteName: d.sites.find((s) => s.id === a.siteId)?.name ?? a.siteId,
      batteryLabel: a.batteryId ? d.batteries.find((b) => b.id === a.batteryId)?.label ?? null : null,
      assigneeName: userName(a.assigneeId),
      freshness: { label: ageMin < 60 ? `Evaluated ${Math.round(ageMin)} min before snapshot` : `Evaluated ${Math.round(ageMin / 60)} h before snapshot`, stale: ageMin > 90 },
    };
  };

  const alertOrThrow = (id: string): Alert => {
    const d = db(ctx);
    const a = d.alerts.find((x) => x.id === id);
    const site = a ? d.sites.find((s) => s.id === a.siteId) : null;
    if (!a || !site || !canSeeSite(ctx, site)) throw new NotFoundError('Alert');
    if (a.batteryId) {
      const b = d.batteries.find((x) => x.id === a.batteryId);
      if (b && isCustomerAudience(ctx.actor().role) && !canSeeBattery(ctx, b)) throw new NotFoundError('Alert');
    }
    return a;
  };

  function transition(a: Alert, to: AlertState, note: string) {
    if (!NEXT[a.state].includes(to)) throw new ConflictError(`An alert that is "${a.state.replace('_', ' ')}" cannot move to "${to.replace('_', ' ')}".`);
    const actor = ctx.actor();
    a.history.push({ at: ctx.store.now(), actorName: actor.name, from: a.state, to, note });
    a.state = to;
    audit(ctx, `alert.${to}`, 'alert', a.id, note || `Moved to ${to}`);
  }

  return {
    async list(filters: AlertFilters = {}) {
      await latency(ctx);
      authorize(ctx, 'alert.read');
      const d = db(ctx);
      const customer = isCustomerAudience(ctx.actor().role);
      return d.alerts
        .filter((a) => {
          const site = d.sites.find((s) => s.id === a.siteId);
          if (!site || !canSeeSite(ctx, site)) return false;
          if (customer && a.source.kind === 'model') return false;
          if (filters.state && a.state !== filters.state) return false;
          if (filters.severity && a.severity !== filters.severity) return false;
          if (filters.type && a.type !== filters.type) return false;
          if (filters.siteId && a.siteId !== filters.siteId) return false;
          if (filters.active && !ACTIVE_ALERT_STATES.includes(a.state)) return false;
          return true;
        })
        .sort((x, y) => {
          const rank = { critical: 0, warning: 1, info: 2 } as const;
          return rank[x.severity] - rank[y.severity] || y.createdAt.localeCompare(x.createdAt);
        })
        .map((a) => {
          const v = toView(a);
          return customer ? { ...v, assigneeName: null, assigneeId: null } : v;
        });
    },

    async get(id) {
      await latency(ctx);
      authorize(ctx, 'alert.read');
      return toView(alertOrThrow(id));
    },

    async acknowledge(id, note = 'Acknowledged. No battery state change implied.') {
      await latency(ctx);
      authorize(ctx, 'alert.act');
      const a = alertOrThrow(id);
      transition(a, 'acknowledged', note);
      ctx.store.save();
      return a;
    },

    async assign(id, assigneeId, note = 'Assigned for follow-up.') {
      await latency(ctx);
      authorize(ctx, 'alert.assign');
      const a = alertOrThrow(id);
      const u = db(ctx).users.find((x) => x.id === assigneeId && x.active);
      if (!u) throw new NotFoundError('Assignee');
      if (!['field_technician', 'noc_manager', 'battery_engineer'].includes(u.role)) throw new ValidationError('Alerts can only be assigned to field, NOC or engineering staff.');
      if (u.siteScope !== 'all' && !u.siteScope.includes(a.siteId)) throw new ValidationError(`${u.name} is not assigned to this site.`);
      a.assigneeId = u.id;
      transition(a, 'assigned', `${note} Assignee: ${u.name}.`);
      ctx.store.save();
      return a;
    },

    async start(id, note = 'Work started.') {
      await latency(ctx);
      authorize(ctx, 'alert.act');
      const a = alertOrThrow(id);
      transition(a, 'in_progress', note);
      ctx.store.save();
      return a;
    },

    async resolve(id, reason) {
      await latency(ctx);
      authorize(ctx, 'alert.act');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError('A resolution reason is required. ' + r.error.issues[0].message);
      const a = alertOrThrow(id);
      transition(a, 'resolved', r.data);
      a.resolutionReason = r.data;
      ctx.store.save();
      return a;
    },

    async close(id, note = 'Closed after review.') {
      await latency(ctx);
      authorize(ctx, 'alert.act');
      const a = alertOrThrow(id);
      transition(a, 'closed', note);
      ctx.store.save();
      return a;
    },

    async tasks(filter = {}) {
      await latency(ctx);
      authorize(ctx, 'alert.read');
      if (isCustomerAudience(ctx.actor().role)) return [];
      const d = db(ctx);
      return d.tasks
        .filter((t) => {
          const site = d.sites.find((s) => s.id === t.siteId);
          if (!site || !canSeeSite(ctx, site)) return false;
          if (filter.status && t.status !== filter.status) return false;
          if (filter.siteId && t.siteId !== filter.siteId) return false;
          return true;
        })
        .map<TaskView>((t) => ({
          ...t, siteName: d.sites.find((s) => s.id === t.siteId)?.name ?? t.siteId,
          batteryLabel: t.batteryId ? d.batteries.find((b) => b.id === t.batteryId)?.label ?? null : null,
          assigneeName: userName(t.assigneeId),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createTask(input, opts = {}) {
      await latency(ctx);
      const actor = authorize(ctx, 'task.write');
      const parsed = taskInputSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Task is invalid', parsed.error.issues.map((i) => i.message));
      const v = parsed.data;
      const d = db(ctx);
      const site = d.sites.find((s) => s.id === v.siteId);
      if (!site || !canSeeSite(ctx, site)) throw new NotFoundError('Site');
      if (v.batteryId) {
        const b = d.batteries.find((x) => x.id === v.batteryId);
        if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Battery');
      }
      const num = d.tasks.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 200) + 1;
      const task: ServiceTask = {
        id: `TSK-${num}`, alertId: v.alertId ?? null, batteryId: v.batteryId ?? null, siteId: v.siteId, title: v.title,
        description: v.description, status: opts.draft ? 'draft' : 'open', priority: v.priority, assigneeId: v.assigneeId ?? null,
        dueOn: v.dueOn ?? null, createdAt: ctx.store.now(), createdByName: actor.name,
        origin: opts.draft ? 'assistant_draft' : v.alertId ? 'alert' : 'manual',
      };
      d.tasks.push(task);
      audit(ctx, opts.draft ? 'task.draft' : 'task.create', 'task', task.id, task.title);
      ctx.store.save();
      return task;
    },

    async confirmDraft(taskId) {
      await latency(ctx);
      authorize(ctx, 'task.write');
      const t = db(ctx).tasks.find((x) => x.id === taskId);
      const site = t ? db(ctx).sites.find((s) => s.id === t.siteId) : null;
      if (!t || !site || !canSeeSite(ctx, site)) throw new NotFoundError('Task');
      if (t.status !== 'draft') throw new ConflictError('Only a draft task can be confirmed.');
      t.status = 'open';
      audit(ctx, 'task.confirm', 'task', t.id, 'Draft confirmed by a person');
      ctx.store.save();
      return t;
    },

    async updateTask(id, patch) {
      await latency(ctx);
      authorize(ctx, 'task.write');
      const d = db(ctx);
      const t = d.tasks.find((x) => x.id === id);
      const site = t ? d.sites.find((s) => s.id === t.siteId) : null;
      if (!t || !site || !canSeeSite(ctx, site)) throw new NotFoundError('Task');
      if (patch.status) t.status = patch.status;
      if (patch.assigneeId !== undefined) t.assigneeId = patch.assigneeId;
      audit(ctx, 'task.update', 'task', t.id, JSON.stringify(patch));
      ctx.store.save();
      return t;
    },

    async assignees() {
      await latency(ctx);
      authorize(ctx, 'alert.read');
      return db(ctx).users
        .filter((u) => u.active && ['field_technician', 'noc_manager', 'battery_engineer'].includes(u.role))
        .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    },
  };
}

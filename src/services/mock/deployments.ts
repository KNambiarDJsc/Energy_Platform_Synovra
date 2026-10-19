import { deploymentInputSchema, reasonSchema } from '@/domain/schemas';
import { INVENTORY_GROUP_LABELS, inventoryGroupOf, type InventoryGroup } from '@/domain/lifecycle';
import { ConflictError, NotFoundError, ValidationError, canActorSeeSite } from '@/domain/permissions';
import type { Battery, WarrantyRecord } from '@/domain/types';
import {
  audit, canSeeBattery, canSeeSite, db, familyOf, getBatteryOrThrow, latency, pushEvent, qualityIndexFor, authorize, setState, siteName, sourceName,
  type Ctx,
} from '../core';
import type { CompatibilityCheck, DeploymentRepository, DeploymentValidation, InventoryOverview, SiteView } from '../types';
import { toListItem } from './batteries';

const MONTH_MS = 30.4 * 86_400_000;

export function createDeploymentRepository(ctx: Ctx): DeploymentRepository {
  const validate = (batteryId: string, slotId: string): DeploymentValidation => {
    const d = db(ctx);
    const actor = ctx.actor();
    const checks: CompatibilityCheck[] = [];
    const b = getBatteryOrThrow(ctx, batteryId);
    const slot = d.slots.find((s) => s.id === slotId);
    if (!slot) throw new NotFoundError('Slot');
    const str = d.strings.find((s) => s.id === slot.stringId)!;
    const fam = familyOf(ctx, b);
    const add = (id: string, label: string, status: CompatibilityCheck['status'], detail: string) => checks.push({ id, label, status, detail });

    const deployable = ['qualified', 'reserved'].includes(b.lifecycleState);
    const relocation = b.lifecycleState === 'deployed';
    add('state', 'Qualification status',
      deployable || relocation ? 'pass' : 'fail',
      deployable || relocation
        ? relocation ? 'Already deployed; this will be recorded as a movement between slots.' : 'Battery is qualified. Approved by an engineer.'
        : `Battery is "${b.lifecycleState.replace('_', ' ')}". Only qualified batteries can be deployed; there is no shortcut.`);
    const approvedFinal = d.tests.find((t) => t.batteryId === b.id && t.kind === 'final' && t.status === 'approved');
    add('evidence', 'Approved qualification evidence',
      approvedFinal ? 'pass' : 'fail',
      approvedFinal ? `Final test approved by ${approvedFinal.reviewerName}.` : 'No approved final test on record.');
    add('family', 'Battery family matches string design',
      b.familyId === str.familyId ? 'pass' : 'fail',
      b.familyId === str.familyId ? `${fam.model} matches ${str.name}.` : `String is designed for a different family than ${fam.model}. Compatibility is never assumed from a label.`);
    add('voltage', 'Unit voltage and type',
      fam.unitType === d.families.find((f) => f.id === str.familyId)!.unitType ? 'pass' : 'fail',
      `${fam.unitType}, ${fam.ratedVoltageV} V per unit; string nominal ${str.nominalVoltageV} V.`);
    const taken = d.assignments.find((a) => a.slotId === slotId && !a.endAt);
    add('vacancy', 'Slot is vacant', !taken || taken.batteryId === b.id ? (taken ? 'fail' : 'pass') : 'fail', taken ? 'Slot already has an active assignment. Overlapping assignments are blocked.' : 'Slot is vacant.');
    add('scope', 'Within your site access', canActorSeeSite(actor, slot.siteId) ? 'pass' : 'fail',
      canActorSeeSite(actor, slot.siteId) ? 'Site is within your assigned scope.' : 'Site is outside your assigned scope.');

    // mixed-age check (site checklist: no mixed old and new in a string)
    const peers = d.assignments.filter((a) => !a.endAt && d.slots.find((s) => s.id === a.slotId)?.stringId === str.id && a.batteryId !== b.id)
      .map((a) => d.batteries.find((x) => x.id === a.batteryId)!).filter(Boolean);
    const dates = peers.map((p) => p.manufacturedOn).filter((x): x is string => !!x).map((x) => Date.parse(x));
    if (!b.manufacturedOn) add('age', 'Mixed-age check', 'warn', 'Manufacture date is unknown, so age mixing cannot be assessed.');
    else if (dates.length) {
      const mine = Date.parse(b.manufacturedOn);
      const gapMonths = Math.max(...dates.map((x) => Math.abs(x - mine))) / MONTH_MS;
      add('age', 'Mixed-age check', gapMonths > 18 ? 'warn' : 'pass', gapMonths > 18 ? `Up to ${Math.round(gapMonths)} months apart from peers in this string. Avoid mixing old and new units.` : `Within ${Math.round(gapMonths) || 1} months of peers in this string.`);
    } else add('age', 'Mixed-age check', 'pass', 'No other units in this string yet.');

    // work-one-string-at-a-time
    const siblings = d.strings.filter((s) => s.bankId === str.bankId && s.id !== str.id);
    if (siblings.length === 0) add('sibling', 'Backup during work', 'warn', 'Single-string bank. Installation needs a planned outage or temporary backup.');
    else {
      const live = siblings.some((s) => d.slots.filter((x) => x.stringId === s.id).some((x) => d.assignments.some((a) => a.slotId === x.id && !a.endAt)));
      add('sibling', 'Backup during work', live ? 'pass' : 'warn', live ? 'Sibling string is in service. Work one string at a time and never disconnect both.' : 'Sibling string has no batteries in service.');
    }
    const sensor = d.sensorAssignments.some((a) => a.slotId === slotId && !a.endAt);
    add('sensor', 'Sensor mapped to slot', sensor ? 'pass' : 'warn', sensor ? 'A sensor is mapped; telemetry will attribute to this battery.' : 'No sensor is mapped. Telemetry will be unknown until a sensor assignment is recorded.');
    return { ok: checks.every((c) => c.status !== 'fail'), checks };
  };

  return {
    async inventory(): Promise<InventoryOverview> {
      await latency(ctx);
      authorize(ctx, 'inventory.read');
      const d = db(ctx);
      const groups = Object.fromEntries((Object.keys(INVENTORY_GROUP_LABELS) as InventoryGroup[]).map((g) => [g, []])) as unknown as InventoryOverview['groups'];
      const idx = qualityIndexFor(ctx);
      d.batteries.filter((b) => canSeeBattery(ctx, b)).forEach((b) => groups[inventoryGroupOf(b.lifecycleState)].push(toListItem(ctx, b, idx)));
      const byFamily = d.families.map((f) => {
        const own = d.batteries.filter((b) => b.familyId === f.id && canSeeBattery(ctx, b));
        return {
          familyId: f.id, model: `${f.manufacturer.replace(' (fictional)', '')} ${f.model}`,
          qualified: own.filter((b) => ['qualified', 'reserved'].includes(b.lifecycleState)).length,
          deployed: own.filter((b) => b.lifecycleState === 'deployed').length, total: own.length,
        };
      });
      return { groups, byFamily };
    },

    async sites() {
      await latency(ctx);
      authorize(ctx, 'inventory.read');
      const d = db(ctx);
      return d.sites.filter((s) => canSeeSite(ctx, s)).map<SiteView>((site) => {
        const strings = d.strings.filter((s) => s.siteId === site.id).map((st) => {
          const bank = d.banks.find((b) => b.id === st.bankId)!;
          const fam = d.families.find((f) => f.id === st.familyId)!;
          const slots = d.slots.filter((s) => s.stringId === st.id).sort((a, b) => a.position - b.position).map((slot) => {
            const asg = d.assignments.find((a) => a.slotId === slot.id && !a.endAt);
            const b = asg ? d.batteries.find((x) => x.id === asg.batteryId) : null;
            return { slot, battery: b && canSeeBattery(ctx, b) ? { id: b.id, label: b.label, publicRef: b.publicRef, state: b.lifecycleState } : null, hidden: !!b && !canSeeBattery(ctx, b) };
          });
          return { string: st, bank, familyModel: `${fam.manufacturer.replace(' (fictional)', '')} ${fam.model}`, slots };
        });
        return {
          site, strings, gatewayStatus: d.gateways.find((g) => g.siteId === site.id)?.status ?? null,
          occupied: strings.reduce((n, s) => n + s.slots.filter((x) => x.battery).length, 0),
          capacity: strings.reduce((n, s) => n + s.slots.length, 0),
        };
      });
    },

    async validate(batteryId, slotId) {
      await latency(ctx);
      authorize(ctx, 'inventory.read');
      return validate(batteryId, slotId);
    },

    async move(input) {
      await latency(ctx);
      const actor = authorize(ctx, 'deployment.write');
      const parsed = deploymentInputSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Deployment is invalid', parsed.error.issues.map((i) => i.message));
      const { batteryId, slotId, reason } = parsed.data;
      const d = db(ctx);
      const b = getBatteryOrThrow(ctx, batteryId);
      const result = validate(batteryId, slotId);
      if (!result.ok) {
        throw new ConflictError(`Compatibility check failed: ${result.checks.filter((c) => c.status === 'fail').map((c) => c.label).join('; ')}.`);
      }
      const slot = d.slots.find((s) => s.id === slotId)!;
      const now = ctx.store.now();
      const prevState = b.lifecycleState;
      const old = b.currentAssignmentId ? d.assignments.find((a) => a.id === b.currentAssignmentId) : null;
      if (old) old.endAt = now;
      const asg = { id: ctx.store.nextId('asg'), batteryId: b.id, slotId, startAt: now, endAt: null, reason, actorId: actor.userId };
      try {
        ctx.store.insertAssignment(asg);
      } catch (e) {
        if (old) old.endAt = null; // roll back the closure
        throw e;
      }
      b.currentAssignmentId = asg.id;
      b.siteId = slot.siteId;
      b.physicalLocation = 'Installed at site';
      setState(ctx, b, 'deployed');
      const str = d.strings.find((s) => s.id === slot.stringId)!;
      pushEvent(ctx, b.id, old ? 'movement' : 'deployment', old ? 'Moved between slots' : 'Installed in site slot',
        `${reason}. ${siteName(ctx, slot.siteId)} / ${str.name} / position ${slot.position}. Earlier assignment history retained.`,
        { previousState: prevState, newState: 'deployed', sourceSystem: sourceName(ctx, 'Deployment planner'), ref: { kind: 'assignment', id: asg.id }, approvalState: 'approved' });
      if (!old && !d.warranties.some((w) => w.batteryId === b.id)) {
        const w: WarrantyRecord = { id: ctx.store.nextId('wty'), batteryId: b.id, termsRef: null, startsOn: null, endsOn: null, state: 'unknown', claims: [] };
        d.warranties.push(w);
      }
      audit(ctx, 'deployment.move', 'battery', b.id, `${b.label} -> ${slot.stringId} pos ${slot.position}`);
      ctx.store.save();
      return asg;
    },

    async reserve(batteryId, reason) {
      await latency(ctx);
      authorize(ctx, 'deployment.write');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const b = getBatteryOrThrow(ctx, batteryId);
      if (b.lifecycleState !== 'qualified') throw new ConflictError('Only a qualified, unassigned battery can be reserved.');
      setState(ctx, b, 'reserved');
      pushEvent(ctx, b.id, 'movement', 'Reserved for planned deployment', r.data, { previousState: 'qualified', newState: 'reserved', sourceSystem: sourceName(ctx, 'Deployment planner') });
      audit(ctx, 'inventory.reserve', 'battery', b.id, r.data);
      ctx.store.save();
      return b;
    },

    async returnFromSite(batteryId, reason) {
      await latency(ctx);
      authorize(ctx, 'deployment.write');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const b: Battery = getBatteryOrThrow(ctx, batteryId);
      if (b.lifecycleState !== 'deployed') throw new ConflictError('Only a deployed battery can be returned.');
      const asg = db(ctx).assignments.find((a) => a.id === b.currentAssignmentId);
      if (asg) asg.endAt = ctx.store.now();
      b.currentAssignmentId = null;
      b.siteId = null;
      b.physicalLocation = 'Returns bay';
      setState(ctx, b, 'returned');
      pushEvent(ctx, b.id, 'return', 'Returned from site', `${r.data}. Same battery identity; assignment history retained.`, { previousState: 'deployed', newState: 'returned', sourceSystem: sourceName(ctx, 'Deployment planner') });
      audit(ctx, 'deployment.return', 'battery', b.id, r.data);
      ctx.store.save();
      return b;
    },

    async deployable() {
      await latency(ctx);
      authorize(ctx, 'inventory.read');
      const idx = qualityIndexFor(ctx);
      return db(ctx).batteries
        .filter((b) => ['qualified', 'reserved'].includes(b.lifecycleState) && canSeeBattery(ctx, b))
        .map((b) => toListItem(ctx, b, idx));
    },
  };
}

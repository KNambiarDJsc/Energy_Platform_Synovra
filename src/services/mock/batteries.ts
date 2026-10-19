import { createBatterySchema, correctionSchema, reasonSchema } from '@/domain/schemas';
import { can, ConflictError, NotFoundError, ValidationError, isCustomerAudience } from '@/domain/permissions';
import { LIFECYCLE_LABELS, type QualityIndex } from '@/domain/lifecycle';
import type { Battery, EvidenceFile } from '@/domain/types';
import {
  audit, byBattery, canSeeBattery, canSeeEvidence, canSeeSite, db, evidenceStatus, familyOf, getBatteryOrThrow, lastApprovedTest, latency,
  pctOfRated, pushEvent, qualityIndexFor, qualityOf, authorize, siteName, sourceName, type Ctx,
} from '../core';
import type {
  AssignmentView, BatteryFilters, BatteryListItem, BatteryPassport, BatteryRepository, LocationDetail,
  QrLookupResult, TelemetrySummary, TimelineEvent,
} from '../types';
import { statusFor } from './status';
import { telemetrySummaryFor } from './telemetry';

export function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`;
}

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function newPublicRef(existing: Set<string>): string {
  for (;;) {
    const s = Array.from({ length: 8 }, () => REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]).join('');
    const ref = `SYN-${s.slice(0, 4)}-${s.slice(4)}`;
    if (!existing.has(ref)) return ref;
  }
}

export function normaliseSerial(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function locationOf(ctx: Ctx, b: Battery): LocationDetail {
  const d = db(ctx);
  const asg = d.assignments.find((a) => a.id === b.currentAssignmentId);
  const slot = asg ? d.slots.find((s) => s.id === asg.slotId) : null;
  const str = slot ? d.strings.find((s) => s.id === slot.stringId) : null;
  const bank = slot ? d.banks.find((x) => x.id === slot.bankId) : null;
  return {
    siteId: slot?.siteId ?? null,
    siteName: siteName(ctx, slot?.siteId ?? null),
    bankName: bank?.name ?? null,
    stringName: str?.name ?? null,
    position: slot?.position ?? null,
    slotId: slot?.id ?? null,
  };
}

export function toListItem(ctx: Ctx, b: Battery, index?: QualityIndex): BatteryListItem {
  const d = db(ctx);
  const f = familyOf(ctx, b);
  const loc = locationOf(ctx, b);
  const t = lastApprovedTest(d, b.id);
  const q = qualityOf(ctx, b, index);
  const w = byBattery(d.warranties).get(b.id)?.[0];
  const es = evidenceStatus(d, b);
  return {
    id: b.id, label: b.label, publicRef: b.publicRef, manufacturerSerial: b.manufacturerSerial,
    manufacturer: f.manufacturer, model: f.model, chemistry: f.chemistry, unitType: f.unitType,
    ratedVoltageV: f.ratedVoltageV, ratedCapacityAh: f.ratedCapacityAh, lifecycleState: b.lifecycleState,
    siteName: loc.siteName,
    position: loc.stringName ? `${loc.bankName} / ${loc.stringName} / pos ${loc.position}` : null,
    physicalLocation: b.physicalLocation,
    lastApprovedTest: t ? { id: t.id, at: t.reviewedAt ?? t.startedAt, capacityAh: t.result.capacityAh, pctOfRated: pctOfRated(t.result.capacityAh, f.ratedCapacityAh) } : null,
    quality: q, evidenceStatus: { code: es.code, label: es.label },
    warrantyState: w?.state ?? null, updatedAt: b.updatedAt,
    duplicateWarning: q.conflicts[0] ?? null,
    status: (({ status, headline, nextStep }) => ({ code: status, headline, nextStep }))(statusFor(ctx, b, index)),
  };
}

export function createBatteryRepository(ctx: Ctx): BatteryRepository {
  return {
    async list(filters: BatteryFilters = {}) {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      const d = db(ctx);
      const q = filters.q?.trim().toLowerCase();
      const idx = qualityIndexFor(ctx);
      const items = d.batteries
        .filter((b) => canSeeBattery(ctx, b))
        .map((b) => toListItem(ctx, b, idx))
        .filter((i) => {
          if (filters.manufacturer && i.manufacturer !== filters.manufacturer) return false;
          if (filters.chemistry && i.chemistry !== filters.chemistry) return false;
          if (filters.state && i.lifecycleState !== filters.state) return false;
          if (filters.qualityLevel && i.quality.level !== filters.qualityLevel) return false;
          if (filters.status && i.status.code !== filters.status) return false;
          if (filters.siteId) {
            const b = d.batteries.find((x) => x.id === i.id)!;
            if (locationOf(ctx, b).siteId !== filters.siteId) return false;
          }
          if (filters.updatedFrom && i.updatedAt.slice(0, 10) < filters.updatedFrom) return false;
          if (filters.updatedTo && i.updatedAt.slice(0, 10) > filters.updatedTo) return false;
          if (q) {
            const aliases = d.aliases.filter((a) => a.batteryId === i.id).map((a) => a.value.toLowerCase());
            const hay = [i.label, i.publicRef, i.manufacturerSerial ?? '', i.model, i.manufacturer, i.id, i.siteName ?? '', ...aliases].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
      return items.sort((a, b) => a.label.localeCompare(b.label));
    },

    async facets() {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      const d = db(ctx);
      return {
        manufacturers: [...new Set(d.families.map((f) => f.manufacturer))],
        chemistries: [...new Set(d.families.map((f) => f.chemistry))],
        sites: d.sites.filter((s) => canSeeSite(ctx, s)),
      };
    },

    async families() {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      return db(ctx).families;
    },

    async openEvidence(evidenceId) {
      await latency(ctx);
      const actor = authorize(ctx, 'battery.read');
      const e = db(ctx).evidence.find((x) => x.id === evidenceId);
      // Same visibility as the passport. Files outside scope are reported as missing, never as forbidden.
      const allowed = !!e && canSeeEvidence(actor, e)
        && (e.batteryId ? canSeeBattery(ctx, db(ctx).batteries.find((b) => b.id === e.batteryId)!) : can(actor.role, 'battery.import'));
      if (!e || !allowed) {
        audit(ctx, 'evidence.open', 'evidence', evidenceId, 'Evidence file not found or outside access scope', 'denied');
        ctx.store.save();
        throw new NotFoundError('Evidence file');
      }
      audit(ctx, 'evidence.open', 'evidence', e.id, `Opened ${e.fileName}${e.storageKey ? '' : ' (metadata only)'}`);
      ctx.store.save();
      return e;
    },

    async get(id) {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      const d = db(ctx);
      const actor = ctx.actor();
      const b = getBatteryOrThrow(ctx, id);
      const customer = isCustomerAudience(actor.role);
      const redactions: string[] = [];
      const family = familyOf(ctx, b);
      const evidenceById = new Map(d.evidence.map((e) => [e.id, e]));
      const visibleEvidence = (e: EvidenceFile) => canSeeEvidence(actor, e);

      const events: TimelineEvent[] = d.events
        .filter((e) => e.batteryId === b.id)
        .sort((x, y) => x.occurredAt.localeCompare(y.occurredAt))
        .map((e) => {
          const ev = e.evidenceIds.map((i) => evidenceById.get(i)).filter((x): x is EvidenceFile => !!x && visibleEvidence(x));
          if (customer && e.type === 'restoration') {
            return { ...e, reason: 'Restoration step performed. Process details are confidential.', evidenceIds: ev.map((x) => x.id), evidence: ev };
          }
          return { ...e, evidenceIds: ev.map((x) => x.id), evidence: ev };
        });
      if (customer) redactions.push('Restoration process details and notes', 'Internal costs and margins', 'Internal evidence files', 'Audit history', 'Model estimates');

      const tests = d.tests
        .filter((t) => t.batteryId === b.id && (!customer || t.status === 'approved'))
        .sort((x, y) => x.startedAt.localeCompare(y.startedAt));
      const asgs = d.assignments.filter((a) => a.batteryId === b.id).sort((x, y) => y.startAt.localeCompare(x.startAt));
      const assignments: AssignmentView[] = asgs.map((a) => {
        const slot = d.slots.find((s) => s.id === a.slotId)!;
        return {
          ...a, siteName: siteName(ctx, slot.siteId) ?? slot.siteId,
          bankName: d.banks.find((x) => x.id === slot.bankId)?.name ?? '',
          stringName: d.strings.find((x) => x.id === slot.stringId)?.name ?? '', position: slot.position,
        };
      });
      // string-level tests that covered a string this battery occupied. Never shown as battery capacity.
      const stringTests = d.tests
        .filter((t) => t.level === 'string' && t.stringId && asgs.some((a) => {
          const slot = d.slots.find((s) => s.id === a.slotId);
          return slot?.stringId === t.stringId && a.startAt <= t.startedAt && (!a.endAt || a.endAt >= t.startedAt);
        }))
        .map((t) => ({ ...t, stringName: `${d.strings.find((s) => s.id === t.stringId)?.name ?? ''} (${siteName(ctx, d.strings.find((s) => s.id === t.stringId)?.siteId ?? null) ?? ''})` }));

      const attempts = can(actor.role, 'restoration.read') && !customer
        ? d.attempts.filter((a) => a.batteryId === b.id).map((a) =>
          can(actor.role, 'process.controlled') ? a : { ...a, notes: [], lotRefs: [], evidenceIds: a.evidenceIds.filter((i) => visibleEvidence(evidenceById.get(i)!)) })
        : [];
      if (!customer && !can(actor.role, 'process.controlled')) redactions.push('Process notes and lot references');

      const showCosts = can(actor.role, 'cost.read');
      if (!showCosts && !customer) redactions.push('Internal costs');
      const evidence = d.evidence.filter((e) => e.batteryId === b.id && visibleEvidence(e)).sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt));
      const aliases = d.aliases.filter((a) => a.batteryId === b.id && a.kind !== 'retired_qr_reference');
      const retiredRefs = d.aliases.filter((a) => a.batteryId === b.id && a.kind === 'retired_qr_reference');

      const related: BatteryPassport['relatedBatteries'] = [];
      if (b.replacesBatteryId) {
        const r = d.batteries.find((x) => x.id === b.replacesBatteryId);
        if (r && canSeeBattery(ctx, r)) related.push({ id: r.id, label: r.label, publicRef: r.publicRef, relation: 'Replaced this battery (separate identity)' });
      }
      d.batteries.filter((x) => x.replacesBatteryId === b.id && canSeeBattery(ctx, x)).forEach((x) =>
        related.push({ id: x.id, label: x.label, publicRef: x.publicRef, relation: 'Replaced by this battery (separate identity)' }));
      const qidx = qualityIndexFor(ctx);
      const q = qualityOf(ctx, b, qidx);
      if (!customer) {
        // Other batteries that share a serial or an alias with this one, in either direction: a handful of lookups.
        const mySerial = b.manufacturerSerial?.toLowerCase();
        const mine = (byBattery(d.aliases).get(b.id) ?? []).map((a) => a.value.toLowerCase());
        const candidates = new Set<string>([
          ...(mySerial ? (qidx.serials.get(mySerial) ?? []) : []),
          ...(mySerial ? (qidx.aliasValues.get(mySerial) ?? []) : []),
          ...mine.flatMap((v) => [...(qidx.aliasValues.get(v) ?? []), ...(qidx.serials.get(v) ?? [])]),
        ]);
        candidates.delete(b.id);
        if (candidates.size) {
          d.batteries.filter((x) => candidates.has(x.id) && canSeeBattery(ctx, x))
            .forEach((x) => related.push({ id: x.id, label: x.label, publicRef: x.publicRef, relation: 'Possible duplicate identity, needs review' }));
        }
      }

      const loc = locationOf(ctx, b);
      const telemetry: TelemetrySummary = telemetrySummaryFor(ctx, b);
      return {
        battery: customer ? { ...b, internalNotes: '' } : b,
        family, aliases, retiredRefs, quality: q, evidenceStatus: evidenceStatus(d, b), location: loc,
        lastApprovedTest: lastApprovedTest(d, b.id), events, tests, stringTests, attempts, assignments, telemetry, status: statusFor(ctx, b),
        costs: showCosts ? d.costs.filter((c) => c.batteryId === b.id) : null,
        values: showCosts ? d.values.filter((v) => v.batteryId === b.id) : null,
        warranty: can(actor.role, 'warranty.read') ? d.warranties.find((w) => w.batteryId === b.id) ?? null : null,
        recycling: d.recycling.find((r) => r.batteryId === b.id) ?? null,
        evidence,
        audit: can(actor.role, 'audit.read') ? d.audit.filter((a) => a.entityId === b.id).concat(
          events.filter((e) => e.type === 'identity').map((e) => ({ id: `ev_${e.id}`, at: e.recordedAt, actorId: e.actorId, actorName: e.actorName, role: 'system' as const, action: 'identity.correction', entityKind: 'battery', entityId: b.id, summary: e.title, outcome: 'success' as const })),
        ) : null,
        alerts: d.alerts.filter((a) => a.batteryId === b.id && (!customer || a.source.kind !== 'model')),
        tasks: customer ? [] : d.tasks.filter((t) => t.batteryId === b.id),
        predictions: can(actor.role, 'prediction.read') && !customer ? d.predictions.filter((p) => p.batteryId === b.id) : [],
        relatedBatteries: related, redacted: customer, redactions,
      } satisfies BatteryPassport;
    },

    async lookupByPublicRef(ref): Promise<QrLookupResult> {
      await latency(ctx);
      authorize(ctx, 'battery.read');
      const d = db(ctx);
      const key = ref.trim().toUpperCase();
      const direct = d.batteries.find((b) => b.publicRef === key);
      const retired = direct ? null : d.aliases.find((a) => a.kind === 'retired_qr_reference' && a.value.toUpperCase() === key);
      const b = direct ?? (retired ? d.batteries.find((x) => x.id === retired.batteryId) : undefined);
      if (!b) return { status: 'unknown', batteryId: null, message: 'No battery matches this reference. A QR code is only a lookup key: check the label, or search by serial or label.' };
      if (!canSeeBattery(ctx, b)) {
        audit(ctx, 'qr.denied', 'battery', b.id, 'QR lookup outside access scope', 'denied');
        ctx.store.save();
        return { status: 'forbidden', batteryId: null, message: 'This reference exists, but the record is outside your access. A QR code does not grant access.' };
      }
      return direct
        ? { status: 'active', batteryId: b.id, message: 'Reference resolved.' }
        : { status: 'retired', batteryId: b.id, message: `This label was replaced. The reference ${key} is retired and resolves to the same battery identity.` };
    },

    async create(input) {
      await latency(ctx);
      const actor = authorize(ctx, 'battery.create');
      const parsed = createBatterySchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Battery record is invalid', parsed.error.issues.map((i) => i.message));
      const v = parsed.data;
      const d = db(ctx);
      const family = d.families.find((f) => f.id === v.familyId);
      if (!family) throw new NotFoundError('Battery family');
      const warnings: string[] = [];
      const serial = v.manufacturerSerial?.trim() || null;
      if (serial) {
        const exact = d.batteries.find((b) => b.familyId === v.familyId && b.manufacturerSerial?.toLowerCase() === serial.toLowerCase());
        const near = d.batteries.find((b) => b.familyId === v.familyId && b.manufacturerSerial && normaliseSerial(b.manufacturerSerial) === normaliseSerial(serial) && b.manufacturerSerial.toLowerCase() !== serial.toLowerCase());
        if ((exact || near) && !v.acknowledgeDuplicate) {
          throw new ConflictError(`A ${family.model} with serial ${exact?.manufacturerSerial ?? near?.manufacturerSerial} already exists (${(exact ?? near)!.label}). Open that record, or acknowledge the duplicate to create a separate record for identity review.`);
        }
        if (exact || near) warnings.push(`Serial matches existing record ${(exact ?? near)!.label}. Both records are flagged for identity review; they have not been merged.`);
      } else warnings.push('No manufacturer serial. Identity relies on the permanent ID and QR reference.');
      if (!v.manufacturedOn) warnings.push('Manufacture date is unknown.');

      const now = ctx.store.now();
      const refs = new Set(d.batteries.map((b) => b.publicRef).concat(d.aliases.filter((a) => a.kind === 'retired_qr_reference').map((a) => a.value)));
      const nextNo = d.batteries.reduce((m, b) => Math.max(m, Number(b.label.replace(/\D/g, '')) || 0), 0) + 1;
      const battery: Battery = {
        id: newUuid(), label: `B-${String(nextNo).padStart(4, '0')}`, publicRef: newPublicRef(refs),
        manufacturerSerial: serial, familyId: v.familyId, manufacturedOn: v.manufacturedOn ?? null, tenantId: actor.tenantId,
        lifecycleState: 'received', siteId: null, currentAssignmentId: null, physicalLocation: v.physicalLocation,
        restorationBatchId: null, replacesBatteryId: null, createdAt: now, updatedAt: now,
        sourceSystem: sourceName(ctx, 'Manual entry'), internalNotes: warnings.length && serial && v.acknowledgeDuplicate ? 'Duplicate serial acknowledged at intake; needs identity review.' : '',
      };
      d.batteries.push(battery);
      if (v.legacyId) d.aliases.push({ id: ctx.store.nextId('al'), batteryId: battery.id, kind: 'legacy_lab_id', value: v.legacyId, source: 'Manual entry' });
      d.costs.push({
        id: ctx.store.nextId('cost'), batteryId: battery.id, batchId: null, kind: 'acquisition',
        amountAed: v.acquisitionCostAed ?? null, allocation: 'direct', recordedOn: now.slice(0, 10),
        note: v.acquisitionCostAed == null ? 'Acquisition cost not supplied (unknown, not zero)' : 'Entered at intake',
        source: 'Manual entry', allocationBasis: null,
      });
      pushEvent(ctx, battery.id, 'intake', 'Received into lab', 'Physical receipt, permanent ID and QR reference issued.', { newState: 'received', sourceSystem: sourceName(ctx, 'Manual entry') });
      audit(ctx, 'battery.create', 'battery', battery.id, `Created ${battery.label} (${family.model})`);
      ctx.store.save();
      return { battery, warnings };
    },

    async correct(input) {
      await latency(ctx);
      authorize(ctx, 'battery.correct');
      const parsed = correctionSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Correction is invalid', parsed.error.issues.map((i) => i.message));
      const { batteryId, field, newValue, reason } = parsed.data;
      const b = getBatteryOrThrow(ctx, batteryId);
      const previous = (b[field] as string | null) ?? null;
      if (previous === (newValue ?? null)) throw new ValidationError('The new value is the same as the current value.');
      if (field === 'manufacturedOn' && newValue && !/^\d{4}-\d{2}-\d{2}$/.test(newValue)) throw new ValidationError('Use YYYY-MM-DD for dates.');
      (b as unknown as Record<string, string | null>)[field] = newValue ?? null;
      b.updatedAt = ctx.store.now();
      pushEvent(ctx, b.id, 'identity', `Correction: ${field}`, `${reason} (previous value retained in this event)`, {
        approvalState: 'approved', correction: { field, previous, next: newValue ?? null },
      });
      audit(ctx, 'battery.correct', 'battery', b.id, `${field}: "${previous ?? 'unknown'}" -> "${newValue ?? 'unknown'}". ${reason}`);
      ctx.store.save();
      return b;
    },

    async reissueLabel(batteryId, reason) {
      await latency(ctx);
      authorize(ctx, 'battery.create');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const b = getBatteryOrThrow(ctx, batteryId);
      const d = db(ctx);
      const refs = new Set(d.batteries.map((x) => x.publicRef).concat(d.aliases.filter((a) => a.kind === 'retired_qr_reference').map((a) => a.value)));
      const retired = b.publicRef;
      b.publicRef = newPublicRef(refs);
      b.updatedAt = ctx.store.now();
      d.aliases.push({ id: ctx.store.nextId('al'), batteryId: b.id, kind: 'retired_qr_reference', value: retired, source: `Label reissued: ${r.data}` });
      pushEvent(ctx, b.id, 'identity', 'QR label reissued', `Damaged or lost label replaced. Permanent ID unchanged; retired reference ${retired} still resolves here. ${r.data}`, { approvalState: 'approved' });
      audit(ctx, 'battery.label_reissue', 'battery', b.id, `Reissued label ${retired} -> ${b.publicRef}`);
      ctx.store.save();
      return { battery: b, retired };
    },

    async exportCsv(ids) {
      await latency(ctx);
      const actor = authorize(ctx, 'battery.export');
      const d = db(ctx);
      const idx = qualityIndexFor(ctx);
      const wanted = ids ? new Set(ids) : null;
      const rows = d.batteries.filter((b) => canSeeBattery(ctx, b) && (!wanted || wanted.has(b.id))).map((b) => toListItem(ctx, b, idx));
      const header = ['label', 'public_reference', 'manufacturer_serial', 'manufacturer', 'model', 'chemistry', 'rated_voltage_v', 'rated_capacity_ah', 'lifecycle_state', 'site', 'position', 'data_quality', 'warranty_state', 'updated_at'];
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = rows.map((r) => [r.label, r.publicRef, r.manufacturerSerial ?? '', r.manufacturer, r.model, r.chemistry, r.ratedVoltageV, r.ratedCapacityAh,
        LIFECYCLE_LABELS[r.lifecycleState], r.siteName ?? '', r.position ?? '', r.quality.level, r.warrantyState ?? '', r.updatedAt].map(esc).join(','));
      audit(ctx, 'battery.export', 'battery', 'register', `Exported ${rows.length} rows as ${actor.role}`);
      ctx.store.save();
      return { fileName: 'synovra-battery-register-synthetic.csv', csv: [header.join(','), ...lines].join('\n') };
    },
  };
}


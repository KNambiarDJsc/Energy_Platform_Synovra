import { reportInputSchema } from '@/domain/schemas';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { ConflictError, NotFoundError, ValidationError, can, isCustomerAudience } from '@/domain/permissions';
import type { Report, ReportSection, ReportTemplateId } from '@/domain/types';
import {
  audit, canSeeBattery, canSeeSite, db, evidenceStatus, familyOf, lastApprovedTest, latency, pctOfRated, qualityOf, authorize,
  siteName, type Ctx,
} from '../core';
import type { ReportRepository, ReportTemplate } from '../types';

const TEMPLATES: ReportTemplate[] = [
  { id: 'battery_passport', name: 'Individual battery passport', description: 'Identity, approved tests, movements and evidence for one battery.', scopeKind: 'battery', internalOnlySections: ['Costs', 'Restoration process'] },
  { id: 'restoration_batch', name: 'Restoration batch report', description: 'Intake, outcomes, rejects and rework for a batch, with cost reconciliation for authorised roles.', scopeKind: 'batch', internalOnlySections: ['Costs and contribution', 'Process references'] },
  { id: 'customer_site', name: 'Customer site report', description: 'Batteries installed at a site, approved test status, open alerts and data availability.', scopeKind: 'site', internalOnlySections: ['Assignee detail'] },
  { id: 'warranty_pack', name: 'Warranty evidence pack', description: 'Warranty position, claims, original approved test and linked alerts per battery.', scopeKind: 'all', internalOnlySections: ['Claim costs'] },
  { id: 'esg_recycling', name: 'ESG / recycling evidence pack', description: 'Recycling chain of custody: consignment, mass and certificate status. No avoided-emissions figure is calculated.', scopeKind: 'all', internalOnlySections: [] },
  { id: 'data_completeness', name: 'Data completeness report', description: 'Missing, conflicting and unknown values across the register.', scopeKind: 'all', internalOnlySections: [] },
];

const CUSTOMER_TEMPLATES: ReportTemplateId[] = ['battery_passport', 'customer_site', 'warranty_pack', 'esg_recycling', 'data_completeness'];

export function createReportRepository(ctx: Ctx): ReportRepository {
  const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const dash = 'Not recorded';

  function buildSections(templateId: ReportTemplateId, scopeId: string | null, from: string, to: string, customerView: boolean): { sections: ReportSection[]; scope: string; evidenceRefs: string[] } {
    const d = db(ctx);
    const actor = ctx.actor();
    const showCosts = !customerView && can(actor.role, 'cost.read');
    const showProcess = !customerView && can(actor.role, 'process.controlled');
    const evidenceRefs: string[] = [];
    const inPeriod = (iso: string | null) => !iso || (iso.slice(0, 10) >= from && iso.slice(0, 10) <= to);
    const sections: ReportSection[] = [];
    let scope = 'All visible records';

    const batteryRows = (ids?: string[]) => d.batteries.filter((b) => canSeeBattery(ctx, b) && (!ids || ids.includes(b.id)));

    if (templateId === 'battery_passport') {
      const b = d.batteries.find((x) => x.id === scopeId);
      if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Battery');
      const f = familyOf(ctx, b);
      scope = `Battery ${b.label} (${b.publicRef})`;
      const es = evidenceStatus(d, b);
      sections.push({ heading: 'Identity', visibility: 'customer', columns: ['Field', 'Value'], rows: [
        ['Permanent ID', b.id], ['Label', b.label], ['QR reference (lookup only)', b.publicRef], ['Manufacturer serial', b.manufacturerSerial ?? 'Unknown'],
        ['Manufacturer / model', `${f.manufacturer} ${f.model}`], ['Chemistry', f.chemistry], ['Unit type', f.unitType],
        ['Rated voltage', `${f.ratedVoltageV} V`], ['Rated capacity', `${f.ratedCapacityAh} Ah (${f.ratingConditions})`],
        ['Current state', LIFECYCLE_LABELS[b.lifecycleState]], ['Evidence status', es.label],
      ] });
      const tests = d.tests.filter((t) => t.batteryId === b.id && t.status === 'approved' && inPeriod(t.reviewedAt));
      tests.forEach((t) => t.evidenceIds.forEach((e) => evidenceRefs.push(e)));
      sections.push({ heading: 'Approved tests', visibility: 'customer', columns: ['Date', 'Kind', 'Capacity (Ah)', '% of rated', 'Conditions', 'Approved by'],
        rows: tests.map((t) => [(t.reviewedAt ?? t.startedAt).slice(0, 10), t.kind, t.result.capacityAh === null ? 'Not measured' : String(t.result.capacityAh),
          t.result.capacityAh === null ? dash : `${pctOfRated(t.result.capacityAh, f.ratedCapacityAh)}%`,
          `${t.conditions.loadCurrentA ?? '?'} A to ${t.conditions.cutoffVoltageV ?? '?'} V, ${t.conditions.ambientTempC ?? '?'} °C`, t.reviewerName ?? dash]),
        note: tests.length ? 'Capacity percentages are measured capacity divided by rated capacity under the stated conditions. They are not a health score.' : 'No approved tests in the period. No capacity or health value is shown.' });
      const asg = d.assignments.filter((a) => a.batteryId === b.id);
      sections.push({ heading: 'Location history', visibility: 'customer', columns: ['From', 'To', 'Site', 'String / position'],
        rows: asg.map((a) => { const s = d.slots.find((x) => x.id === a.slotId)!; return [a.startAt.slice(0, 10), a.endAt ? a.endAt.slice(0, 10) : 'Current', siteName(ctx, s.siteId) ?? s.siteId, `${d.strings.find((x) => x.id === s.stringId)?.name} / pos ${s.position}`]; }) });
      if (showProcess) {
        const att = d.attempts.filter((a) => a.batteryId === b.id);
        sections.push({ heading: 'Restoration process', visibility: 'internal', columns: ['Attempt', 'Status', 'Batch', 'Decision', 'Lot references'],
          rows: att.map((a) => [`#${a.attemptNo}`, a.status.replace('_', ' '), a.batchId, a.decisionReason ?? dash, a.lotRefs.map((l) => l.ref).join(', ') || dash]) });
      }
      if (showCosts) {
        const c = d.costs.filter((x) => x.batteryId === b.id);
        sections.push({ heading: 'Costs', visibility: 'internal', columns: ['Kind', 'Amount (AED)', 'Basis', 'Note'],
          rows: c.map((x) => [x.kind.replace('_', ' '), x.amountAed === null ? 'Unknown' : String(x.amountAed), x.allocation, x.note]),
          note: 'Unknown amounts are unknown, not zero. Allocated amounts are not directly measured.' });
      }
    }

    if (templateId === 'restoration_batch') {
      const batch = d.batches.find((x) => x.id === scopeId);
      if (!batch) throw new NotFoundError('Batch');
      scope = `Restoration batch ${batch.id}`;
      const members = d.batteries.filter((b) => b.restorationBatchId === batch.id && canSeeBattery(ctx, b));
      const att = d.attempts.filter((a) => a.batchId === batch.id);
      const qualified = new Set(att.filter((a) => a.status === 'approved').map((a) => a.batteryId)).size;
      sections.push({ heading: 'Summary', visibility: 'customer', columns: ['Measure', 'Value'], rows: [
        ['Batteries in batch', String(members.length)], ['Attempted', String(new Set(att.map((a) => a.batteryId)).size)],
        ['Qualified', String(qualified)], ['Rework', String(att.filter((a) => a.status === 'rework').length)],
        ['Rejected', String(att.filter((a) => a.status === 'rejected').length)],
        ['Qualified / batteries in batch', members.length ? `${Math.round((qualified / members.length) * 1000) / 10}%` : dash],
      ], note: 'Yield is shown against the intake population. The denominator is stated; it is not a quality score.' });
      sections.push({ heading: 'Batteries', visibility: 'customer', columns: ['Label', 'Serial', 'State', 'Last approved capacity (Ah)'],
        rows: members.map((b) => [b.label, b.manufacturerSerial ?? 'Unknown', LIFECYCLE_LABELS[b.lifecycleState], String(lastApprovedTest(d, b.id)?.result.capacityAh ?? 'Not tested')]) });
      if (showCosts) {
        const c = d.costs.filter((x) => x.batchId === batch.id);
        const known = c.filter((x) => x.amountAed !== null && x.kind !== 'warranty_provision').reduce((s, x) => s + (x.amountAed ?? 0), 0);
        const prov = c.filter((x) => x.kind === 'warranty_provision').reduce((s, x) => s + (x.amountAed ?? 0), 0);
        sections.push({ heading: 'Costs and contribution', visibility: 'internal', columns: ['Item', 'AED', 'Basis'], rows: [
          ...c.filter((x) => x.batteryId === null).map((x) => [x.kind.replace('_', ' '), x.amountAed === null ? 'Unknown' : String(x.amountAed), x.allocation + (x.allocationBasis ? ` (${x.allocationBasis})` : '')]),
          ['Known costs on batteries and batch (excl. provision)', String(known), 'sum of known amounts'],
          ['Warranty provision', String(prov), 'estimate, not a settled expense'],
          ['Unknown entries', String(c.filter((x) => x.amountAed === null).length), 'excluded from totals; totals are lower bounds'],
        ] });
      }
    }

    if (templateId === 'customer_site') {
      const site = d.sites.find((s) => s.id === scopeId);
      if (!site || !canSeeSite(ctx, site)) throw new NotFoundError('Site');
      scope = site.name;
      const slots = d.slots.filter((s) => s.siteId === site.id);
      sections.push({ heading: 'Installed batteries', visibility: 'customer', columns: ['String', 'Position', 'Battery', 'Serial', 'Evidence status', 'Last approved capacity (Ah)'],
        rows: slots.map((s) => {
          const a = d.assignments.find((x) => x.slotId === s.id && !x.endAt);
          const b = a ? d.batteries.find((x) => x.id === a.batteryId) : null;
          const t = b ? lastApprovedTest(d, b.id) : null;
          return [d.strings.find((x) => x.id === s.stringId)!.name, String(s.position), b?.label ?? 'Vacant', b?.manufacturerSerial ?? dash, b ? evidenceStatus(d, b).label : dash, t?.result.capacityAh == null ? dash : String(t.result.capacityAh)];
        }) });
      const al = d.alerts.filter((a) => a.siteId === site.id && a.source.kind !== 'model' && inPeriod(a.createdAt));
      sections.push({ heading: 'Alerts in period', visibility: 'customer', columns: ['ID', 'Type', 'Severity', 'State', 'Created'],
        rows: al.map((a) => [a.id, a.type.replace(/_/g, ' '), a.severity, a.state.replace('_', ' '), a.createdAt.slice(0, 10)]),
        note: 'Alert acknowledgement does not change a battery’s qualification or status.' });
      const gw = d.gateways.find((g) => g.siteId === site.id);
      sections.push({ heading: 'Telemetry availability', visibility: 'customer', columns: ['Gateway', 'Status at snapshot', 'Last seen', 'Sampling'],
        rows: gw ? [[gw.name, gw.status, gw.lastSeenAt.slice(0, 16).replace('T', ' ') + ' UTC', `${gw.samplingIntervalMin} min`]] : [],
        note: 'Synthetic gateway data. Availability is distinct from web application uptime.' });
      if (!customerView) sections.push({ heading: 'Assignee detail', visibility: 'internal', columns: ['Task', 'Status', 'Assignee'],
        rows: d.tasks.filter((t) => t.siteId === site.id).map((t) => [t.id, t.status, d.users.find((u) => u.id === t.assigneeId)?.name ?? 'Unassigned']) });
    }

    if (templateId === 'warranty_pack') {
      const list = batteryRows().filter((b) => d.warranties.some((w) => w.batteryId === b.id) && (!scopeId || b.siteId === scopeId));
      scope = scopeId ? `Warranty records at ${siteName(ctx, scopeId)}` : 'All visible warranty records';
      sections.push({ heading: 'Warranty position', visibility: 'customer', columns: ['Battery', 'Terms', 'Starts', 'Ends', 'State', 'Open claims'],
        rows: list.map((b) => { const w = d.warranties.find((x) => x.batteryId === b.id)!; return [b.label, w.termsRef ?? 'Not recorded', w.startsOn ?? 'Unknown', w.endsOn ?? 'Unknown', w.state.replace('_', ' '), String(w.claims.filter((c) => c.status === 'open').length)]; }),
        note: 'Rows with unknown terms or dates are shown as unknown, not assumed.' });
      const claims = list.flatMap((b) => d.warranties.find((x) => x.batteryId === b.id)!.claims.map((c) => ({ b, c })));
      sections.push({ heading: 'Claims and linked evidence', visibility: 'customer', columns: ['Battery', 'Opened', 'Status', 'Observation', 'Confirmed cause', 'Original approved test'],
        rows: claims.map(({ b, c }) => { const t = d.tests.find((x) => x.batteryId === b.id && x.kind === 'final' && x.status === 'approved'); if (t) t.evidenceIds.forEach((e) => evidenceRefs.push(e)); return [b.label, c.openedOn, c.status, c.finding, c.confirmedCause ?? 'Not established', t ? `${t.result.capacityAh} Ah on ${(t.reviewedAt ?? '').slice(0, 10)}` : 'None']; }),
        note: 'An observation is not a confirmed failure cause.' });
      if (showCosts) sections.push({ heading: 'Claim costs', visibility: 'internal', columns: ['Battery', 'Service cost (AED)'],
        rows: list.map((b) => [b.label, String(d.costs.filter((c) => c.batteryId === b.id && c.kind === 'service').reduce((s, c) => s + (c.amountAed ?? 0), 0))]) });
    }

    if (templateId === 'esg_recycling') {
      const recs = d.recycling.filter((r) => { const b = d.batteries.find((x) => x.id === r.batteryId); return b && canSeeBattery(ctx, b) && inPeriod(r.consignedOn); });
      scope = 'Recycling chain of custody, visible records';
      sections.push({ heading: 'Recycling records', visibility: 'customer', columns: ['Battery', 'State', 'Consignment', 'Mass (kg)', 'Recycler', 'Certificate'],
        rows: recs.map((r) => { const b = d.batteries.find((x) => x.id === r.batteryId)!; return [b.label, r.state, r.consignmentRef ?? 'Not yet consigned', r.massKg === null ? 'Not recorded' : String(r.massKg), r.recyclerName, r.certificateState === 'received' ? `Received (${r.certificateRef})` : 'Not received']; }),
        note: 'Weights are recorded values only. No avoided-emissions or CO₂ credit is calculated: a baseline and approved methodology are required and are not part of this demo.' });
      sections.push({ heading: 'Totals', visibility: 'customer', columns: ['Measure', 'Value'], rows: [
        ['Records', String(recs.length)], ['Consigned and recycled', String(recs.filter((r) => r.state === 'recycled').length)],
        ['With recorded mass', `${recs.filter((r) => r.massKg !== null).length} (${recs.reduce((s, r) => s + (r.massKg ?? 0), 0)} kg recorded)`],
        ['Certificates received', String(recs.filter((r) => r.certificateState === 'received').length)],
        ['Certificates missing', String(recs.filter((r) => r.state === 'recycled' && r.certificateState !== 'received').length)],
      ] });
    }

    if (templateId === 'data_completeness') {
      const list = batteryRows();
      scope = 'All visible batteries';
      const q = list.map((b) => ({ b, q: qualityOf(ctx, b) }));
      sections.push({ heading: 'Summary', visibility: 'customer', columns: ['Level', 'Batteries'], rows: (['complete', 'partial', 'incomplete', 'conflict'] as const).map((l) => [l, String(q.filter((x) => x.q.level === l).length)]) });
      sections.push({ heading: 'Items needing attention', visibility: 'customer', columns: ['Battery', 'Level', 'Missing', 'Conflicts'],
        rows: q.filter((x) => x.q.level !== 'complete').map((x) => [x.b.label, x.q.level, x.q.missing.join('; ') || dash, x.q.conflicts.join('; ') || dash]) });
    }
    return { sections: customerView ? sections.filter((s) => s.visibility === 'customer') : sections, scope, evidenceRefs: [...new Set(evidenceRefs)] };
  }

  return {
    async templates() {
      await latency(ctx);
      authorize(ctx, 'report.generate');
      return isCustomerAudience(ctx.actor().role) ? TEMPLATES.filter((t) => CUSTOMER_TEMPLATES.includes(t.id)) : TEMPLATES;
    },

    async scopes(templateId) {
      await latency(ctx);
      authorize(ctx, 'report.generate');
      const d = db(ctx);
      const t = TEMPLATES.find((x) => x.id === templateId);
      if (!t) return [];
      if (t.scopeKind === 'battery') return d.batteries.filter((b) => canSeeBattery(ctx, b)).map((b) => ({ id: b.id, label: `${b.label} · ${b.manufacturerSerial ?? 'no serial'}` }));
      if (t.scopeKind === 'batch') return d.batches.map((b) => ({ id: b.id, label: b.name }));
      if (t.scopeKind === 'site') return d.sites.filter((s) => canSeeSite(ctx, s)).map((s) => ({ id: s.id, label: s.name }));
      if (templateId === 'warranty_pack') return [{ id: null, label: 'All visible sites' }, ...d.sites.filter((s) => canSeeSite(ctx, s)).map((s) => ({ id: s.id, label: s.name }))];
      return [{ id: null, label: 'All visible records' }];
    },

    async list() {
      await latency(ctx);
      authorize(ctx, 'report.generate');
      const actor = ctx.actor();
      const all = db(ctx).reports;
      if (isCustomerAudience(actor.role)) return all.filter((r) => r.audience === 'customer' && (r.approvalState === 'approved' || r.generatedByName === actor.name));
      return [...all].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    },

    async get(id) {
      await latency(ctx);
      authorize(ctx, 'report.generate');
      const actor = ctx.actor();
      const r = db(ctx).reports.find((x) => x.id === id);
      if (!r) throw new NotFoundError('Report');
      if (isCustomerAudience(actor.role) && (r.audience !== 'customer' || (r.approvalState !== 'approved' && r.generatedByName !== actor.name))) throw new NotFoundError('Report');
      return r;
    },

    async generate(input) {
      await latency(ctx);
      const actor = authorize(ctx, 'report.generate');
      const parsed = reportInputSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Report request is invalid', parsed.error.issues.map((i) => i.message));
      const v = parsed.data;
      const customer = isCustomerAudience(actor.role);
      if (customer && !CUSTOMER_TEMPLATES.includes(v.templateId)) throw new NotFoundError('Report template');
      if (v.to < v.from) throw new ValidationError('The period end is before its start.');
      const audience: Report['audience'] = customer ? 'customer' : v.audience === 'customer' || !can(actor.role, 'report.internal') ? 'customer' : 'internal';
      const built = buildSections(v.templateId, v.scopeId, v.from, v.to, audience === 'customer');
      const tpl = TEMPLATES.find((t) => t.id === v.templateId)!;
      const d = db(ctx);
      const report: Report = {
        id: `RPT-${String(d.reports.length + 1).padStart(4, '0')}`, templateId: v.templateId, title: `${tpl.name}: ${built.scope}`, scope: built.scope,
        period: { from: v.from, to: v.to }, generatedAt: ctx.store.now(), generatedByName: actor.name, audience,
        approvalState: 'draft', approvedByName: null,
        sourceWatermark: ctx.store.mode === 'pilot'
          ? `Synovra pilot records · generated ${ctx.store.now()} · platform API v1 · draft until approved by Synovra engineering`
          : `Synthetic demonstration data · snapshot ${ctx.store.snapshotAt} · mock repository v1 · not for operational or contractual use`,
        evidenceRefs: built.evidenceRefs.map((id) => d.evidence.find((e) => e.id === id)?.fileName ?? id), sections: built.sections,
      };
      d.reports.push(report);
      audit(ctx, 'report.generate', 'report', report.id, `${report.title} (${audience})`);
      ctx.store.save();
      return report;
    },

    async approve(id) {
      await latency(ctx);
      const actor = authorize(ctx, 'report.approve');
      const r = db(ctx).reports.find((x) => x.id === id);
      if (!r) throw new NotFoundError('Report');
      if (r.approvalState === 'approved') throw new ConflictError('Report is already approved.');
      r.approvalState = 'approved';
      r.approvedByName = actor.name;
      audit(ctx, 'report.approve', 'report', r.id, `Approved by ${actor.name}`);
      ctx.store.save();
      return r;
    },

    async exportCsv(id) {
      await latency(ctx);
      authorize(ctx, 'report.generate');
      const actor = ctx.actor();
      const r = db(ctx).reports.find((x) => x.id === id);
      if (!r) throw new NotFoundError('Report');
      if (isCustomerAudience(actor.role) && r.approvalState !== 'approved') throw new ConflictError('This report is a preview. Export is available after Synovra engineering approves it.');
      const lines: string[] = [
        csvEscape(r.title), `Scope,${csvEscape(r.scope)}`, `Period,${r.period.from} to ${r.period.to}`, `Generated,${r.generatedAt}`,
        `Approval,${r.approvalState}${r.approvedByName ? ' by ' + r.approvedByName : ''}`, csvEscape(r.sourceWatermark), '',
      ];
      r.sections.forEach((s) => {
        lines.push(csvEscape(s.heading), s.columns.map(csvEscape).join(','));
        s.rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
        if (s.note) lines.push(csvEscape(`Note: ${s.note}`));
        lines.push('');
      });
      audit(ctx, 'report.export', 'report', r.id, 'Exported as CSV');
      ctx.store.save();
      return { fileName: `${r.id.toLowerCase()}-synthetic.csv`, csv: lines.join('\n') };
    },
  };
}


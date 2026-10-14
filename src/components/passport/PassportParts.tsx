'use client';
import {
  AlertTriangle, ArrowRight, BadgeCheck, CircleDot, ClipboardCheck, FileText, FlaskConical, GitBranch, History, Lock, MapPin,
  Recycle, Repeat, ScanLine, ShieldCheck, Undo2, Wrench, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  ApprovalBadge, Badge, FreshnessBadge, LifecycleBadge, TestStatusBadge, ValueKindBadge, WarrantyBadge,
} from '@/components/ui/Badge';
import { EvidenceDownload, StorageBadge } from '@/components/app/Evidence';
import { TimeSeriesChart } from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Field';
import { KeyValue, Notice, Section } from '@/components/ui/Layout';
import { EmptyState, QueryView } from '@/components/ui/States';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import type {
  AuditEvent, CostEntry, EvidenceFile, LifecycleEventType, RestorationAttempt, TestSession,
} from '@/domain/types';
import { formatAed, formatDate, formatDateTime, formatNumber, titleCase } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';
import type { AssignmentView, BatteryPassport, TimelineEvent } from '@/services/types';

/* ------------------------------ narrative ------------------------------ */

/** A factual summary assembled only from the passport's own records. No inference, no scoring. */
export function buildNarrative(p: BatteryPassport): string[] {
  const out: string[] = [];
  const b = p.battery;
  const intake = p.events.find((e) => e.type === 'intake');
  const fam = p.family;
  out.push(
    `${b.label} is a ${fam.manufacturer} ${fam.model} (${fam.chemistry}, ${fam.ratedVoltageV} V, rated ${fam.ratedCapacityAh} Ah at the ${fam.rateHours}-hour rate).` +
      (intake ? ` It was received on ${formatDate(intake.occurredAt)}${intake.dateCertainty === 'approximate' ? ' (date approximate, reconstructed from legacy records)' : ''}.` : ''),
  );
  const approvedBattery = p.tests.filter((t) => t.status === 'approved' && t.result.capacityAh !== null);
  if (approvedBattery.length > 0) {
    const first = approvedBattery[0];
    const last = approvedBattery[approvedBattery.length - 1];
    const pct = (t: TestSession) => (t.result.capacityAh! / fam.ratedCapacityAh) * 100;
    if (approvedBattery.length === 1) {
      out.push(`One approved test measured ${formatNumber(first.result.capacityAh, 0)} Ah (${formatNumber(pct(first), 0)}% of rated) on ${formatDate(first.startedAt)}.`);
    } else {
      out.push(
        `Approved tests measured ${formatNumber(first.result.capacityAh, 0)} Ah (${formatNumber(pct(first), 0)}% of rated) at first and ${formatNumber(last.result.capacityAh, 0)} Ah (${formatNumber(pct(last), 0)}%) most recently, on ${formatDate(last.startedAt)}.`,
      );
    }
  } else if (p.tests.length > 0) {
    out.push(`${p.tests.length} test session(s) are recorded but none is approved yet, so no capacity is relied on.`);
  } else {
    out.push('No test has been recorded. Capacity and condition are unknown.');
  }
  if (p.attempts.length === 0 && p.redacted && (p.battery.restorationBatchId || p.events.some((e) => e.type === 'restoration'))) {
    out.push('The battery went through restoration under the same identity. Process details are controlled information and are not shown to your role.');
  }
  if (p.attempts.length > 0) {
    out.push(
      `${p.attempts.length} restoration attempt${p.attempts.length > 1 ? 's' : ''} ${p.attempts.length > 1 ? 'are' : 'is'} recorded under the same identity (latest: ${titleCase(p.attempts[p.attempts.length - 1].status)}).`,
    );
  }
  const approval = [...p.events].reverse().find((e) => e.type === 'approval' || e.type === 'rejection');
  if (approval) {
    const why = approval.reason.trim().replace(/[.\s]+$/, '');
    out.push(`Decision recorded: ${approval.title}. ${approval.actorName}, ${formatDate(approval.occurredAt)}${why ? `, reason given: “${why}”` : ''}.`);
  }
  const now = p.assignments.find((a) => !a.endAt);
  if (now) out.push(`It is currently deployed at ${now.siteName}, ${now.bankName} / ${now.stringName}, position ${now.position}.`);
  else if (p.assignments.length > 0) out.push(`It was previously deployed ${p.assignments.length} time(s) and is now ${LIFECYCLE_LABELS[b.lifecycleState].toLowerCase()}.`);
  else out.push(`It has not been deployed. Current state: ${LIFECYCLE_LABELS[b.lifecycleState]}, at ${b.physicalLocation}.`);
  if (p.recycling) out.push(`Recycling: ${titleCase(p.recycling.state)} with ${p.recycling.recyclerName}; certificate ${p.recycling.certificateState === 'received' ? 'received' : 'not yet received'}.`);
  return out;
}

/* ------------------------------ story strip ------------------------------ */

type StageState = 'done' | 'current' | 'pending' | 'skipped' | 'problem';
interface Stage {
  key: string;
  label: string;
  state: StageState;
  detail: string;
}

export function storyStages(p: BatteryPassport): Stage[] {
  const s = p.battery.lifecycleState;
  const intake = p.events.find((e) => e.type === 'intake');
  const hasTest = p.tests.some((t) => t.status !== 'draft');
  const approvedTests = p.tests.filter((t) => t.status === 'approved');
  const qualifiedEver = p.events.some((e) => e.newState === 'qualified');
  const rejected = s === 'rejected' || (s === 'recycling_queue' && p.events.some((e) => e.newState === 'rejected')) || (s === 'recycled' && p.events.some((e) => e.newState === 'rejected'));
  const everDeployed = p.assignments.length > 0;
  // Customer audiences do not receive attempts, so restoration is inferred from the timeline and batch link.
  const restoredEver = p.attempts.length > 0 || p.battery.restorationBatchId !== null || p.events.some((e) => e.type === 'restoration');
  const deployedNow = s === 'deployed';
  const stages: Stage[] = [
    { key: 'intake', label: 'Intake', state: 'done', detail: intake ? formatDate(intake.occurredAt) : 'Recorded' },
    {
      key: 'test', label: 'Tested', state: approvedTests.length ? 'done' : hasTest ? 'current' : 'pending',
      detail: approvedTests.length ? `${approvedTests.length} approved` : hasTest ? 'Awaiting approval' : 'No test yet',
    },
    {
      key: 'restore', label: 'Restored', state: restoredEver ? 'done' : 'skipped',
      detail: p.attempts.length ? `${p.attempts.length} attempt${p.attempts.length > 1 ? 's' : ''}` : restoredEver ? 'Details not shown to your role' : 'Not restored',
    },
    {
      key: 'qualify', label: 'Qualified', state: rejected ? 'problem' : qualifiedEver ? 'done' : 'pending',
      detail: rejected ? 'Rejected' : qualifiedEver ? 'Approved by engineer' : 'Not qualified',
    },
    {
      key: 'deploy', label: 'Deployed', state: deployedNow ? 'current' : everDeployed ? 'done' : 'pending',
      detail: deployedNow ? 'In service' : everDeployed ? 'Previously deployed' : 'Not deployed',
    },
    {
      key: 'recycle', label: 'Recycled', state: s === 'recycled' ? 'done' : s === 'recycling_queue' ? 'current' : 'pending',
      detail: s === 'recycled' ? 'Recycled' : s === 'recycling_queue' ? 'Queued' : 'Not at end of life',
    },
  ];
  return stages;
}

export function StoryStrip({ passport }: { passport: BatteryPassport }) {
  const stages = storyStages(passport);
  const tone: Record<StageState, string> = {
    done: 'border-teal bg-teal text-white',
    current: 'border-teal bg-white text-teal-800 ring-4 ring-teal-100',
    pending: 'border-[#9FB2BD] bg-white text-muted',
    skipped: 'border-dashed border-[#9FB2BD] bg-canvas text-muted',
    problem: 'border-critical bg-critical text-white',
  };
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Lifecycle progress">
      {stages.map((st, i) => (
        <li key={st.key} className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${tone[st.state]}`} aria-hidden>
            {st.state === 'problem' ? <XCircle className="h-4 w-4" /> : st.state === 'done' ? <BadgeCheck className="h-4 w-4" /> : i + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-navy">{st.label}</p>
            <p className="text-xs text-muted">{st.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ identity ------------------------------ */

export function IdentityCard({ p }: { p: BatteryPassport }) {
  const b = p.battery;
  return (
    <Section title="Identity" description="Four separate identifiers. None is derived from another.">
      <KeyValue
        columns={2}
        items={[
          { label: 'Internal ID (permanent)', value: <span className="mono break-all">{b.id}</span>, hint: 'Never reused. Survives restoration, redeployment and correction.' },
          { label: 'Printed label', value: <span className="mono">{b.label}</span>, hint: 'Human-readable. Not the identity.' },
          { label: 'QR lookup reference', value: <span className="mono">{b.publicRef}</span>, hint: 'Finds the record. It does not authorise access to it.' },
          { label: 'Manufacturer serial', value: b.manufacturerSerial ? <span className="mono">{b.manufacturerSerial}</span> : <span className="text-muted">Not recorded</span> },
          { label: 'Manufactured', value: b.manufacturedOn ? formatDate(b.manufacturedOn) : <span className="text-muted">Not recorded</span> },
          { label: 'Source system', value: b.sourceSystem },
        ]}
      />
      {p.aliases.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[13px] font-medium text-muted">Aliases</p>
          <ul className="mt-2 space-y-1 text-sm">
            {p.aliases.map((a) => (
              <li key={a.id}>
                <span className="mono">{a.value}</span> <span className="text-muted">· {titleCase(a.kind)} · from {a.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.retiredRefs.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[13px] font-medium text-muted">Retired QR references</p>
          <ul className="mt-2 space-y-1 text-sm">
            {p.retiredRefs.map((a) => (
              <li key={a.id}>
                <span className="mono">{a.value}</span> <span className="text-muted">· no longer resolves to this record; scans show it as retired</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.relatedBatteries.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[13px] font-medium text-muted">Linked records (not merged)</p>
          <ul className="mt-2 space-y-1 text-sm">
            {p.relatedBatteries.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted" aria-hidden />
                <Link href={`/app/batteries/${r.id}`} className="mono text-teal-800 underline underline-offset-2">
                  {r.label}
                </Link>
                <span className="text-muted">{r.relation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 rounded-md bg-canvas p-3 text-xs text-muted">
        Restoration keeps this identity. A physical replacement is a different battery and receives a new identity, linked to the one it replaced.
      </p>
    </Section>
  );
}

/* ------------------------------ timeline ------------------------------ */

const EVENT_ICON: Record<LifecycleEventType, typeof CircleDot> = {
  intake: ClipboardCheck, test: FlaskConical, restoration: Wrench, approval: BadgeCheck, rejection: XCircle, rework: Repeat,
  movement: MapPin, deployment: MapPin, alert: AlertTriangle, service: Wrench, return: Undo2, recycling: Recycle, identity: ScanLine,
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <EmptyState title="No lifecycle events yet" />;
  const ordered = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6" aria-label="Lifecycle timeline, newest first">
      {ordered.map((e) => {
        const Icon = EVENT_ICON[e.type] ?? CircleDot;
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[37px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-navy text-white">
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-navy">{e.title}</h3>
              {e.approvalState !== 'not_required' && <ApprovalBadge state={e.approvalState} />}
              {e.dateCertainty === 'approximate' && <Badge tone="amber" title="Reconstructed from legacy records">Date approximate</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {formatDateTime(e.occurredAt)} · {e.actorName} · source: {e.sourceSystem}
              {e.recordedAt !== e.occurredAt && <> · recorded {formatDateTime(e.recordedAt)}</>}
            </p>
            {e.previousState && e.newState && e.previousState !== e.newState && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <LifecycleBadge state={e.previousState} /> <ArrowRight className="h-3 w-3" aria-hidden /> <LifecycleBadge state={e.newState} />
              </p>
            )}
            {e.reason && <p className="mt-1.5 text-sm text-ink">{e.reason}</p>}
            {e.correction && (
              <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                Correction to <strong>{e.correction.field}</strong>: was “{e.correction.previous ?? 'not recorded'}”, now “{e.correction.next ?? 'not recorded'}”. The original value is retained here.
              </p>
            )}
            {e.evidence.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {e.evidence.map((f) => (
                  <li key={f.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-xs">
                    <FileText className="h-3 w-3" aria-hidden /> {f.fileName}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ tests ------------------------------ */

const KIND_LABEL: Record<string, string> = {
  intake_inspection: 'Intake inspection', initial: 'Initial test', final: 'Final test', periodic: 'Periodic test',
};

export function TestsPanel({ p }: { p: BatteryPassport }) {
  const rated = p.family.ratedCapacityAh;
  const cols: Column<TestSession>[] = [
    { key: 'kind', header: 'Test', mobile: 'title', cell: (t) => KIND_LABEL[t.kind] ?? t.kind },
    { key: 'date', header: 'Started', sort: (t) => t.startedAt, cell: (t) => formatDateTime(t.startedAt) },
    { key: 'status', header: 'Status', cell: (t) => <TestStatusBadge status={t.status} /> },
    {
      key: 'cap', header: 'Capacity', align: 'right', sort: (t) => t.result.capacityAh,
      cell: (t) =>
        t.result.capacityAh === null ? (
          <span className="text-muted">Not measured</span>
        ) : (
          <span>
            {formatNumber(t.result.capacityAh, 0, 'Ah')}
            <span className="block text-xs text-muted">{formatNumber((t.result.capacityAh / rated) * 100, 0)}% of rated</span>
          </span>
        ),
    },
    { key: 'ocv', header: 'Voltage / resistance', cell: (t) => `${formatNumber(t.result.openCircuitVoltageV, 2, 'V')} · ${formatNumber(t.result.internalResistanceMOhm, 2, 'mΩ')}` },
    { key: 'instr', header: 'Instrument', cell: (t) => <span>{t.instrument}<span className="block text-xs text-muted">Cal. {t.calibrationRef}</span></span> },
    { key: 'who', header: 'Operator / reviewer', cell: (t) => <span>{t.operatorName}<span className="block text-xs text-muted">{t.reviewerName ? `Reviewed by ${t.reviewerName}` : 'Not reviewed'}</span></span> },
  ];
  return (
    <div className="space-y-6">
      {p.tests.length === 0 ? (
        <EmptyState title="No tests recorded" description="Capacity and condition are unknown until a test is recorded and approved." />
      ) : (
        <Section title="Battery-level tests" description="Capacity is a measured discharge under the stated conditions. It is not temperature-corrected." tone="flush">
          <div className="p-3 md:p-4">
            <DataTable caption="Battery-level tests" columns={cols} rows={p.tests} rowKey={(t) => t.id} initialSort={{ key: 'date', dir: 'desc' }} />
          </div>
        </Section>
      )}
      {p.stringTests.length > 0 && (
        <Section title="String-level tests covering this battery" description="A string result describes the series string. It is never a per-battery capacity.">
          <ul className="space-y-3">
            {p.stringTests.map((t) => (
              <li key={t.id} className="rounded-md border border-line p-3 text-sm">
                <p className="font-semibold text-navy">{t.stringName} · {KIND_LABEL[t.kind]}</p>
                <p className="text-muted">
                  {formatDateTime(t.startedAt)} · {formatNumber(t.result.capacityAh, 0, 'Ah')} string result · <TestStatusBadge status={t.status} />
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------ restoration ------------------------------ */

export function RestorationPanel({ p }: { p: BatteryPassport }) {
  if (p.redacted) {
    return (
      <Notice tone="info" title="Process details are not shown to your role">
        Restoration process notes, lot references and internal evidence are controlled information. Test results and the final decision remain visible in the timeline and Tests tab.
      </Notice>
    );
  }
  if (p.attempts.length === 0) return <EmptyState title="No restoration attempts" description="This battery has not been through restoration." />;
  return (
    <ol className="space-y-4">
      {p.attempts.map((a: RestorationAttempt) => (
        <li key={a.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-navy">Attempt {a.attemptNo}</h3>
            <Badge tone={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : a.status === 'rework' ? 'amber' : 'teal'}>{titleCase(a.status)}</Badge>
            <span className="text-sm text-muted">Started {formatDate(a.startedAt)}</span>
          </div>
          {a.decisionReason && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Decision{a.deciderName ? ` by ${a.deciderName}` : ''}:</span> {a.decisionReason}
            </p>
          )}
          {a.lotRefs.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              Lot references: {a.lotRefs.map((l) => `${titleCase(l.kind)} ${l.ref}`).join(', ')}
            </p>
          )}
          {a.notes.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              {a.notes.map((n) => (
                <li key={n.id}>
                  <span className="text-muted">{formatDateTime(n.at)} · {n.actorName}:</span> {n.text}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ deployments ------------------------------ */

export function DeploymentPanel({ p }: { p: BatteryPassport }) {
  const cols: Column<AssignmentView>[] = [
    { key: 'site', header: 'Site', mobile: 'title', cell: (a) => a.siteName },
    { key: 'pos', header: 'Position', cell: (a) => `${a.bankName} / ${a.stringName} / ${a.position}` },
    { key: 'from', header: 'From', sort: (a) => a.startAt, cell: (a) => formatDateTime(a.startAt) },
    { key: 'to', header: 'To', cell: (a) => (a.endAt ? formatDateTime(a.endAt) : <Badge tone="teal">Current</Badge>) },
    { key: 'reason', header: 'Reason', cell: (a) => a.reason },
  ];
  if (p.assignments.length === 0) return <EmptyState title="Never deployed" description={`Currently at: ${p.battery.physicalLocation}.`} />;
  return <DataTable caption="Deployment history" columns={cols} rows={p.assignments} rowKey={(a) => a.id} initialSort={{ key: 'from', dir: 'desc' }} />;
}

/* ------------------------------ telemetry ------------------------------ */

export function TelemetryPanel({ p }: { p: BatteryPassport }) {
  const [days, setDays] = useState(14);
  const t = p.telemetry;
  const series = useSvcQuery(['telemetry', 'series', p.battery.id, days], (s) => s.telemetry.series(p.battery.id, days), { enabled: t.available });
  const peers = useSvcQuery(['telemetry', 'peers', p.battery.id, days], (s) => s.telemetry.stringPeers(p.battery.id, days), { enabled: t.available });

  if (!t.available) {
    return (
      <EmptyState
        icon={Lock}
        title="No telemetry for this battery"
        description={`${t.reason} Nothing is estimated in its place.`}
      />
    );
  }
  return (
    <div className="space-y-6">
      <Notice tone="synthetic" title="Synthetic telemetry">
        These readings are generated for the demonstration. No sensor or gateway is connected.
      </Notice>
      <Section title="Latest reading">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Voltage', formatNumber(t.voltageV, 2, 'V'), 'measured'],
            ['Temperature', formatNumber(t.temperatureC, 1, '°C'), 'measured'],
            [
              'Internal resistance',
              t.resistanceMOhm === null ? 'Unknown' : formatNumber(t.resistanceMOhm, 2, 'mΩ'),
              t.resistanceSource === 'measured' ? 'measured' : t.resistanceSource === 'inferred' ? 'inferred' : 'unknown',
            ],
          ].map(([label, value, kind]) => (
            <div key={label} className="rounded-md border border-line p-3">
              <p className="text-[13px] font-medium text-muted">{label}</p>
              <p className="mt-1 text-xl font-semibold text-navy">{value}</p>
              <div className="mt-2">
                <ValueKindBadge kind={kind as 'measured' | 'inferred' | 'unknown'} />
              </div>
            </div>
          ))}
          <div className="rounded-md border border-line p-3">
            <p className="text-[13px] font-medium text-muted">Freshness</p>
            <p className="mt-1 text-sm text-ink">{t.lastReadingAt ? formatDateTime(t.lastReadingAt) : 'No reading'}</p>
            <div className="mt-2">
              <FreshnessBadge freshness={t.freshness} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <KeyValue
            columns={3}
            items={[
              { label: 'Sensor', value: t.sensorSerial ?? 'Unknown' },
              { label: 'Data completeness (30 d)', value: t.completenessPct === null ? 'Unknown' : `${formatNumber(t.completenessPct, 0)}%` },
              { label: 'Sensor–slot mapping', value: t.mappingQuality === 'verified' ? 'Verified by a person' : t.mappingQuality === 'unverified' ? 'Unverified' : 'Unknown' },
              { label: 'Hours above 30 °C (30 d)', value: t.hoursAbove30C === null ? 'Unknown' : formatNumber(t.hoursAbove30C, 0, 'h') },
            ]}
          />
        </div>
        {t.resistanceSource !== 'measured' && (
          <p className="mt-3 text-sm text-muted">
            {t.resistanceSource === 'inferred'
              ? 'Resistance is inferred by sensor firmware, not directly measured. Treat it as an indicator, not a test result.'
              : 'This sensor does not report resistance. It is shown as unknown rather than estimated.'}
          </p>
        )}
      </Section>

      <Section
        title="History"
        actions={
          <div className="w-40">
            <label htmlFor="tel-days" className="sr-only">Period</label>
            <Select id="tel-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </Select>
          </div>
        }
      >
        <QueryView query={series}>
          {(s) => (
            <div className="space-y-6">
              <p className="text-xs text-muted">{s.note} Each point averages {s.bucketHours} hour(s). Gaps are missing readings and are not filled.</p>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-navy">Voltage (V)</h3>
                <TimeSeriesChart
                  label="Battery voltage over time"
                  unit="V"
                  summary={`Voltage over the last ${days} days.`}
                  points={s.points.map((x) => ({ t: x.t, v: x.voltageV }))}
                  series={[{ key: 'v', name: 'Voltage', color: '#007E83' }]}
                  height={200}
                />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold text-navy">Temperature (°C)</h3>
                <TimeSeriesChart
                  label="Battery temperature over time"
                  unit="°C"
                  summary={`Temperature over the last ${days} days, with the 30 °C reference.`}
                  points={s.points.map((x) => ({ t: x.t, v: x.temperatureC }))}
                  series={[{ key: 'v', name: 'Temperature', color: '#946718' }]}
                  referenceLine={{ y: 30, label: '30 °C reference' }}
                  height={200}
                />
              </div>
              {t.resistanceSource !== 'unavailable' && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-navy">
                    Internal resistance (mΩ) {t.resistanceSource === 'inferred' && <span className="font-normal text-muted">· inferred</span>}
                  </h3>
                  <TimeSeriesChart
                    label="Internal resistance over time"
                    unit="mΩ"
                    summary={`Resistance over the last ${days} days.`}
                    points={s.points.map((x) => ({ t: x.t, v: x.resistanceMOhm }))}
                    series={[{ key: 'v', name: 'Resistance', color: '#112B40' }]}
                    height={200}
                  />
                </div>
              )}
            </div>
          )}
        </QueryView>
      </Section>

      {peers.data && peers.data.points.length > 0 && (
        <Section title="Compared with its string" description="Voltage of this battery against the median of the other batteries in the same string. Differences are context, not a diagnosis.">
          <TimeSeriesChart
            label="This battery against string median voltage"
            unit="V"
            summary="Own voltage and the median of string peers."
            points={peers.data.points.map((x) => ({ t: x.t, own: x.own, peer: x.peerMedian }))}
            series={[
              { key: 'own', name: 'This battery', color: '#007E83' },
              { key: 'peer', name: 'String median', color: '#647985', dashed: true },
            ]}
            height={220}
          />
        </Section>
      )}
    </div>
  );
}

/* ------------------------------ costs ------------------------------ */

const COST_LABEL: Record<CostEntry['kind'], string> = {
  acquisition: 'Acquisition', collection: 'Collection', testing: 'Testing', restoration_inputs: 'Restoration inputs',
  logistics: 'Logistics', installation: 'Installation', service: 'Service', warranty_provision: 'Warranty provision',
};

export function CostsPanel({ p }: { p: BatteryPassport }) {
  if (p.costs === null) {
    return (
      <Notice tone="info" title="Costs are not visible to your role">
        Internal cost entries are shown only to roles with commercial access.
      </Notice>
    );
  }
  if (p.costs.length === 0) return <EmptyState title="No cost entries" description="No cost has been recorded. That is unknown, not zero." />;
  const known = p.costs.filter((c) => c.amountAed !== null);
  const unknown = p.costs.length - known.length;
  const total = known.reduce((s, c) => s + (c.amountAed ?? 0), 0);
  const cols: Column<CostEntry>[] = [
    { key: 'kind', header: 'Cost', mobile: 'title', cell: (c) => COST_LABEL[c.kind] },
    {
      key: 'amt', header: 'Amount', align: 'right', sort: (c) => c.amountAed,
      cell: (c) => (c.amountAed === null ? <Badge tone="amber">Unknown</Badge> : formatAed(c.amountAed)),
    },
    {
      key: 'basis', header: 'Basis',
      cell: (c) => (
        <span>
          <Badge tone={c.allocation === 'direct' ? 'neutral' : 'amber'}>{titleCase(c.allocation)}</Badge>
          {c.allocationBasis && <span className="mt-1 block text-xs text-muted">{c.allocationBasis}</span>}
        </span>
      ),
    },
    { key: 'on', header: 'Recorded', sort: (c) => c.recordedOn, cell: (c) => formatDate(c.recordedOn) },
    { key: 'src', header: 'Source', cell: (c) => <span>{c.source}{c.note && <span className="block text-xs text-muted">{c.note}</span>}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-baseline gap-x-6 gap-y-1 p-4">
        <div>
          <p className="text-[13px] font-medium text-muted">Known costs listed</p>
          <p className="text-2xl font-semibold text-navy">{formatAed(total)}</p>
        </div>
        {unknown > 0 && (
          <p className="text-sm text-amber-700">
            {unknown} entr{unknown > 1 ? 'ies are' : 'y is'} unknown, so this total is a minimum, not the full cost.
          </p>
        )}
      </div>
      <DataTable caption="Cost entries" columns={cols} rows={p.costs} rowKey={(c) => c.id} />
    </div>
  );
}

/* ------------------------------ warranty ------------------------------ */

export function WarrantyPanel({ p }: { p: BatteryPassport }) {
  const w = p.warranty;
  if (!w) return <EmptyState title="No warranty record" description="Warranty terms have not been recorded for this battery." />;
  return (
    <div className="space-y-5">
      <Section title="Warranty terms">
        <div className="mb-4">
          <WarrantyBadge state={w.state} />
        </div>
        <KeyValue
          columns={3}
          items={[
            { label: 'Terms reference', value: w.termsRef ?? 'Unknown' },
            { label: 'Starts', value: formatDate(w.startsOn) },
            { label: 'Ends', value: formatDate(w.endsOn) },
          ]}
        />
      </Section>
      <Section title="Claims" description="A finding is what was observed. A confirmed cause is only recorded after investigation.">
        {w.claims.length === 0 ? (
          <p className="text-sm text-muted">No claims have been opened.</p>
        ) : (
          <ul className="space-y-4">
            {w.claims.map((c) => (
              <li key={c.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-navy">{c.summary}</h3>
                  <Badge tone={c.status === 'open' ? 'amber' : 'neutral'}>{titleCase(c.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">Opened {formatDate(c.openedOn)}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[13px] font-medium text-muted">Finding</dt>
                    <dd>{c.finding}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium text-muted">Confirmed cause</dt>
                    <dd>{c.confirmedCause ?? <span className="text-muted">Not confirmed</span>}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {p.recycling && (
        <Section title="End of life">
          <KeyValue
            columns={3}
            items={[
              { label: 'Recycler', value: p.recycling.recyclerName },
              { label: 'State', value: titleCase(p.recycling.state) },
              { label: 'Consignment', value: p.recycling.consignmentRef ?? 'Not yet consigned' },
              { label: 'Mass', value: p.recycling.massKg === null ? 'Not recorded' : formatNumber(p.recycling.massKg, 1, 'kg') },
              { label: 'Certificate', value: p.recycling.certificateState === 'received' ? `Received (${p.recycling.certificateRef ?? 'reference not recorded'})` : 'Not received' },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

/* ------------------------------ evidence ------------------------------ */

const CLASS_TONE = { customer_visible: 'green', internal: 'neutral', controlled: 'amber' } as const;
const CLASS_LABEL = { customer_visible: 'Customer-visible', internal: 'Internal', controlled: 'Controlled' } as const;

export function EvidencePanel({ p }: { p: BatteryPassport }) {
  if (p.evidence.length === 0) return <EmptyState title="No evidence files" description="Photos, reports and certificates attached to this battery appear here." />;
  const cols: Column<EvidenceFile>[] = [
    { key: 'name', header: 'File', mobile: 'title', cell: (e) => <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4 text-muted" aria-hidden />{e.fileName}</span> },
    { key: 'kind', header: 'Type', cell: (e) => titleCase(e.kind) },
    { key: 'class', header: 'Visibility', cell: (e) => <Badge tone={CLASS_TONE[e.classification]}>{CLASS_LABEL[e.classification]}</Badge> },
    { key: 'by', header: 'Uploaded', sort: (e) => e.uploadedAt, cell: (e) => <span>{formatDate(e.uploadedAt)}<span className="block text-xs text-muted">{e.uploadedByName}</span></span> },
    { key: 'sum', header: 'SHA-256', cell: (e) => (e.storageKey ? <span className="mono text-xs" title={e.checksum}>{e.checksum.slice(0, 12)}…</span> : <span className="text-xs text-muted">None</span>) },
    { key: 'file', header: 'File', mobile: 'show', cell: (e) => <span className="flex flex-wrap items-center gap-2"><StorageBadge e={e} /><EvidenceDownload e={e} /></span> },
  ];
  const anyStored = p.evidence.some((e) => e.storageKey);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {anyStored
          ? 'Stored files are kept under their SHA-256 checksum and checked on every download. Each download is recorded in the audit trail.'
          : 'Only file names are recorded for these entries; no file contents are stored.'}
      </p>
      <DataTable caption="Evidence files" columns={cols} rows={p.evidence} rowKey={(e) => e.id} initialSort={{ key: 'by', dir: 'desc' }} />
    </div>
  );
}

/* ------------------------------ audit ------------------------------ */

export function AuditPanel({ p }: { p: BatteryPassport }) {
  if (p.audit === null) {
    return (
      <Notice tone="info" title="Audit history is not visible to your role">
        The audit trail is available to engineering and administration roles.
      </Notice>
    );
  }
  if (p.audit.length === 0) return <EmptyState icon={History} title="No audit events" />;
  const cols: Column<AuditEvent>[] = [
    { key: 'at', header: 'When', mobile: 'title', sort: (a) => a.at, cell: (a) => formatDateTime(a.at) },
    { key: 'who', header: 'Who', cell: (a) => <span>{a.actorName}<span className="block text-xs text-muted">{titleCase(String(a.role))}</span></span> },
    { key: 'action', header: 'Action', cell: (a) => <span className="mono">{a.action}</span> },
    { key: 'sum', header: 'Detail', cell: (a) => a.summary },
    { key: 'out', header: 'Outcome', cell: (a) => (a.outcome === 'denied' ? <Badge tone="red" icon={ShieldCheck}>Denied</Badge> : <Badge tone="green">Recorded</Badge>) },
  ];
  return <DataTable caption="Audit history" columns={cols} rows={p.audit} rowKey={(a) => a.id} initialSort={{ key: 'at', dir: 'desc' }} pageSize={15} />;
}


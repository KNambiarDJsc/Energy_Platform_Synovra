'use client';
import { ArrowRight, CalendarClock, Download, FileCheck2, Wrench } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { BasisLegend, DemoDataNotice, HierarchyTrail, IndicatorList } from '@/components/customer/Parts';
import { RequestDialog } from '@/components/customer/RequestDialog';
import { Button } from '@/components/ui/Button';
import { Breadcrumbs, KeyValue, Notice, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { FactorDot, FACTOR_WORD, StatusBadge } from '@/components/ui/Status';
import { WarrantyBadge } from '@/components/ui/Badge';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { buildIndicators, buildTimeline, customerEvidence, customerName, hierarchyOf, lastUpdated, BASIS_LABELS, SCOPE_LABELS, TIMELINE_KIND_LABELS } from '@/lib/customer/model';
import { batteryRecordCsv } from '@/lib/customer/report';
import type { RequestKind } from '@/lib/customer/requests';
import { formatDate, formatDateTime, downloadText } from '@/lib/format';
import { useSession, useSvcQuery } from '@/lib/hooks';

export default function CustomerBatteryPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [request, setRequest] = useState<RequestKind | null>(null);

  const q = useSvcQuery(['customer', 'battery', id], async (s) => {
    const [passport, sites, home] = await Promise.all([s.batteries.get(id), s.deployments.sites(), s.overview.home()]);
    return { passport, sites, snapshotAt: home.snapshotAt };
  });

  return (
    <QueryView query={q} skeleton={<LoadingBlock label="Loading battery record" rows={6} />}>
      {({ passport: p, sites, snapshotAt }) => {
        const loc = p.location;
        const siteView = sites.find((s) => s.site.id === loc.siteId);
        const stringView = siteView?.strings.find((s) => s.string.name === loc.stringName);
        // A battery record belongs to the operator's tenant. The customer is whoever owns the site it sits at.
        const customer = customerName(siteView?.site.tenantId ?? '');
        const levels = hierarchyOf(p, customer, siteView?.site.kind ?? null, stringView?.string.nominalVoltageV ?? null);
        const indicators = buildIndicators(p, snapshotAt);
        const timeline = buildTimeline(p);
        const files = customerEvidence(p.evidence);
        const updated = lastUpdated(p);
        const retired = p.status.status === 'retired';
        const canAct = !!loc.siteId && !retired;

        const exportRecord = () => downloadText(`battery-record-${p.battery.label}.csv`, batteryRecordCsv(
          p,
          indicators.map((i) => ({ label: i.label, value: i.value === null ? (i.absent === 'baseline' ? 'Baseline being established' : 'Data unavailable') : `${i.value}${i.unit ? ` ${i.unit}` : ''}`, basis: BASIS_LABELS[i.basis].label, scope: SCOPE_LABELS[i.scope], at: i.at ?? '', source: i.source, freshness: i.freshness })),
          timeline.map((t) => ({ at: t.at.slice(0, 10), title: t.title, detail: t.detail })),
        ));

        return (
          <div className="app-stagger space-y-5">
            <Breadcrumbs items={[{ label: 'Your batteries', href: '/app/customer' }, ...(loc.siteName ? [{ label: loc.siteName }] : []), { label: p.battery.label }]} />
            <DemoDataNotice />

            <section className="card p-6 md:p-8" aria-labelledby="bat-h">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 id="bat-h" className="mono text-[34px] leading-10 text-ink md:text-[40px]">{p.battery.label}</h1>
                    <StatusBadge status={p.status.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{p.family.manufacturer} {p.family.model} · {p.family.chemistry} · {LIFECYCLE_LABELS[p.battery.lifecycleState]}</p>
                  <p className="mt-4 max-w-[62ch] text-[19px] leading-7 text-ink" data-testid="status-headline">{p.status.headline}</p>
                  <p className="mt-3 flex items-start gap-1.5 text-[15px] text-copper-700" data-testid="next-step"><ArrowRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />{p.status.nextStep}</p>
                  <p className="mt-3 text-[13px] text-muted">Record last updated {formatDateTime(updated)}. Snapshot taken {formatDateTime(snapshotAt)}.</p>
                </div>
                <div className="no-print flex flex-wrap gap-2 md:max-w-[19rem] md:justify-end">
                  <Button icon={<Wrench className="h-4 w-4" aria-hidden />} disabled={!canAct} onClick={() => setRequest('maintenance')}>Request maintenance</Button>
                  <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" aria-hidden />} disabled={!canAct} onClick={() => setRequest('replacement')}>Plan replacement</Button>
                  <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} onClick={exportRecord}>Export record</Button>
                </div>
              </div>
              <div className="mt-6"><HierarchyTrail levels={levels} /></div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <Section title="Why it has this status" id="why" description={`Fixed rule ${p.status.rule.name} ${p.status.rule.version}${p.status.rule.placeholder ? ', placeholder thresholds' : ''}. Each line is the evidence behind it.`}>
                  {p.status.factors.length === 0 ? <p className="text-sm text-muted">No recorded checks yet.</p> : (
                    <ul className="space-y-3" aria-label="Checks behind the status">
                      {p.status.factors.map((f) => (
                        <li key={f.key} className="flex items-start gap-3" data-factor={f.key}>
                          <span className="mt-[7px]"><FactorDot state={f.state} /></span>
                          <span className="min-w-0 text-[15px] leading-6 text-ink"><span className="font-medium">{f.label}</span> <span className="text-muted">· {FACTOR_WORD[f.state]} · {BASIS_LABELS[f.kind === 'rule' ? 'calculated' : f.kind === 'controlled' ? 'demo_only' : f.kind].label}</span><span className="block text-ink-2">{f.detail}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Condition indicators" id="indicators" description="What the record can support. Each value shows what kind of value it is, what it describes, when it was taken and where it came from.">
                  <IndicatorList items={indicators} />
                </Section>

                <Section title="History" id="history" description="Tests, service, deployment and replacement, newest first. Internal process details are not shown.">
                  {timeline.length === 0 ? <p className="text-sm text-muted">No events are recorded.</p> : (
                    <ol className="relative space-y-5 border-l border-line pl-5" aria-label="History">
                      {timeline.map((t) => (
                        <li key={t.id} className="relative" data-testid="timeline-item">
                          <span className="absolute -left-[25px] top-2 h-2 w-2 rounded-full bg-ink" aria-hidden />
                          <p className="font-mono text-[12px] uppercase tracking-[0.05em] text-muted">{TIMELINE_KIND_LABELS[t.kind]} · {formatDate(t.at)}{t.approximate && ' (approximate date)'}</p>
                          <p className="mt-0.5 text-[15px] font-medium text-ink">{t.title}</p>
                          {t.detail && <p className="text-sm text-ink-2">{t.detail}</p>}
                          {t.evidence.length > 0 && <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted"><FileCheck2 className="h-3.5 w-3.5" aria-hidden />{t.evidence.map((e) => e.fileName).join(', ')}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {p.relatedBatteries.some((r) => /replac/i.test(r.relation)) && (
                    <Notice tone="info" className="mt-5" title="Replacement">
                      {p.relatedBatteries.filter((r) => /replac/i.test(r.relation)).map((r) => <span key={r.id} className="block">{r.label}: {r.relation.toLowerCase()}</span>)}
                    </Notice>
                  )}
                </Section>
              </div>

              <div className="space-y-5">
                <Section title="Battery" id="identity">
                  <KeyValue columns={1} items={[
                    { label: 'Battery ID', value: <span className="mono break-all">{p.battery.id}</span>, hint: 'Permanent. Never reused.' },
                    { label: 'Chemistry and type', value: `${p.family.chemistry}, ${p.family.unitType}` },
                    { label: 'Rated voltage', value: `${p.family.ratedVoltageV} V` },
                    { label: 'Rated capacity', value: `${p.family.ratedCapacityAh} Ah`, hint: p.family.ratingConditions },
                    { label: 'Manufacturer serial', value: p.battery.manufacturerSerial ?? 'Not recorded' },
                    { label: 'Manufactured', value: p.battery.manufacturedOn ? formatDate(p.battery.manufacturedOn) : 'Not recorded' },
                    { label: 'Location', value: loc.siteName ? `${loc.siteName}, ${loc.bankName} / ${loc.stringName}, position ${loc.position}` : p.battery.physicalLocation },
                    ...(p.warranty ? [{ label: 'Warranty', value: <span className="flex flex-wrap items-center gap-2"><WarrantyBadge state={p.warranty.state} />{p.warranty.endsOn && <span className="text-muted">to {formatDate(p.warranty.endsOn)}</span>}</span> }] : []),
                  ]} />
                </Section>

                <Section title="Evidence" id="evidence" description="Files you may open. Each has a checksum so a later copy can be checked against it.">
                  {files.length === 0 ? <p className="text-sm text-muted">No customer-visible files are recorded.</p> : (
                    <ul className="divide-y divide-line">
                      {files.map((f) => (
                        <li key={f.id} className="py-2.5 first:pt-0 last:pb-0">
                          <p className="break-all text-sm text-ink">{f.fileName}</p>
                          <p className="text-xs text-muted">{f.kind.replace(/_/g, ' ')} · {formatDate(f.uploadedAt)}</p>
                          <p className="mono break-all text-[11px] text-muted">SHA-256 {f.checksum.slice(0, 24)}…</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {p.recycling && (
                  <Section title="Recycling" id="recycling">
                    <KeyValue columns={1} items={[
                      { label: 'State', value: p.recycling.state },
                      { label: 'Recycler', value: p.recycling.recyclerName || 'Not recorded' },
                      { label: 'Consigned mass', value: p.recycling.massKg === null ? 'Not recorded' : `${p.recycling.massKg} kg`, hint: 'The mass handed over, not the weight of material recovered.' },
                      { label: 'Recycler certificate', value: p.recycling.certificateState === 'received' ? `Received${p.recycling.certificateRef ? `, ${p.recycling.certificateRef}` : ''}` : 'Not received' },
                    ]} />
                  </Section>
                )}

                <Section title="What the labels mean" id="basis"><BasisLegend className="sm:grid-cols-1" /></Section>
              </div>
            </div>

            {canAct && request && loc.siteId && (
              <RequestDialog
                open onOpenChange={(o) => { if (!o) setRequest(null); }} kind={request} battery={{ id: p.battery.id, label: p.battery.label }}
                site={{ id: loc.siteId, name: loc.siteName ?? loc.siteId }} role={session.role} suggestion={p.status.nextStep}
              />
            )}
          </div>
        );
      }}
    </QueryView>
  );
}

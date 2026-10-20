'use client';
import { Download, FileJson, Printer } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { DemoDataNotice } from '@/components/customer/Parts';
import { Button } from '@/components/ui/Button';
import { Field, Input, ToolbarSelect } from '@/components/ui/Field';
import { Breadcrumbs, Notice, PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { FRAMEWORKS, frameworkOf, type FrameworkId } from '@/lib/customer/frameworks';
import { useCustomerScope, useSiteData } from '@/lib/customer/hooks';
import { buildCustomerReport, reportToCsv, scenarioValueAed, valueSummary, type ReportSectionData, type SectionStatus } from '@/lib/customer/report';
import { downloadText, formatAed, formatDate } from '@/lib/format';

const STATUS_WORD: Record<SectionStatus, { label: string; tone: 'green' | 'amber' | 'neutral' }> = {
  populated: { label: 'Populated from records', tone: 'green' },
  partial: { label: 'Partly populated', tone: 'amber' },
  not_recorded: { label: 'Not recorded', tone: 'neutral' },
};

function SectionView({ s, n }: { s: ReportSectionData; n: number }) {
  const st = STATUS_WORD[s.status];
  return (
    <section className="card p-5 md:p-6 print:break-inside-avoid" aria-labelledby={`rs-${s.id}`} data-report-section={s.id} data-status={s.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`rs-${s.id}`} className="font-display text-[22px] leading-7 text-ink"><span className="mono mr-2 text-sm text-muted">{n}</span>{s.heading}</h3>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <p className="mt-1 text-[13px] text-muted">{s.basis}</p>
      {s.frameworkArea && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-2" data-testid="framework-area"><span className="font-medium text-ink">Candidate disclosure area (confirm): </span>{s.frameworkArea}</p>}
      <div className="mt-4 space-y-5">
        {s.tables.map((t, i) => (
          <div key={t.title ?? i}>
            {t.title && <h4 className="mb-1.5 text-sm font-semibold text-ink">{t.title}</h4>}
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label={t.title ?? s.heading}>
              <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-canvas"><tr>{t.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium text-ink-2">{c}</th>)}</tr></thead>
                <tbody>
                  {t.rows.length === 0 ? <tr><td colSpan={t.columns.length} className="px-3 py-3 text-muted">No rows in the records.</td></tr> : t.rows.map((r, ri) => (
                    <tr key={ri} className="border-t border-line align-top">{r.map((c, ci) => <td key={ci} className={ci === 0 ? 'px-3 py-2 font-medium text-ink' : 'px-3 py-2 text-ink-2'}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {s.notes.map((x) => <p key={x} className="mt-3 text-[13px] text-muted">{x}</p>)}
      {s.missing.length > 0 && (
        <div className="mt-4" data-testid="missing-inputs">
          <p className="text-[13px] font-semibold text-ink">Inputs still needed</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">{s.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function ReportBuilder() {
  const scope = useCustomerScope();
  const siteIds = scope.site ? [scope.site.id] : (scope.customer?.sites.map((s) => s.id) ?? []);
  const data = useSiteData(siteIds);
  const [framework, setFramework] = useState<FrameworkId>('none');
  const [from, setFrom] = useState('2025-10-13');
  const [to, setTo] = useState('2026-10-13');
  const [scn, setScn] = useState({ batteries: 4, priceAed: 1200, deferredPct: 25 });

  const report = useMemo(() => {
    if (!data.data || !scope.customer) return null;
    const sites = scope.site ? [scope.site] : scope.customer.sites;
    return buildCustomerReport({
      customerName: scope.customer.name, siteNames: sites.map((s) => `${s.name}, ${s.city}`), period: { from, to },
      generatedAt: new Date().toISOString(), snapshotAt: data.data.snapshotAt, passports: data.data.passports, framework,
    });
  }, [data.data, scope.customer, scope.site, from, to, framework]);

  const periodOk = from <= to;
  const stem = `synovra-demo-report-${scope.customer?.tenantId ?? 'customer'}-${scope.site?.id ?? 'all-sites'}`;
  const fw = frameworkOf(framework);

  return (
    <div className="app-stagger">
      <Breadcrumbs items={[{ label: 'Your batteries', href: '/app/customer' }, { label: 'Report preview' }]} />
      <PageHeader
        title="Operational and ESG data report"
        eyebrow={scope.customer ? `${scope.customer.name}, ${scope.site?.name ?? `all ${scope.customer.sites.length} sites`}` : undefined}
        description="Evidence from your battery records, with measured results, calculations and gaps kept apart. A data export for your own paperwork, not a compliance certificate."
        actions={report && periodOk ? (
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} onClick={() => downloadText(`${stem}.csv`, reportToCsv(report))}>Export CSV</Button>
            <Button variant="secondary" icon={<FileJson className="h-4 w-4" aria-hidden />} onClick={() => downloadText(`${stem}.json`, JSON.stringify(report, null, 2), 'application/json')}>Export JSON</Button>
            <Button icon={<Printer className="h-4 w-4" aria-hidden />} onClick={() => window.print()}>Print or save as PDF</Button>
          </>
        ) : undefined}
      />
      <DemoDataNotice className="mb-5" />

      <div className="no-print mb-5 card p-5" role="group" aria-label="Report settings">
        <div className="flex flex-wrap items-end gap-4">
          {scope.customers.length > 1 && (
            <ToolbarSelect label="Customer" value={scope.customer?.tenantId ?? ''} onChange={(e) => scope.choose({ customer: e.target.value })}>
              {scope.customers.map((c) => <option key={c.tenantId} value={c.tenantId}>{c.name}</option>)}
            </ToolbarSelect>
          )}
          <ToolbarSelect label="Site" value={scope.site?.id ?? ''} onChange={(e) => scope.choose({ site: e.target.value || null })}>
            <option value="">All sites ({scope.customer?.sites.length ?? 0})</option>
            {scope.customer?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </ToolbarSelect>
          <Field label="Period from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Period to" error={periodOk ? undefined : 'The end date is before the start date.'}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <ToolbarSelect label="Framework pointers" value={framework} onChange={(e) => setFramework(e.target.value as FrameworkId)}>
            {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.id === 'none' ? 'Framework pointers: none' : f.name}</option>)}
          </ToolbarSelect>
        </div>
      </div>

      <QueryView query={scope.query} skeleton={<LoadingBlock label="Loading" rows={3} />}>
        {() => (
          <QueryView query={data} skeleton={<LoadingBlock label="Building the report" rows={6} />}>
            {(d) => {
              const value = valueSummary(d.passports, d.snapshotAt);
              return (
                <div className="space-y-5">
                  {report && periodOk && (
                    <article className="space-y-5" aria-label="Report preview" data-testid="report-preview">
                      <header className="card p-6 md:p-8">
                        <p className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted">Synthetic demonstration data · Not a compliance certificate</p>
                        <h2 className="mt-2 font-display text-[30px] leading-9 text-ink md:text-[36px] md:leading-[42px]">{report.title}</h2>
                        <p className="mt-2 text-sm text-ink-2">{report.siteNames.join('; ')} · {formatDate(report.period.from)} to {formatDate(report.period.to)} · {report.batteryCount} batteries · generated {formatDate(report.generatedAt)}{fw.id !== 'none' && ` · pointers: ${fw.name}`}</p>
                      </header>
                      {report.sections.map((s, i) => <SectionView key={s.id} s={s} n={i + 1} />)}
                      <section className="card p-5 md:p-6" aria-labelledby="limits-h">
                        <h3 id="limits-h" className="font-display text-[22px] leading-7 text-ink">Limitations</h3>
                        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2" data-testid="limitations">{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                      </section>
                    </article>
                  )}

                  <Section title="What this gives you" id="value" description="A summary of what the records show your fleet. Counts from your records, not savings.">
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {value.map((v) => (
                        <div key={v.label} className="rounded-xl bg-canvas p-4">
                          <dt className="text-[13px] text-muted">{v.label}</dt>
                          <dd className="mt-1 text-[17px] font-semibold text-ink">{v.value}</dd>
                          <dd className="mt-1 text-[13px] leading-5 text-ink-2">{v.detail}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="mt-6 rounded-xl border border-dashed border-field p-4 no-print" data-testid="scenario">
                      <h4 className="text-sm font-semibold text-ink">Replacement scenario <span className="font-normal text-muted">(a what-if, not a result)</span></h4>
                      <p className="mt-1 text-[13px] text-muted">Change the assumptions to your own. The figures are illustrative defaults, not Synovra results, and no customer outcome supports them yet.</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Field label="Replacements considered"><Input type="number" min={0} value={scn.batteries} onChange={(e) => setScn({ ...scn, batteries: Number(e.target.value) })} /></Field>
                        <Field label="Assumed price of a new battery (AED)"><Input type="number" min={0} value={scn.priceAed} onChange={(e) => setScn({ ...scn, priceAed: Number(e.target.value) })} /></Field>
                        <Field label="Assumed share deferred (%)"><Input type="number" min={0} max={100} value={scn.deferredPct} onChange={(e) => setScn({ ...scn, deferredPct: Number(e.target.value) })} /></Field>
                      </div>
                      <p className="mt-3 text-[15px] text-ink" data-testid="scenario-result">
                        If {scn.batteries} replacements at {formatAed(scn.priceAed)} each had {scn.deferredPct}% deferred, the scenario is <strong>{formatAed(scenarioValueAed(scn))}</strong> of purchases deferred.
                      </p>
                      <p className="mt-1 text-[13px] text-muted">Scenario only. It assumes deferral is safe, which only an engineer can judge battery by battery.</p>
                    </div>
                  </Section>
                  <Notice tone="info" title="About framework pointers">
                    The pointers name disclosure areas a report might feed. They were written without checking the current official text, assign no GHG Protocol scope, and a reporting lead should confirm each one.
                  </Notice>
                </div>
              );
            }}
          </QueryView>
        )}
      </QueryView>
    </div>
  );
}

export default function CustomerReportPage() {
  return <Suspense fallback={<LoadingBlock />}><ReportBuilder /></Suspense>;
}

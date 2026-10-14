'use client';
import { Download, FileText, Printer } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { DEMO_NOTICE } from '@/data/seed';
import type { Report, ReportTemplateId } from '@/domain/types';
import { downloadText, formatDate, formatDateTime } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';

function ReportView({ r }: { r: Report }) {
  const session = useSession();
  const approve = useAction<string, Report>((s, id) => s.reports.approve(id), { success: 'Report approved by you and recorded.' });
  const csv = useAction<string, { fileName: string; csv: string }>((s, id) => s.reports.exportCsv(id), {
    onSuccess: (x) => downloadText(x.fileName, x.csv),
    success: 'CSV downloaded. The export is recorded in the audit history.',
  });
  return (
    <article className="print-area card" aria-label={r.title}>
      <header className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={r.approvalState === 'approved' ? 'green' : r.approvalState === 'rejected' ? 'red' : 'amber'}>
            {r.approvalState === 'approved' ? `Approved by ${r.approvedByName}` : r.approvalState === 'draft' ? 'Draft: not approved' : 'Not approved'}
          </Badge>
          <Badge tone="neutral">{r.audience === 'customer' ? 'Customer audience (redacted)' : 'Internal'}</Badge>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-navy">{r.title}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="inline font-medium">Scope: </dt><dd className="inline">{r.scope}</dd></div>
          <div><dt className="inline font-medium">Period: </dt><dd className="inline">{formatDate(r.period.from)} to {formatDate(r.period.to)}</dd></div>
          <div><dt className="inline font-medium">Generated: </dt><dd className="inline">{formatDateTime(r.generatedAt)} by {r.generatedByName}</dd></div>
          <div><dt className="inline font-medium">Report ID: </dt><dd className="mono inline">{r.id}</dd></div>
        </dl>
        <p className="mt-3 rounded-md border border-[#E8D6A8] bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">{r.sourceWatermark || DEMO_NOTICE}</p>
        <div className="no-print mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" aria-hidden />} onClick={() => window.print()}>Print or save as PDF</Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} loading={csv.isPending} onClick={() => csv.mutate(r.id)}>Export CSV</Button>
          {r.approvalState === 'draft' && session.can('report.approve') && (
            <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(r.id)}>Approve report</Button>
          )}
          {r.approvalState === 'draft' && !session.can('report.approve') && (
            <span className="self-center text-sm text-muted">Needs approval from a battery engineer before it is shared.</span>
          )}
        </div>
      </header>

      <div className="space-y-6 p-5">
        {r.sections.map((s) => (
          <section key={s.heading} aria-labelledby={`sec-${s.heading}`}>
            <h3 id={`sec-${s.heading}`} className="text-base font-semibold text-navy">{s.heading}</h3>
            {s.note && <p className="mt-1 text-sm text-muted">{s.note}</p>}
            {s.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No records in this section.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-md border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-canvas">
                    <tr>{s.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.rows.map((row, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {r.evidenceRefs.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-navy">Evidence references</h3>
            <ul className="mt-1 flex flex-wrap gap-2 text-xs">
              {r.evidenceRefs.map((e) => <li key={e} className="mono rounded-full border border-line px-2 py-0.5">{e}</li>)}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function ReportsInner() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get('report');
  const templates = useSvcQuery(['report-templates'], (s) => s.reports.templates());
  const list = useSvcQuery(['reports'], (s) => s.reports.list());
  const [templateId, setTemplateId] = useState<ReportTemplateId | ''>('');
  const [scopeId, setScopeId] = useState('');
  const [from, setFrom] = useState('2026-07-01');
  const [to, setTo] = useState('2026-10-13');
  const [audience, setAudience] = useState<'internal' | 'customer'>('internal');
  const effectiveTemplate = (templateId || templates.data?.[0]?.id || '') as ReportTemplateId | '';
  const tpl = templates.data?.find((t) => t.id === effectiveTemplate);
  const scopes = useSvcQuery(['report-scopes', effectiveTemplate], (s) => s.reports.scopes(effectiveTemplate as ReportTemplateId), { enabled: !!effectiveTemplate });
  const gen = useAction<void, Report>(
    (s) => s.reports.generate({ templateId: effectiveTemplate as ReportTemplateId, scopeId: scopeId || scopes.data?.[0]?.id || null, from, to, audience: session.can('report.internal') ? audience : 'customer' }),
    { success: 'Report generated as a draft.', toastError: false, onSuccess: (r) => router.replace(`/app/reports?report=${r.id}`, { scroll: false }) },
  );
  const current = list.data?.find((r) => r.id === selected) ?? null;
  const internalAllowed = session.can('report.internal');

  return (
    <>
      <PageHeader title="Reports" description="Evidence-referenced documents generated from the records you can see. Drafts need engineering approval before they are shared." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] print:block">
        <div className="no-print space-y-6">
          <Section title="Generate a report">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                gen.mutate();
              }}
            >
              <Field label="Template" hint={tpl?.description}>
                <Select value={effectiveTemplate} onChange={(e) => { setTemplateId(e.target.value as ReportTemplateId); setScopeId(''); }}>
                  {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Scope">
                <Select value={scopeId || scopes.data?.[0]?.id || ''} onChange={(e) => setScopeId(e.target.value)}>
                  {scopes.data?.map((s) => <option key={s.id ?? 'all'} value={s.id ?? ''}>{s.label}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              </div>
              <Field label="Audience" hint={internalAllowed ? 'Customer audience removes internal costs, process notes and controlled evidence.' : 'Your role generates customer-audience reports.'}>
                <Select value={internalAllowed ? audience : 'customer'} disabled={!internalAllowed} onChange={(e) => setAudience(e.target.value as 'internal' | 'customer')}>
                  <option value="internal">Internal</option>
                  <option value="customer">Customer (redacted)</option>
                </Select>
              </Field>
              {tpl && tpl.internalOnlySections.length > 0 && (
                <p className="text-xs text-muted">Internal-only sections: {tpl.internalOnlySections.join(', ')}.</p>
              )}
              {gen.error && <p role="alert" className="text-sm font-medium text-critical-700">{errorMessage(gen.error)}</p>}
              <Button type="submit" loading={gen.isPending} icon={<FileText className="h-4 w-4" aria-hidden />}>Generate draft</Button>
            </form>
          </Section>

          <Section title="Generated reports" tone="flush">
            <QueryView query={list} skeleton={<div className="p-4"><LoadingBlock rows={2} /></div>} isEmpty={(d) => d.length === 0} empty={<p className="p-5 text-sm text-muted">No reports yet.</p>}>
              {(rows) => (
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/app/reports?report=${r.id}`, { scroll: false })}
                        aria-current={r.id === selected ? 'true' : undefined}
                        className={`block w-full px-4 py-3 text-left hover:bg-canvas md:px-5 ${r.id === selected ? 'bg-teal-50' : ''}`}
                      >
                        <span className="block text-sm font-semibold text-navy">{r.title}</span>
                        <span className="block text-xs text-muted">{formatDateTime(r.generatedAt)} · {r.approvalState === 'approved' ? 'Approved' : 'Draft'} · {r.audience}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </QueryView>
          </Section>
        </div>

        <div>
          {current ? (
            <ReportView r={current} />
          ) : (
            <EmptyState icon={FileText} title="Select or generate a report" description="The report appears here, ready to print or export. Each one carries its scope, period, source watermark and evidence references." />
          )}
        </div>
      </div>
      <Notice tone="synthetic" className="no-print mt-6">Reports contain synthetic data only and are watermarked accordingly.</Notice>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ReportsInner />
    </Suspense>
  );
}

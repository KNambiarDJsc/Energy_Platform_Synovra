'use client';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Badge, TestStatusBadge } from '@/components/ui/Badge';
import { chipClass } from '@/components/ui/buttonClass';
import { Button } from '@/components/ui/Button';
import { DataTable, DateTimeCell, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, Textarea, parseNumberInput } from '@/components/ui/Field';
import { KeyValue, Notice, PageHeader, TableCard } from '@/components/ui/Layout';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { EvidenceDownload, EvidenceFileInput, StorageBadge, fileSizeKb } from '@/components/app/Evidence';
import { DEMO_CRITERION_TEXT } from '@/data/seed';
import { TEST_REVIEW_REASON_LABELS, codeOptions } from '@/domain/outcomes';
import type { TestKind, TestReviewReasonCode, TestStatus } from '@/domain/types';
import { cn, formatDateTime, formatNumber, titleCase } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { TestView } from '@/services/types';

const KIND_LABEL: Record<TestKind, string> = {
  intake_inspection: 'Intake inspection', initial: 'Initial test', final: 'Final test', periodic: 'Periodic test',
};
const STATUS_FILTERS: { value: '' | TestStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'requires_rework', label: 'Rework' },
  { value: 'rejected', label: 'Rejected' },
];

/* ------------------------------ record test ------------------------------ */

function RecordTestModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const batteries = useSvcQuery(['batteries', 'list', 'for-test'], (s) => s.batteries.list({}), { enabled: open });
  const protocols = useSvcQuery(['protocols'], (s) => s.tests.protocols(), { enabled: open });
  const [f, setF] = useState({
    batteryId: '', kind: 'initial' as TestKind, protocolId: '', voltage: '', resistance: '', temp: '', capacity: '',
    ambient: '25', load: '', cutoff: '', duration: '', instrument: '', calibration: '', witness: '', notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  // The test is saved first, then the file is attached to it. If the upload fails, the draft is kept
  // and the person is told to attach the file from the test detail.
  const create = useAction<void, { id: string; uploadError: string | null }>(
    async (s) => {
      const t = await s.tests.create({
        batteryId: f.batteryId,
        kind: f.kind,
        protocolId: f.protocolId || protocols.data?.[0]?.id || '',
        voltageV: parseNumberInput(f.voltage),
        resistanceMOhm: parseNumberInput(f.resistance),
        temperatureC: parseNumberInput(f.temp),
        capacityAh: parseNumberInput(f.capacity),
        ambientTempC: parseNumberInput(f.ambient),
        loadCurrentA: parseNumberInput(f.load),
        cutoffVoltageV: parseNumberInput(f.cutoff),
        durationH: parseNumberInput(f.duration),
        instrument: f.instrument,
        calibrationRef: f.calibration,
        witnessName: f.witness.trim() || null,
        evidenceFileName: null,
        notes: f.notes,
      });
      if (!file) return { id: t.id, uploadError: null };
      try {
        await s.tests.attachEvidence(t.id, file.name, fileSizeKb(file), undefined, file);
        return { id: t.id, uploadError: null };
      } catch (e) {
        return { id: t.id, uploadError: errorMessage(e) };
      }
    },
    {
      toastError: false,
      success: (r) => (r.uploadError
        ? `Test saved as a draft, but the file was not attached: ${r.uploadError} Attach it from the test detail.`
        : 'Test saved as a draft. Submit it when the evidence is complete.'),
      onSuccess: () => { setFile(null); onOpenChange(false); },
    },
  );

  function submit() {
    const e: Record<string, string> = {};
    if (!f.batteryId) e.batteryId = 'Select the battery tested.';
    if (!f.instrument.trim()) e.instrument = 'Record the instrument used.';
    if (!f.calibration.trim()) e.calibration = 'Record the calibration reference.';
    (['voltage', 'resistance', 'temp', 'capacity', 'ambient', 'load', 'cutoff', 'duration'] as const).forEach((k) => {
      const n = parseNumberInput(f[k]);
      if (Number.isNaN(n)) e[k] = 'Enter a number or leave empty.';
    });
    setErrs(e);
    if (Object.keys(e).length) return;
    create.mutate();
  }

  const num = (k: keyof typeof f, label: string, unit: string) => (
    <Field label={`${label} (${unit})`} error={errs[k as string]}>
      <Input inputMode="decimal" value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof f>)} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Record a test"
      description="Saved as a draft. Leave a measurement empty if it was not taken; it is recorded as unknown."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} onClick={submit}>Save draft</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Battery" required error={errs.batteryId} className="sm:col-span-2">
            <Select value={f.batteryId} onChange={(e) => set({ batteryId: e.target.value })}>
              <option value="">Select a battery</option>
              {batteries.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} · {b.model} · {b.manufacturerSerial ?? 'no serial'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Test type" required>
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as TestKind })}>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Protocol revision" required hint="Placeholder protocols are labelled until approved.">
            <Select value={f.protocolId || protocols.data?.[0]?.id || ''} onChange={(e) => set({ protocolId: e.target.value })}>
              {protocols.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.revision}{p.status === 'placeholder' ? ' (placeholder)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Measurements</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {num('voltage', 'Open-circuit voltage', 'V')}
            {num('resistance', 'Internal resistance', 'mΩ')}
            {num('temp', 'Battery temperature', '°C')}
            {num('capacity', 'Discharge capacity', 'Ah')}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Conditions</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {num('ambient', 'Ambient temperature', '°C')}
            {num('load', 'Load current', 'A')}
            {num('cutoff', 'Cut-off voltage', 'V')}
            {num('duration', 'Duration', 'h')}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Evidence</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Instrument" required error={errs.instrument}>
              <Input value={f.instrument} onChange={(e) => set({ instrument: e.target.value })} />
            </Field>
            <Field label="Calibration reference" required error={errs.calibration}>
              <Input value={f.calibration} onChange={(e) => set({ calibration: e.target.value })} />
            </Field>
            <Field label="Witness">
              <Input value={f.witness} onChange={(e) => set({ witness: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <EvidenceFileInput label="Evidence file (test report, curve or photo)" file={file} onChange={setFile} />
            </div>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={500} />
            </Field>
          </div>
        </fieldset>
        {create.error && (
          <p role="alert" className="rounded-lg bg-critical-50 p-3 text-sm text-critical-700">
            {errorMessage(create.error)}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ detail drawer ------------------------------ */

type Decision = 'approve' | 'reject' | 'rework';
const TEST_REVIEW_CODES = codeOptions(TEST_REVIEW_REASON_LABELS);

function TestDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const session = useSession();
  const q = useSvcQuery(['test', id], (s) => s.tests.get(id!), { enabled: !!id });
  const [decision, setDecision] = useState<Decision | null>(null);
  const submit = useAction<string, unknown>((s, tid) => s.tests.submit(tid), { success: 'Test submitted for engineering review.' });
  const [file, setFile] = useState<File | null>(null);
  const attach = useAction<File, unknown>((s, f) => s.tests.attachEvidence(id!, f.name, fileSizeKb(f), undefined, f), {
    success: (_r, f) => `${f.name} attached.`, onSuccess: () => setFile(null),
  });
  const start = useAction<string, unknown>((s, tid) => s.tests.startReview(tid), { success: 'Review started. You are now the reviewer of record.' });
  const decide = useAction<{ reason: string; code: TestReviewReasonCode | null }, unknown>(
    (s, a) => {
      if (decision === 'approve') return s.tests.approve(id!, a.reason);
      if (decision === 'reject') return s.tests.reject(id!, a.reason, a.code!);
      return s.tests.requestRework(id!, a.reason, a.code!);
    },
    {
      toastError: false,
      success: () => (decision === 'approve' ? 'Test approved.' : decision === 'reject' ? 'Test rejected.' : 'Rework requested.'),
      onSuccess: () => setDecision(null),
    },
  );

  const t = q.data;
  return (
    <>
      <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title="Test detail" description={t ? `${KIND_LABEL[t.kind]} · ${t.batteryLabel ?? 'String-level'}` : undefined}>
        {q.isLoading && <LoadingBlock label="Loading test" rows={4} />}
        {q.isError && <p role="alert" className="text-sm text-critical-700">{errorMessage(q.error)}</p>}
        {t && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <TestStatusBadge status={t.status} />
              {t.level === 'string' && <Badge tone="amber">String-level result</Badge>}
            </div>

            <div className="rounded-lg bg-canvas p-4">
              <p className="text-[13px] font-medium text-muted">Measured capacity</p>
              <p className="mt-1 text-3xl font-semibold text-ink">{formatNumber(t.result.capacityAh, 0, 'Ah')}</p>
              {t.level === 'battery' ? (
                <p className="text-sm text-muted">
                  {t.pctOfRated === null ? 'Percent of rated unknown' : `${formatNumber(t.pctOfRated, 0)}% of rated ${t.ratedCapacityAh} Ah`}
                </p>
              ) : (
                <p className="text-sm text-muted">Describes the series string. It is not a per-battery capacity.</p>
              )}
            </div>

            {t.level === 'battery' && (
              <Notice tone="info" title={`Rule result: ${t.rule.label}`}>
                {DEMO_CRITERION_TEXT} A rule result informs the reviewer. It never approves a battery.
              </Notice>
            )}

            <KeyValue
              columns={2}
              items={[
                { label: 'Open-circuit voltage', value: formatNumber(t.result.openCircuitVoltageV, 2, 'V') },
                { label: 'Internal resistance', value: formatNumber(t.result.internalResistanceMOhm, 2, 'mΩ') },
                { label: 'Battery temperature', value: formatNumber(t.result.temperatureC, 1, '°C') },
                { label: 'Ambient', value: formatNumber(t.conditions.ambientTempC, 0, '°C') },
                { label: 'Load / cut-off', value: `${formatNumber(t.conditions.loadCurrentA, 1, 'A')} / ${formatNumber(t.conditions.cutoffVoltageV, 2, 'V')}` },
                { label: 'Duration', value: formatNumber(t.conditions.durationH, 1, 'h') },
                { label: 'Instrument', value: t.instrument },
                { label: 'Calibration ref.', value: t.calibrationRef },
                { label: 'Protocol', value: t.protocolName },
                { label: 'Operator', value: t.operatorName },
                { label: 'Witness', value: t.witnessName ?? 'None recorded' },
                { label: 'Started', value: formatDateTime(t.startedAt) },
              ]}
            />
            {t.result.notes && <p className="text-sm text-ink">Notes: {t.result.notes}</p>}

            {t.evidence.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-muted">Evidence</p>
                <ul className="mt-1 space-y-2 text-sm">
                  {t.evidence.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-muted" aria-hidden /> <span className="break-all">{e.fileName}</span>
                      <StorageBadge e={e} />
                      <EvidenceDownload e={e} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {session.can('test.create') && ['draft', 'requires_rework', 'submitted'].includes(t.status) && (
              <div className="space-y-2 rounded-lg bg-canvas p-3">
                <EvidenceFileInput label="Attach another evidence file" file={file} onChange={setFile} />
                <Button size="sm" variant="secondary" disabled={!file} loading={attach.isPending} onClick={() => file && attach.mutate(file)}>Attach file</Button>
              </div>
            )}

            {t.reviewedAt && (
              <div className="rounded-lg bg-canvas p-3 text-sm">
                <p className="font-semibold text-ink">Review: {titleCase(t.status)}</p>
                <p className="text-muted">
                  {t.reviewerName} · {formatDateTime(t.reviewedAt)}
                </p>
                {t.reviewReasonCode && <p className="mt-1 font-medium text-ink">{TEST_REVIEW_REASON_LABELS[t.reviewReasonCode]}</p>}
                {t.reviewReason && <p className="mt-1 text-ink">{t.reviewReason}</p>}
              </div>
            )}

            {t.batteryId && (
              <Link href={`/app/batteries/${t.batteryId}`} className="inline-block text-sm font-semibold text-copper-700 underline underline-offset-2">
                Open battery passport
              </Link>
            )}

            <div className="flex flex-wrap gap-2 pt-4">
              {(t.status === 'draft' || t.status === 'requires_rework') && session.can('test.create') && (
                <Button loading={submit.isPending} onClick={() => submit.mutate(t.id)}>Submit for review</Button>
              )}
              {t.status === 'submitted' && session.can('test.review') && (
                <Button loading={start.isPending} onClick={() => start.mutate(t.id)}>Start review</Button>
              )}
              {t.status === 'under_review' && session.can('test.review') && (
                <>
                  <Button onClick={() => setDecision('approve')}>Approve</Button>
                  <Button variant="secondary" onClick={() => setDecision('rework')}>Request rework</Button>
                  <Button variant="danger" onClick={() => setDecision('reject')}>Reject</Button>
                </>
              )}
              {t.status === 'submitted' && !session.can('test.review') && (
                <p className="text-sm text-muted">Waiting for a battery engineer. Your role cannot review tests.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
      <ReasonDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={decision === 'approve' ? 'Approve this test' : decision === 'reject' ? 'Reject this test' : 'Request rework'}
        description="This is an engineering decision. It is recorded with your name."
        summary={
          decision === 'approve'
            ? 'Approval accepts the measurement as evidence. You cannot approve a test you recorded or submitted yourself.'
            : undefined
        }
        confirmLabel={decision === 'approve' ? 'Approve' : decision === 'reject' ? 'Reject' : 'Request rework'}
        variant={decision === 'reject' ? 'danger' : 'primary'}
        codes={decision === 'approve' ? undefined : TEST_REVIEW_CODES}
        loading={decide.isPending}
        error={decide.error ? errorMessage(decide.error) : null}
        onConfirm={(reason, code) => decide.mutate({ reason, code: code as TestReviewReasonCode | null })}
      />
    </>
  );
}

/* ------------------------------ list ------------------------------ */

function TestsInner() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'' | TestStatus>((params.get('status') as TestStatus | null) ?? '');
  const [record, setRecord] = useState(false);
  const all = useSvcQuery(['tests', 'all'], (s) => s.tests.list());
  const openId = params.get('test');

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': all.data?.length ?? 0 };
    all.data?.forEach((t) => (c[t.status] = (c[t.status] ?? 0) + 1));
    return c;
  }, [all.data]);
  const rows = (all.data ?? []).filter((t) => !status || t.status === status);

  const cols: Column<TestView>[] = [
    {
      key: 'battery', header: 'Battery', mobile: 'title', sort: (t) => t.batteryLabel ?? 'zzz',
      cell: (t) => <span className="mono">{t.batteryLabel ?? 'String test'}</span>,
    },
    { key: 'kind', header: 'Test', cell: (t) => <span>{KIND_LABEL[t.kind]}{t.level === 'string' && <span className="block text-xs text-amber-700">String-level</span>}</span> },
    { key: 'status', header: 'Status', cell: (t) => <TestStatusBadge status={t.status} /> },
    {
      key: 'cap', header: 'Capacity', align: 'right', sort: (t) => t.result.capacityAh,
      cell: (t) =>
        t.result.capacityAh === null ? (
          <span className="text-muted">Not measured</span>
        ) : (
          <span>
            {formatNumber(t.result.capacityAh, 0, 'Ah')}
            {t.pctOfRated !== null && t.level === 'battery' && <span className="block text-xs text-muted">{formatNumber(t.pctOfRated, 0)}% of rated</span>}
          </span>
        ),
    },
    {
      key: 'rule', header: 'Rule result',
      cell: (t) =>
        t.level === 'string' ? (
          <span className="text-xs text-muted">Not applicable</span>
        ) : (
          <Badge tone={t.rule.state === 'meets' ? 'teal' : t.rule.state === 'below' && t.kind === 'final' ? 'amber' : 'neutral'}>
            {t.rule.state === 'meets' ? 'Meets demo threshold' : t.rule.state === 'below' ? 'Below demo threshold' : 'Unknown'}
          </Badge>
        ),
    },
    { key: 'who', header: 'Operator', cell: (t) => t.operatorName },
    { key: 'when', header: 'Started', sort: (t) => t.startedAt, cell: (t) => <DateTimeCell iso={t.startedAt} /> },
    {
      key: 'open', header: 'Details', mobile: 'show',
      cell: (t) => (
        <Button size="sm" variant="secondary" onClick={() => router.replace(`/app/tests?test=${t.id}`, { scroll: false })}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tests"
        description="Measurements, the evidence behind them, and engineering review. Only a person can approve a test."
        actions={
          session.can('test.create') ? (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setRecord(true)}>
              Record test
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(f.value)}
              className={chipClass(active, 'min-h-[40px]')}
            >
              {f.label} <span className={cn('num', active ? 'text-white/80' : 'text-ink-2')}>{counts[f.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <QueryView
        query={all}
        skeleton={<LoadingBlock label="Loading tests" rows={6} />}
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            title={status ? `No ${STATUS_FILTERS.find((f) => f.value === status)?.label.toLowerCase()} tests` : 'No tests recorded'}
            description="Tests appear here once a lab operator records them."
          />
        }
      >
        {() => (
          <TableCard>
            <DataTable caption="Test sessions" columns={cols} rows={rows} rowKey={(t) => t.id} initialSort={{ key: 'when', dir: 'desc' }} pageSize={12} />
          </TableCard>
        )}
      </QueryView>

      <RecordTestModal open={record} onOpenChange={setRecord} />
      <TestDrawer id={openId} onClose={() => router.replace('/app/tests', { scroll: false })} />
    </>
  );
}

export default function TestsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <TestsInner />
    </Suspense>
  );
}

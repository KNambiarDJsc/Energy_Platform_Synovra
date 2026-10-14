'use client';
import { Calculator, FilePlus2, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, parseNumberInput } from '@/components/ui/Field';
import { KeyValue, Notice, PageHeader, Section } from '@/components/ui/Layout';
import { EvidenceFileInput, fileSizeKb } from '@/components/app/Evidence';
import { Modal } from '@/components/ui/Overlay';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import { cn, formatAed, formatDate, formatNumber, titleCase } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { AttemptView, BatchResults, EconomicsResult } from '@/services/types';

const ATTEMPT_TONE = { in_restoration: 'teal', awaiting_review: 'amber', approved: 'green', rejected: 'red', rework: 'amber' } as const;

/* ------------------------------ batch results ------------------------------ */

function Economics({ batchId, results }: { batchId: string; results: BatchResults }) {
  const [sales, setSales] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = useAction<{ s: number; r: number }, EconomicsResult>(
    (svc, a) => svc.restoration.economics(batchId, { salesPerQualifiedAed: a.s, recoveryPerRejectAed: a.r }),
    { toastError: false },
  );
  const c = results.costs;
  if (!c) return null;
  const r = run.data;

  return (
    <Section
      title="Batch economics"
      description="Listed costs come from cost entries. Sales and recovery values below are assumptions you enter, not recorded results."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <KeyValue
            columns={2}
            items={[
              { label: 'Known costs listed', value: formatAed(c.knownTotalAed) },
              { label: 'Unknown cost entries', value: c.unknownEntries === 0 ? 'None' : `${c.unknownEntries} (total is a minimum)` },
              { label: 'Actual / allocated / estimated', value: `${formatAed(c.actualAed)} / ${formatAed(c.allocatedAed)} / ${formatAed(c.estimatedAed)}` },
              { label: 'Warranty provision (listed)', value: formatAed(c.warrantyProvisionAed) },
              {
                label: 'Gross listed cost per qualified battery',
                value: c.perQualifiedGrossAed === null ? 'Not available (no qualified batteries)' : formatAed(c.perQualifiedGrossAed),
                hint: 'Known costs divided by qualified batteries. Excludes unknown entries.',
              },
            ]}
          />
        </div>
        <form
          className="rounded-md border border-line bg-canvas p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const s = parseNumberInput(sales);
            const rc = parseNumberInput(recovery);
            if (s === null || rc === null || Number.isNaN(s) || Number.isNaN(rc) || s < 0 || rc < 0) {
              setError('Enter both values as positive numbers. They are your assumptions.');
              return;
            }
            setError(null);
            run.mutate({ s, r: rc });
          }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Calculator className="h-4 w-4" aria-hidden /> Scenario (your assumptions)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Value per qualified battery (AED)" error={error && sales === '' ? error : null}>
              <Input inputMode="decimal" value={sales} onChange={(e) => setSales(e.target.value)} />
            </Field>
            <Field label="Recovery per rejected battery (AED)" error={error && recovery === '' ? error : null}>
              <Input inputMode="decimal" value={recovery} onChange={(e) => setRecovery(e.target.value)} />
            </Field>
          </div>
          {error && sales !== '' && recovery !== '' && <p role="alert" className="mt-2 text-xs font-medium text-critical-700">{error}</p>}
          <Button type="submit" className="mt-3" loading={run.isPending} variant="secondary">
            Calculate
          </Button>
          {r && (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm" aria-live="polite">
              <div><dt className="text-xs text-muted">Incoming / qualified / rejected</dt><dd className="font-semibold text-navy">{r.incoming} / {r.qualified} / {r.rejects}</dd></div>
              <div><dt className="text-xs text-muted">Yield</dt><dd className="font-semibold text-navy">{r.yieldPct === null ? 'Unknown' : `${formatNumber(r.yieldPct, 0)}%`}</dd></div>
              <div><dt className="text-xs text-muted">Assumed value + recovery</dt><dd className="font-semibold text-navy">{formatAed(r.sales + r.recovery)}</dd></div>
              <div><dt className="text-xs text-muted">Listed costs</dt><dd className="font-semibold text-navy">{formatAed(r.listedCosts)}</dd></div>
              <div><dt className="text-xs text-muted">Contribution (scenario)</dt><dd className="font-semibold text-navy">{formatAed(r.contribution)}</dd></div>
              <div><dt className="text-xs text-muted">Net cost per qualified</dt><dd className="font-semibold text-navy">{r.netCostPerQualified === null ? 'Unknown' : formatAed(r.netCostPerQualified)}</dd></div>
              {r.unknownCostEntries > 0 && (
                <p className="col-span-2 text-xs text-amber-700">{r.unknownCostEntries} cost entr{r.unknownCostEntries > 1 ? 'ies are' : 'y is'} unknown and excluded, so these figures flatter the result.</p>
              )}
            </dl>
          )}
        </form>
      </div>
    </Section>
  );
}

function BatchPanel({ batchId }: { batchId: string }) {
  const q = useSvcQuery(['restoration', 'batch', batchId], (s) => s.restoration.batchResults(batchId));
  return (
    <QueryView query={q} skeleton={<LoadingBlock rows={3} />}>
      {(r) => (
        <div className="space-y-6">
          <Section
            title={`${r.batch.name} · ${r.familyModel}`}
            description={`Opened ${formatDate(r.batch.openedOn)} · ${r.batch.status === 'open' ? 'Open' : 'Closed'} · planned ${r.batch.plannedCount} units`}
          >
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Intake', r.counts.intake],
                ['Attempted', r.counts.attempted],
                ['In progress', r.counts.inProgress],
                ['Qualified', r.counts.qualified],
                ['Rework', r.counts.rework],
                ['Rejected', r.counts.rejected],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-md border border-line p-3">
                  <dd className="text-2xl font-semibold text-navy">{v as number}</dd>
                  <dt className="text-xs text-muted">{k as string}</dt>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-ink">
                <span className="font-semibold">Qualified of intake:</span>{' '}
                {r.yield.qualifiedOverIntake === null ? 'Unknown' : `${formatNumber(r.yield.qualifiedOverIntake, 0)}%`}
                <span className="block text-xs text-muted">Counts batteries still in progress as not yet qualified.</span>
              </p>
              <p className="text-sm text-ink">
                <span className="font-semibold">Qualified of decided ({r.yield.decided}):</span>{' '}
                {r.yield.qualifiedOverDecided === null ? 'No decisions yet' : `${formatNumber(r.yield.qualifiedOverDecided, 0)}%`}
                <span className="block text-xs text-muted">Only batteries with a final decision.</span>
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">Synthetic batches. These percentages describe invented demonstration data, not expected performance.</p>
          </Section>
          <Economics batchId={batchId} results={r} />
        </div>
      )}
    </QueryView>
  );
}

/* ------------------------------ attempts ------------------------------ */

type Dialog =
  | { kind: 'note'; a: AttemptView }
  | { kind: 'evidence'; a: AttemptView }
  | { kind: 'submit'; a: AttemptView }
  | { kind: 'decide'; a: AttemptView; decision: 'approve' | 'reject' | 'rework' };

function AttemptCard({ a, onDialog }: { a: AttemptView; onDialog: (d: Dialog) => void }) {
  const session = useSession();
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/app/batteries/${a.batteryId}`} className="mono text-base font-semibold text-teal-800 underline underline-offset-2">
          {a.batteryLabel}
        </Link>
        <span className="text-sm text-muted">{a.familyModel} · attempt {a.attemptNo}</span>
        <Badge tone={ATTEMPT_TONE[a.status]}>{titleCase(a.status)}</Badge>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[13px] font-medium text-muted">Before</dt>
          <dd>{a.before ? `${formatNumber(a.before.result.capacityAh, 0, 'Ah')} (${a.before.pctOfRated === null ? 'unknown' : `${formatNumber(a.before.pctOfRated, 0)}%`})` : 'No test linked'}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-medium text-muted">After</dt>
          <dd>{a.after ? `${formatNumber(a.after.result.capacityAh, 0, 'Ah')} (${a.after.pctOfRated === null ? 'unknown' : `${formatNumber(a.after.pctOfRated, 0)}%`})` : 'No test linked yet'}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-medium text-muted">Started</dt>
          <dd>{formatDate(a.startedAt)}</dd>
        </div>
      </dl>
      {a.confidentialHidden ? (
        <p className="mt-3 text-xs text-muted">Process notes and lot references are controlled and not shown to your role.</p>
      ) : (
        <>
          {a.lotRefs.length > 0 && (
            <p className="mt-3 text-sm text-muted">Lot references: {a.lotRefs.map((l) => `${titleCase(l.kind)} ${l.ref}`).join(', ')}</p>
          )}
          {a.notes.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {a.notes.map((n) => (
                <li key={n.id}><span className="text-muted">{formatDate(n.at)} · {n.actorName}:</span> {n.text}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {a.decisionReason && (
        <p className="mt-3 rounded-md bg-canvas p-2.5 text-sm">
          <span className="font-medium">Decision{a.deciderName ? ` by ${a.deciderName}` : ''}:</span> {a.decisionReason}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {a.status === 'in_restoration' && session.can('restoration.write') && (
          <>
            <Button size="sm" variant="secondary" icon={<MessageSquarePlus className="h-4 w-4" aria-hidden />} onClick={() => onDialog({ kind: 'note', a })}>
              Add note
            </Button>
            <Button size="sm" variant="secondary" icon={<FilePlus2 className="h-4 w-4" aria-hidden />} onClick={() => onDialog({ kind: 'evidence', a })}>
              Attach evidence
            </Button>
            <Button size="sm" onClick={() => onDialog({ kind: 'submit', a })}>Submit for review</Button>
          </>
        )}
        {a.status === 'awaiting_review' &&
          (session.can('restoration.review') ? (
            <>
              <Button size="sm" onClick={() => onDialog({ kind: 'decide', a, decision: 'approve' })}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => onDialog({ kind: 'decide', a, decision: 'rework' })}>Request rework</Button>
              <Button size="sm" variant="danger" onClick={() => onDialog({ kind: 'decide', a, decision: 'reject' })}>Reject</Button>
            </>
          ) : (
            <p className="text-sm text-muted">Waiting for engineering review.</p>
          ))}
      </div>
    </li>
  );
}

function AttemptDialogs({ dialog, onClose }: { dialog: Dialog | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [afterTest, setAfterTest] = useState('');
  const tests = useSvcQuery(['tests', 'for', dialog?.a.batteryId], (s) => s.tests.list({ batteryId: dialog!.a.batteryId }), {
    enabled: dialog?.kind === 'submit',
  });
  const reset = () => { setText(''); setFile(null); setAfterTest(''); onClose(); };

  const note = useAction<void, unknown>((s) => s.restoration.addNote(dialog!.a.id, text), { success: 'Note added.', onSuccess: reset, toastError: false });
  const evidence = useAction<void, unknown>((s) => s.restoration.addEvidence(dialog!.a.id, file!.name, fileSizeKb(file!), undefined, file!), { success: 'Evidence attached.', onSuccess: reset, toastError: false });
  const submit = useAction<void, unknown>((s) => s.restoration.submitForReview(dialog!.a.id, afterTest), { success: 'Submitted for engineering review.', onSuccess: reset, toastError: false });
  const decide = useAction<string, unknown>(
    (s, reason) => s.restoration.decide(dialog!.a.id, (dialog as Extract<Dialog, { kind: 'decide' }>).decision, reason),
    { success: 'Decision recorded.', onSuccess: reset, toastError: false },
  );

  if (!dialog) return null;
  if (dialog.kind === 'decide') {
    const d = dialog.decision;
    return (
      <ReasonDialog
        open
        onOpenChange={(o) => !o && reset()}
        title={d === 'approve' ? 'Approve restoration' : d === 'reject' ? 'Reject restoration' : 'Request rework'}
        description={`${dialog.a.batteryLabel}, attempt ${dialog.a.attemptNo}. This is an engineering decision recorded with your name.`}
        confirmLabel={d === 'approve' ? 'Approve' : d === 'reject' ? 'Reject' : 'Request rework'}
        variant={d === 'reject' ? 'danger' : 'primary'}
        loading={decide.isPending}
        error={decide.error ? errorMessage(decide.error) : null}
        onConfirm={(reason) => decide.mutate(reason)}
      />
    );
  }
  const cfg = {
    note: { title: 'Add a process note', label: 'Note', mutation: note, cta: 'Add note' },
    evidence: { title: 'Attach evidence', label: 'File name', mutation: evidence, cta: 'Attach' },
    submit: { title: 'Submit for review', label: '', mutation: submit, cta: 'Submit' },
  }[dialog.kind];
  return (
    <Modal
      open
      onOpenChange={(o) => !o && reset()}
      title={cfg.title}
      description={`${dialog.a.batteryLabel}, attempt ${dialog.a.attemptNo}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={reset}>Cancel</Button>
          <Button loading={cfg.mutation.isPending} disabled={dialog.kind === 'submit' ? !afterTest : dialog.kind === 'evidence' ? !file : text.trim().length < 2} onClick={() => cfg.mutation.mutate(undefined as never)}>
            {cfg.cta}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {dialog.kind === 'note' && (
          <>
            <Notice tone="info">Record what was done and observed. Do not paste controlled recipes or procedures into notes; reference lot numbers instead.</Notice>
            <Field label="Note" required><Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} /></Field>
          </>
        )}
        {dialog.kind === 'evidence' && (
          <EvidenceFileInput label="Evidence file" required file={file} onChange={setFile} />
        )}
        {dialog.kind === 'submit' && (
          <>
            <Field label="After-restoration test" required hint="Choose the test that measures the result of this attempt.">
              <Select value={afterTest} onChange={(e) => setAfterTest(e.target.value)}>
                <option value="">Select a test</option>
                {tests.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {titleCase(t.kind)} · {formatNumber(t.result.capacityAh, 0, 'Ah')} · {titleCase(t.status)} · {formatDate(t.startedAt)}
                  </option>
                ))}
              </Select>
            </Field>
            {tests.data?.length === 0 && <p className="text-sm text-amber-700">No tests exist for this battery. Record a final test first.</p>}
          </>
        )}
        {cfg.mutation.error && <p role="alert" className="text-sm font-medium text-critical-700">{errorMessage(cfg.mutation.error)}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------ candidates ------------------------------ */

function Candidates({ batchId }: { batchId: string }) {
  const session = useSession();
  const candidates = useSvcQuery(['restoration', 'candidates'], (s) => s.batteries.list({ state: 'restoration_candidate' }));
  const testing = useSvcQuery(['restoration', 'testing'], (s) => s.batteries.list({ state: 'testing' }));
  const [mark, setMark] = useState<{ id: string; label: string } | null>(null);
  const start = useAction<string, unknown>((s, batteryId) => s.restoration.createAttempt({ batteryId, batchId }), { success: 'Restoration attempt started in this batch.' });
  const markAct = useAction<string, unknown>((s, reason) => s.restoration.markCandidate(mark!.id, reason), {
    success: 'Marked as a restoration candidate.', onSuccess: () => setMark(null), toastError: false,
  });
  if (!session.can('restoration.write')) return null;
  const list = candidates.data ?? [];
  const eligible = (testing.data ?? []).filter((b) => b.lastApprovedTest);

  return (
    <Section title="Candidates" description="Batteries that can enter this batch. Restoration keeps each battery’s identity.">
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-navy">Ready to start ({list.length})</h3>
          {list.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No battery is marked as a candidate.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {list.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span><span className="mono font-semibold">{b.label}</span> <span className="text-muted">{b.model}</span></span>
                  <Button size="sm" loading={start.isPending && start.variables === b.id} onClick={() => start.mutate(b.id)}>Start attempt</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-navy">In testing with an approved test ({eligible.length})</h3>
          {eligible.length === 0 ? (
            <p className="mt-1 text-sm text-muted">None. A battery needs an approved test before it can be marked as a candidate.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {eligible.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span>
                    <span className="mono font-semibold">{b.label}</span>{' '}
                    <span className="text-muted">{b.model} · {formatNumber(b.lastApprovedTest?.pctOfRated ?? null, 0)}% of rated</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setMark({ id: b.id, label: b.label })}>Mark as candidate</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ReasonDialog
        open={!!mark}
        onOpenChange={(o) => !o && setMark(null)}
        title={`Mark ${mark?.label ?? ''} as restoration candidate`}
        confirmLabel="Mark as candidate"
        loading={markAct.isPending}
        error={markAct.error ? errorMessage(markAct.error) : null}
        onConfirm={(r) => markAct.mutate(r)}
      />
    </Section>
  );
}

/* ------------------------------ page ------------------------------ */

export default function RestorationPage() {
  const batches = useSvcQuery(['restoration', 'batches'], (s) => s.restoration.batches());
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const batchId = selected ?? batches.data?.[batches.data.length - 1]?.id ?? null;
  const attempts = useSvcQuery(['restoration', 'attempts', batchId], (s) => s.restoration.attempts({ batchId: batchId! }), { enabled: !!batchId });

  return (
    <>
      <PageHeader
        title="Restoration"
        description="Batches and attempts. Process notes record what happened; they are not a procedure and never replace the controlled lab method."
      />
      <QueryView query={batches} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No restoration batches" />} skeleton={<LoadingBlock rows={3} />}>
        {(list) => (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Restoration batch">
              {list.map((b) => {
                const active = b.id === batchId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(b.id)}
                    className={cn('min-h-[44px] whitespace-nowrap rounded-md border px-4 text-sm font-medium', active ? 'border-navy bg-navy text-white' : 'border-[#9FB2BD] bg-white hover:bg-canvas')}
                  >
                    {b.name}
                    <span className={cn('ml-2 text-xs', active ? 'text-white/80' : 'text-muted')}>{b.status === 'open' ? 'open' : 'closed'}</span>
                  </button>
                );
              })}
            </div>

            {batchId && <BatchPanel batchId={batchId} />}

            <Section title="Attempts in this batch" tone="flush">
              <div className="p-4 md:p-5">
                <QueryView
                  query={attempts}
                  isEmpty={(d) => d.length === 0}
                  empty={<p className="text-sm text-muted">No attempts have been recorded in this batch.</p>}
                  skeleton={<LoadingBlock rows={2} />}
                >
                  {(rows) => (
                    <ul className="space-y-4">
                      {rows.map((a) => (
                        <AttemptCard key={a.id} a={a} onDialog={setDialog} />
                      ))}
                    </ul>
                  )}
                </QueryView>
              </div>
            </Section>

            {batchId && <Candidates batchId={batchId} />}
          </div>
        )}
      </QueryView>
      <AttemptDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

'use client';
import { CheckCircle2, FileUp, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field } from '@/components/ui/Field';
import { Notice, Section } from '@/components/ui/Layout';
import { LoadingBlock } from '@/components/ui/States';
import { downloadText, formatDateTime, formatNumber } from '@/lib/format';
import { errorMessage, useAction } from '@/lib/hooks';
import { getServices } from '@/services';
import type { BenchCommitResult, BenchPreview, BenchRow } from '@/services/types';

const OUTCOME: Record<BenchRow['outcome'], [string, 'green' | 'neutral' | 'red']> = {
  create: ['Will submit', 'green'], skip: ['Skipped', 'neutral'], quarantine: ['Quarantined', 'red'],
};

/** Bench results by CSV. Rows become tests submitted for review; nothing is approved, converted or guessed. */
export function BenchImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [source, setSource] = useState<{ fileName: string; text: string; profileId: string } | null>(null);
  const profiles = getServices().bench.profiles();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? 'synovra');
  const [view, setView] = useState<BenchPreview | null>(null);
  const [done, setDone] = useState<BenchCommitResult | null>(null);

  const preview = useAction<{ fileName: string; text: string; profileId: string }, BenchPreview>((s, a) => s.bench.preview(a), {
    toastError: false, onSuccess: (p, a) => { setView(p); setSource(a); setDone(null); },
  });
  const commit = useAction<void, BenchCommitResult>((s) => s.bench.commit(source!), {
    toastError: false, onSuccess: (r) => setDone(r),
    success: (r) => `${r.created} test(s) submitted for engineering review.`,
  });

  async function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setFileError('Only .csv files are accepted. Export the bench results as CSV first.'); return; }
    if (file.size > 1024 * 1024) { setFileError('The file is larger than 1 MB.'); return; }
    preview.mutate({ fileName: file.name, text: await file.text(), profileId });
  }

  const cols: Column<BenchRow>[] = [
    { key: 'row', header: 'Row', mobile: 'title', sort: (r) => r.rowNumber, cell: (r) => `Row ${r.rowNumber}` },
    { key: 'battery', header: 'Battery', cell: (r) => (r.batteryId ? <Link href={`/app/batteries/${r.batteryId}`} className="mono text-copper-700 underline underline-offset-2">{r.batteryLabel}</Link> : <span className="mono">{r.batteryLabel}</span>) },
    { key: 'kind', header: 'Test', cell: (r) => <span>{r.fields.test_kind || '—'}<span className="block text-xs text-muted">{r.date}</span></span> },
    { key: 'cap', header: 'Capacity', align: 'right', cell: (r) => (r.fields.capacity_ah ? `${r.fields.capacity_ah} Ah` : <span className="text-muted">Not given</span>) },
    { key: 'outcome', header: 'Outcome', cell: (r) => <Badge tone={OUTCOME[r.outcome][1]}>{OUTCOME[r.outcome][0]}</Badge> },
    {
      key: 'issues', header: 'What needs attention',
      cell: (r) => (
        <ul className="space-y-0.5 text-sm">
          {r.issues.map((i) => <li key={i} className="text-critical-700">{i}</li>)}
          <li className="text-muted">{r.note}</li>
        </ul>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Section
        title="1. Choose a bench results file"
        description="One row per test, exported from the tester or the lab's sheet. Rows become tests submitted for an engineer's review. Nothing changes until you commit."
        actions={
          <Button variant="secondary" size="sm" onClick={() => downloadText('synovra-bench-results-template.csv', `${getServices().bench.columns().join(',')}\n`)}>
            Download empty template
          </Button>
        }
      >
        {profiles.length > 1 && (
          <Field label="Export layout" hint={profiles.find((p) => p.id === profileId)?.description}>
            <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="CSV file" error={fileError} hint={`Columns: ${getServices().bench.columns().join(', ')}.`}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="input file:mr-3 file:rounded file:border-0 file:bg-copper-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-copper-700"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </Field>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            icon={<FileUp className="h-4 w-4" aria-hidden />}
            loading={preview.isPending}
            onClick={() => {
              if (fileRef.current) fileRef.current.value = '';
              setFileError(null);
              setProfileId(profiles[0]?.id ?? 'synovra');
              preview.mutate({ fileName: 'sample-bench-results.csv', text: getServices().bench.sample(), profileId: profiles[0]?.id ?? 'synovra' });
            }}
          >
            Use the sample bench file
          </Button>
          <span className="text-sm text-muted">7 invented rows, including a capacity exported in mAh, a missing calibration reference, an unknown battery and a duplicate.</span>
        </div>
        {preview.error && <p role="alert" className="mt-4 rounded-lg bg-critical-50 p-3 text-sm text-critical-700">{errorMessage(preview.error)}</p>}
      </Section>

      {preview.isPending && <LoadingBlock label="Checking rows" rows={3} />}

      {view && (
        <Section title={`2. Review: ${view.fileName}`} description={`File hash ${view.fileHash.slice(0, 10)}…`}>
          {view.conversions.length > 0 && (
            <Notice tone="info" className="mb-4" title={`Read with the layout “${view.profile.name}”`}>
              <ul className="list-disc pl-5">{view.conversions.map((c) => <li key={c}>{c}</li>)}</ul>
            </Notice>
          )}
          {view.priorCommitAt && (
            <Notice tone="warn" className="mb-4" title="This exact file was committed before">
              Committed {formatDateTime(view.priorCommitAt)}. Importing it again creates nothing.
            </Notice>
          )}
          <div className="mb-4 grid grid-cols-3 gap-3">
            {([['Will submit', view.counts.create, 'green'], ['Skipped', view.counts.skipped, 'neutral'], ['Quarantined', view.counts.quarantined, 'red']] as const).map(([label, n, tone]) => (
              <div key={label} className="rounded-lg bg-canvas p-3">
                <p className="text-2xl font-semibold text-ink">{formatNumber(n)}</p>
                <Badge tone={tone}>{label}</Badge>
              </div>
            ))}
          </div>
          <DataTable caption="Bench import preview" columns={cols} rows={view.rows} rowKey={(r) => String(r.rowNumber)} pageSize={10} />
          <div className="mt-5 flex flex-wrap items-center gap-3 pt-4">
            {!done ? (
              <>
                <Button icon={<Upload className="h-4 w-4" aria-hidden />} loading={commit.isPending} disabled={view.counts.create === 0} onClick={() => commit.mutate()}>
                  Submit {view.counts.create} test(s) for review
                </Button>
                <p className="text-sm text-muted">Quarantined rows are not imported. Fix them at the source and import again.</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm font-medium text-approved-700" role="status">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {done.created} test(s) submitted. An engineer reviews them on the <Link href="/app/tests?status=submitted" className="underline underline-offset-2">Tests</Link> page.
              </p>
            )}
          </div>
          {commit.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(commit.error)}</p>}
        </Section>
      )}
    </div>
  );
}

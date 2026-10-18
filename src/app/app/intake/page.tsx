'use client';
import { CheckCircle2, FileUp, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { BenchImport } from '@/components/app/BenchImport';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select, parseNumberInput } from '@/components/ui/Field';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { SAMPLE_CSV } from '@/domain/csv';
import type { ImportJob, ImportRow } from '@/domain/types';
import { downloadText, formatDateTime, formatNumber } from '@/lib/format';
import { errorMessage, useAction, useSvcQuery } from '@/lib/hooks';

/* ------------------------------ single registration ------------------------------ */

function RegisterForm() {
  const families = useSvcQuery(['families'], (s) => s.batteries.families());
  const [familyId, setFamilyId] = useState('');
  const [serial, setSerial] = useState('');
  const [made, setMade] = useState('');
  const [location, setLocation] = useState('Lab bay 1');
  const [legacy, setLegacy] = useState('');
  const [cost, setCost] = useState('');
  const [ack, setAck] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ id: string; label: string; warnings: string[] } | null>(null);

  const create = useAction<void, { battery: { id: string; label: string }; warnings: string[] }>(
    (s) =>
      s.batteries.create({
        familyId,
        manufacturerSerial: serial.trim() || null,
        manufacturedOn: made || null,
        physicalLocation: location,
        legacyId: legacy.trim() || null,
        acquisitionCostAed: parseNumberInput(cost),
        acknowledgeDuplicate: ack,
      }),
    {
      toastError: false,
      success: (r) => `${r.battery.label} registered. Permanent ID and QR reference issued.`,
      onSuccess: (r) => {
        setResult({ id: r.battery.id, label: r.battery.label, warnings: r.warnings });
        setSerial(''); setMade(''); setLegacy(''); setCost(''); setAck(false);
      },
    },
  );

  const duplicate = create.error?.name === 'ConflictError';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!familyId) errs.family = 'Select a battery family.';
    if (!location.trim()) errs.location = 'Where is the battery now?';
    if (made && !/^\d{4}-\d{2}-\d{2}$/.test(made)) errs.made = 'Use the date picker or YYYY-MM-DD.';
    const c = parseNumberInput(cost);
    if (c !== null && (Number.isNaN(c) || c < 0)) errs.cost = 'Enter a positive number, or leave empty if unknown.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setResult(null);
    create.mutate();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={submit} noValidate className="card space-y-5 p-5" aria-label="Register a battery">
        <p className="text-sm text-muted">Fields marked * are required. Leave unknown values empty: they are recorded as unknown, never as zero.</p>
        <Field label="Battery family" required error={fieldErrors.family} hint="The rated voltage and capacity come from the family.">
          <Select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            <option value="">Select a family</option>
            {families.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.manufacturer} {f.model} · {f.chemistry} · {f.ratedVoltageV} V / {f.ratedCapacityAh} Ah
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Manufacturer serial" hint="Exactly as stamped. Leave empty if not legible.">
            <Input value={serial} onChange={(e) => { setSerial(e.target.value); setAck(false); create.reset(); }} autoComplete="off" />
          </Field>
          <Field label="Manufacture date" error={fieldErrors.made}>
            <Input type="date" value={made} onChange={(e) => setMade(e.target.value)} />
          </Field>
          <Field label="Current physical location" required error={fieldErrors.location}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Legacy ID" hint="Lab or spreadsheet identifier, kept as an alias.">
            <Input value={legacy} onChange={(e) => setLegacy(e.target.value)} />
          </Field>
          <Field label="Acquisition cost (AED)" error={fieldErrors.cost} hint="Leave empty if not known.">
            <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
        </div>

        {create.error && !duplicate && (
          <p role="alert" className="rounded-lg bg-critical-50 p-3 text-sm text-critical-700">
            {errorMessage(create.error)}
          </p>
        )}
        {duplicate && (
          <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-700">Possible duplicate</p>
            <p className="mt-1 text-ink">{errorMessage(create.error)}</p>
            <label className="mt-3 flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>Create a separate record anyway. Both records will be flagged for identity review and will not be merged.</span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={create.isPending} disabled={duplicate && !ack}>
            Register battery
          </Button>
        </div>
      </form>

      <aside className="space-y-4">
        {result ? (
          <div className="card border-approved p-4" role="status">
            <p className="flex items-center gap-2 font-semibold text-approved-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden /> {result.label} registered
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <Link href={`/app/batteries/${result.id}`} className="mt-3 inline-block text-sm font-semibold text-copper-700 underline underline-offset-2">
              Open the passport
            </Link>
          </div>
        ) : (
          <Notice tone="info" title="What happens on registration">
            A permanent internal ID and a QR lookup reference are issued, the state is set to Received, and an intake event is added to the timeline.
          </Notice>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------ CSV import ------------------------------ */

const OUTCOME_TONE = { create: 'green', update: 'teal', skip: 'neutral', quarantine: 'red' } as const;
const OUTCOME_LABEL = { create: 'Will create', update: 'Will update', skip: 'Skipped (already imported)', quarantine: 'Quarantined' } as const;

function ImportFlow() {
  const templates = useSvcQuery(['import', 'templates'], (s) => s.imports.templates());
  const history = useSvcQuery(['import', 'list'], (s) => s.imports.list());
  const [templateId, setTemplateId] = useState('');
  const [job, setJob] = useState<ImportJob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const preview = useAction<{ fileName: string; text: string }, ImportJob>(
    (s, a) => s.imports.preview({ ...a, templateId: templateId || templates.data?.[0]?.id || '' }),
    { toastError: false, onSuccess: (j) => setJob(j) },
  );
  const commit = useAction<string, ImportJob>((s, id) => s.imports.commit(id), {
    toastError: false,
    onSuccess: (j) => setJob(j),
    success: (j) => `Import committed: ${j.counts.created} created, ${j.counts.updated} updated, ${j.counts.skipped} skipped, ${j.counts.quarantined} quarantined.`,
  });

  async function onFile(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setFileError('Only .csv files are accepted. Export the spreadsheet as CSV first.');
      return;
    }
    const text = await file.text();
    preview.mutate({ fileName: file.name, text });
  }

  const cols: Column<ImportRow>[] = [
    { key: 'row', header: 'Row', mobile: 'title', sort: (r) => r.rowNumber, cell: (r) => `Row ${r.rowNumber}` },
    { key: 'serial', header: 'Serial', cell: (r) => <span className="mono">{r.fields.serial?.original || 'Not given'}</span> },
    { key: 'model', header: 'Model', cell: (r) => r.fields.model?.original || <span className="text-muted">Not given</span> },
    { key: 'outcome', header: 'Outcome', cell: (r) => <Badge tone={OUTCOME_TONE[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</Badge> },
    {
      key: 'issues', header: 'What needs attention',
      cell: (r) =>
        r.issues.length === 0 && !r.note ? (
          <span className="text-muted">Nothing</span>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {r.issues.map((i) => (
              <li key={`${i.field}-${i.message}`} className={i.severity === 'error' ? 'text-critical-700' : 'text-amber-700'}>
                <strong>{i.field}:</strong> {i.message}
              </li>
            ))}
            {r.note && <li className="text-muted">{r.note}</li>}
          </ul>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <Section
        title="1. Choose a file"
        description="CSV only, up to 1 MB. Nothing is changed until you review and commit."
        actions={
          <Button variant="secondary" size="sm" onClick={() => downloadText('synovra-import-sample.csv', 'serial,manufacturer,model,voltage,capacity,manufactured,location,acquisition_cost,legacy_id\n')}>
            Download empty template
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mapping template" hint={templates.data?.find((t) => t.id === (templateId || templates.data?.[0]?.id))?.description}>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CSV file" error={fileError}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="input file:mr-3 file:rounded file:border-0 file:bg-copper-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-copper-700"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            icon={<FileUp className="h-4 w-4" aria-hidden />}
            loading={preview.isPending}
            onClick={() => {
              if (fileRef.current) fileRef.current.value = '';
              setFileError(null);
              preview.mutate({ fileName: 'sample-lab-spreadsheet.csv', text: SAMPLE_CSV });
            }}
          >
            Use the sample spreadsheet
          </Button>
          <span className="text-sm text-muted">8 invented rows including a duplicate, a missing serial and a bad date.</span>
        </div>
        {preview.error && (
          <p role="alert" className="mt-4 rounded-lg bg-critical-50 p-3 text-sm text-critical-700">
            {errorMessage(preview.error)}
          </p>
        )}
      </Section>

      {preview.isPending && <LoadingBlock label="Checking rows" rows={3} />}

      {job && (
        <Section
          title={`2. Review: ${job.fileName}`}
          description={`Mapping ${job.mappingVersion} · file hash ${job.fileHash.slice(0, 10)}… · previewed ${formatDateTime(job.createdAt)}`}
        >
          {job.priorCommitAt && (
            <Notice tone="warn" className="mb-4" title="This exact file was committed before">
              Committed on {formatDateTime(job.priorCommitAt)}. Re-importing it creates nothing new; rows already imported are skipped.
            </Notice>
          )}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Will create', job.counts.created, 'green'],
              ['Will update', job.counts.updated, 'teal'],
              ['Skipped', job.counts.skipped, 'neutral'],
              ['Quarantined', job.counts.quarantined, 'red'],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="rounded-lg bg-canvas p-3">
                <p className="text-2xl font-semibold text-ink">{n as number}</p>
                <Badge tone={tone as 'green'}>{label as string}</Badge>
              </div>
            ))}
          </div>
          <DataTable caption="Import preview" columns={cols} rows={job.rows} rowKey={(r) => String(r.rowNumber)} pageSize={10} />
          <div className="mt-5 flex flex-wrap items-center gap-3 pt-4">
            {job.status === 'previewed' ? (
              <>
                <Button
                  icon={<Upload className="h-4 w-4" aria-hidden />}
                  loading={commit.isPending}
                  disabled={job.counts.created + job.counts.updated === 0}
                  onClick={() => commit.mutate(job.id)}
                >
                  Commit {job.counts.created + job.counts.updated} row(s)
                </Button>
                <p className="text-sm text-muted">Quarantined rows are not imported. Fix them in the source and import again.</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm font-medium text-approved-700" role="status">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Committed {job.committedAt ? formatDateTime(job.committedAt) : ''}
              </p>
            )}
          </div>
          {commit.error && (
            <p role="alert" className="mt-3 text-sm font-medium text-critical-700">
              {errorMessage(commit.error)}
            </p>
          )}
        </Section>
      )}

      <Section title="Previous imports" tone="flush">
        <QueryView query={history} isEmpty={(d) => d.length === 0} empty={<p className="p-5 text-sm text-muted">No imports yet.</p>}>
          {(rows) => (
            <ul>
              {rows.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-3 text-sm">
                  <span>
                    <span className="font-medium text-ink">{j.fileName}</span>
                    <span className="block text-xs text-muted">{formatDateTime(j.createdAt)} · {j.actorName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={j.status === 'committed' ? 'green' : 'neutral'}>{j.status === 'committed' ? 'Committed' : 'Previewed only'}</Badge>
                    <span className="text-muted">{formatNumber(j.counts.created)} created</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
    </div>
  );
}

export default function IntakePage() {
  const [tab, setTab] = useState('register');
  return (
    <>
      <PageHeader title="Intake and import" description="Register a battery received in the lab, or bring in existing spreadsheet records with a reviewable preview." />
      <Tabs
        label="Intake methods"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'register', label: 'Register one battery', content: <RegisterForm /> },
          { value: 'import', label: 'Import spreadsheet (CSV)', content: <ImportFlow /> },
          { value: 'bench', label: 'Import bench results (CSV)', content: <BenchImport /> },
        ]}
      />
    </>
  );
}

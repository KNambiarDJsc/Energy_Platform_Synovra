'use client';
import { Pencil, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import type { Lens } from '@/components/passport/BatteryFigure';
import { DeepDive } from '@/components/passport/DeepDive';
import {
  AuditPanel, CostsPanel, DeploymentPanel, EvidencePanel, IdentityCard, RestorationPanel, TelemetryPanel,
  TestsPanel, Timeline, WarrantyPanel, buildNarrative,
} from '@/components/passport/PassportParts';
import { AlertStateBadge, Badge, SeverityBadge, WarrantyBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { KeyValue, Notice, Section } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Overlay';
import { ReasonDialog } from '@/components/ui/ReasonDialog';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { TabCount, Tabs } from '@/components/ui/Tabs';
import { DEMO_CRITERION_TEXT } from '@/data/seed';
import { formatDate, formatNumber } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { BatteryPassport } from '@/services/types';

const TAB_VALUES = ['overview', 'timeline', 'tests', 'restoration', 'deployments', 'telemetry', 'costs', 'warranty', 'evidence', 'audit'] as const;
type TabValue = (typeof TAB_VALUES)[number];
const LENS_VALUES: Lens[] = ['overview', 'temperature', 'capacity', 'voltage', 'outlook'];

function QrDialog({ p, open, onOpenChange }: { p: BatteryPassport; open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useSession();
  const [reissue, setReissue] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/app/scan?ref=${p.battery.publicRef}` : `/app/scan?ref=${p.battery.publicRef}`;
  const act = useAction<string, { battery: unknown; retired: string }>((s, reason) => s.batteries.reissueLabel(p.battery.id, reason), {
    success: (r) => `New QR reference issued. ${r.retired} is retired and will show as retired when scanned.`,
    onSuccess: () => setReissue(false),
    toastError: false,
  });
  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={`Label and QR for ${p.battery.label}`} description="Print this on the physical battery.">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-canvas p-4" aria-hidden>
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={url} size={148} level="M" marginSize={0} />
            </div>
          </div>
          <div className="min-w-0 text-sm">
            <p className="mono break-all text-lg text-ink">{p.battery.publicRef}</p>
            <p className="mt-1 text-muted">Label {p.battery.label}</p>
            <Notice tone="info" className="mt-4" title="A QR code is a lookup key, not a pass">
              Scanning opens this record only after sign-in, and only if the person’s role and site scope allow it.
            </Notice>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>Print label</Button>
          {session.can('battery.create') && (
            <Button variant="secondary" onClick={() => setReissue(true)}>Reissue QR reference</Button>
          )}
        </div>
      </Modal>
      <ReasonDialog
        open={reissue}
        onOpenChange={setReissue}
        title="Reissue QR reference"
        description="Use when a label is damaged, lost or was applied to the wrong unit."
        summary={`The current reference ${p.battery.publicRef} will be retired. Existing prints will resolve as retired, not as this battery.`}
        confirmLabel="Reissue reference"
        loading={act.isPending}
        error={act.error ? errorMessage(act.error) : null}
        onConfirm={(reason) => act.mutate(reason)}
      />
    </>
  );
}

function CorrectDialog({ p, open, onOpenChange }: { p: BatteryPassport; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [field, setField] = useState<'manufacturerSerial' | 'manufacturedOn' | 'physicalLocation'>('manufacturerSerial');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const act = useAction<void, unknown>(
    (s) => s.batteries.correct({ batteryId: p.battery.id, field, newValue: value.trim() === '' ? null : value.trim(), reason }),
    { success: 'Correction saved. The previous value is kept in the timeline.', onSuccess: () => { onOpenChange(false); setValue(''); setReason(''); }, toastError: false },
  );
  const current = field === 'manufacturerSerial' ? p.battery.manufacturerSerial : field === 'manufacturedOn' ? p.battery.manufacturedOn : p.battery.physicalLocation;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Correct a record field"
      description="Corrections keep the previous value and are visible in the timeline."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={act.isPending} onClick={() => act.mutate()}>Save correction</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Field">
          <Select value={field} onChange={(e) => setField(e.target.value as typeof field)}>
            <option value="manufacturerSerial">Manufacturer serial</option>
            <option value="manufacturedOn">Manufacture date</option>
            <option value="physicalLocation">Physical location</option>
          </Select>
        </Field>
        <p className="text-sm text-muted">Current value: <span className="mono text-ink">{current ?? 'not recorded'}</span></p>
        <Field label="New value" hint={field === 'manufacturedOn' ? 'YYYY-MM-DD. Leave empty to clear.' : 'Leave empty to clear.'}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Reason" required hint="Required. Appears in the audit history.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {act.error && <p role="alert" className="text-sm font-medium text-critical-700">{errorMessage(act.error)}</p>}
      </div>
    </Modal>
  );
}

function OverviewTab({ p }: { p: BatteryPassport }) {
  const story = buildNarrative(p);
  const lastTest = p.lastApprovedTest;
  const rated = p.family.ratedCapacityAh;
  const pct = lastTest?.result.capacityAh != null ? (lastTest.result.capacityAh / rated) * 100 : null;
  const here = p.assignments.find((a) => !a.endAt);
  const openAlerts = p.alerts.filter((a) => a.state !== 'closed' && a.state !== 'resolved');
  const openTasks = p.tasks.filter((t) => t.status === 'open' || t.status === 'in_progress');
  return (
    <div className="app-stagger space-y-5">
      <Section title="This battery’s story" description="Assembled from the records on this passport. Nothing here is estimated.">
        <ol className="max-w-[72ch] space-y-3 text-[17px] leading-[27px] text-ink">
          {story.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Why it has this status">
          <p className="text-[17px] font-semibold text-ink">{p.evidenceStatus.label}</p>
          <p className="mt-1 text-sm text-ink">{p.evidenceStatus.detail}</p>
          {lastTest && <p className="mt-4 rounded-lg bg-canvas p-3.5 text-xs text-ink-2">{DEMO_CRITERION_TEXT}</p>}
        </Section>

        <Section title="Last approved test">
          {lastTest ? (
            <>
              <p className="text-[40px] font-semibold leading-none tracking-[-0.025em] text-ink">{formatNumber(lastTest.result.capacityAh, 0, 'Ah')}</p>
              <p className="mt-2 text-sm text-muted">
                {pct === null ? 'Rated capacity unknown' : `${formatNumber(pct, 0)}% of rated ${rated} Ah`} · measured {formatDate(lastTest.startedAt)}
              </p>
              <p className="mt-3 text-sm text-ink">
                Under test conditions: {formatNumber(lastTest.conditions.loadCurrentA, 1, 'A')} to {formatNumber(lastTest.conditions.cutoffVoltageV, 2, 'V')}, ambient {formatNumber(lastTest.conditions.ambientTempC, 0, '°C')}. Not temperature-corrected.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No approved test. Capacity is unknown.</p>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Location and warranty">
          <KeyValue
            columns={2}
            items={[
              { label: 'Where it is', value: here ? `${here.siteName}, ${here.bankName} / ${here.stringName}, position ${here.position}` : p.battery.physicalLocation },
              { label: 'Warranty', value: <WarrantyBadge state={p.warranty?.state ?? null} /> },
              ...(p.redacted ? [] : [{ label: 'Restoration batch', value: p.battery.restorationBatchId ?? 'None' }]),
              { label: 'Last updated', value: formatDate(p.battery.updatedAt) },
            ]}
          />
        </Section>
        <Section title="Open alerts and tasks">
          {openAlerts.length === 0 && openTasks.length === 0 ? (
            <p className="text-sm text-muted">Nothing is open for this battery.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {openAlerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} /> <AlertStateBadge state={a.state} />
                  <Link href={`/app/alerts?alert=${a.id}`} className="font-medium text-copper-700 hover:underline hover:underline-offset-4">{a.title}</Link>
                </li>
              ))}
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-ink">
                  <Badge tone="teal">Task</Badge> {t.title}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {p.predictions.length > 0 && (
        <Section title="Model outputs (demonstration)" description="Shadow mode. Not validated for production decisions.">
          <ul className="space-y-2.5 text-sm">
            {p.predictions.map((x) => (
              <li key={x.id} className="rounded-lg bg-canvas p-4">
                <p className="font-medium text-ink">{x.output.label}: {x.output.value}{x.output.range ? ` (${x.output.range})` : ''}</p>
                <p className="mt-0.5 text-xs text-muted">{x.modelName} {x.modelVersion} · {x.uncertainty}</p>
              </li>
            ))}
          </ul>
          <Link href="/app/intelligence" className="mt-4 inline-block text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
            Open Intelligence for full provenance
          </Link>
        </Section>
      )}

      <IdentityCard p={p} />
    </div>
  );
}

function PassportInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const id = params.id;
  const q = useSvcQuery(['battery', id], (s) => s.batteries.get(id));
  const [qr, setQr] = useState(false);
  const [correct, setCorrect] = useState(false);

  const requested = search.get('tab') as TabValue | null;
  const tab: TabValue = requested && TAB_VALUES.includes(requested) ? requested : 'overview';
  const requestedLens = search.get('lens') as Lens | null;
  const lens: Lens = requestedLens && LENS_VALUES.includes(requestedLens) ? requestedLens : 'overview';
  // Tab and lens live in the address, so a view can be shared or bookmarked and Back retraces it.
  const setParam = (key: 'tab' | 'lens', v: string) => {
    const sp = new URLSearchParams(search.toString());
    if (v === 'overview') sp.delete(key);
    else sp.set(key, v);
    router.replace(`/app/batteries/${id}${sp.toString() ? `?${sp.toString()}` : ''}`, { scroll: false });
  };
  const setTab = (v: string) => setParam('tab', v);
  const openSection = (v: string) => {
    setTab(v);
    requestAnimationFrame(() => document.getElementById('record')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <QueryView query={q} skeleton={<LoadingBlock label="Loading battery passport" rows={7} />}>
      {(p) => {
        const missingAndConflicts = [...p.quality.conflicts, ...p.quality.missing.map((m) => `Missing: ${m}`)];
        return (
          <>
            <DeepDive
              p={p}
              lens={lens}
              onLens={(l) => setParam('lens', l)}
              onOpenSection={openSection}
              actions={
                <>
                  <Button variant="secondary" size="sm" icon={<QrCode className="h-4 w-4" aria-hidden />} onClick={() => setQr(true)}>
                    Label and QR
                  </Button>
                  {session.can('battery.correct') && (
                    <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setCorrect(true)}>
                      Correct a field
                    </Button>
                  )}
                </>
              }
            />

            {(p.redactions.length > 0 || p.quality.level === 'conflict' || missingAndConflicts.length > 0) && (
              <div className="mt-10 space-y-3">
                {p.redactions.length > 0 && (
                  <Notice tone="info" title={p.redacted ? 'Customer view' : 'Some information is hidden for your role'}>
                    Not shown: {p.redactions.join('; ')}.
                  </Notice>
                )}
                {p.quality.level === 'conflict' && (
                  <Notice tone="danger" title="Identity conflict needs resolution">
                    <ul className="list-disc pl-5">
                      {p.quality.conflicts.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p className="mt-1">Records are not merged automatically. An engineer should confirm which physical battery each record describes.</p>
                  </Notice>
                )}
                {p.quality.level !== 'conflict' && missingAndConflicts.length > 0 && (
                  <Notice tone="warn" title="Incomplete record">
                    {missingAndConflicts.join(' · ')}
                  </Notice>
                )}
              </div>
            )}

            <section id="record" aria-labelledby="record-h" className="mt-12 scroll-mt-24 border-t border-line pt-8">
              <h2 id="record-h" className="mb-5 font-display text-[30px] leading-9 tracking-[-0.015em] text-ink">Full record</h2>
              <Tabs
                label="Battery passport sections"
                value={tab}
                onValueChange={setTab}
                tabs={[
                  { value: 'overview', label: 'Story', content: <OverviewTab p={p} /> },
                  { value: 'timeline', label: 'Lifecycle timeline', badge: <TabCount n={p.events.length} />, content: <Timeline events={p.events} /> },
                  { value: 'tests', label: 'Tests', content: <TestsPanel p={p} /> },
                  { value: 'restoration', label: 'Restoration', content: <RestorationPanel p={p} /> },
                  { value: 'deployments', label: 'Deployment history', content: <DeploymentPanel p={p} /> },
                  { value: 'telemetry', label: 'Telemetry', content: <TelemetryPanel p={p} /> },
                  { value: 'costs', label: 'Costs', content: <CostsPanel p={p} /> },
                  { value: 'warranty', label: 'Warranty', content: <WarrantyPanel p={p} /> },
                  { value: 'evidence', label: 'Evidence', badge: <TabCount n={p.evidence.length} />, content: <EvidencePanel p={p} /> },
                  { value: 'audit', label: 'Audit history', content: <AuditPanel p={p} /> },
                ]}
              />
            </section>

            <QrDialog p={p} open={qr} onOpenChange={setQr} />
            <CorrectDialog p={p} open={correct} onOpenChange={setCorrect} />
          </>
        );
      }}
    </QueryView>
  );
}

export default function PassportPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <PassportInner />
    </Suspense>
  );
}

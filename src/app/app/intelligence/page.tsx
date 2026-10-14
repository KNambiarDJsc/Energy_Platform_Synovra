'use client';
import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Notice, PageHeader } from '@/components/ui/Layout';
import { EmptyState, LoadingBlock, QueryView } from '@/components/ui/States';
import type { PredictionKind } from '@/domain/types';
import { formatDateTime, titleCase } from '@/lib/format';
import { useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { PredictionView } from '@/services/types';

const KIND_LABEL: Record<PredictionKind, string> = {
  qualification_aid: 'Qualification aid', capacity_estimate: 'Capacity estimate', failure_risk: 'Failure risk',
  anomaly_detection: 'Anomaly detection', inventory_planning: 'Inventory planning', warranty_risk: 'Warranty risk',
};

function PredictionCard({ p }: { p: PredictionView }) {
  const session = useSession();
  const review = useAction<'agreed' | 'disagreed', unknown>((s, outcome) => s.predictions.review(p.id, outcome), {
    success: 'Your review is recorded. The output remains in shadow mode.',
  });
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal">{KIND_LABEL[p.kind]}</Badge>
        <Badge tone="amber" icon={FlaskConical}>{p.status === 'shadow' ? 'Shadow mode' : 'Validated'}</Badge>
        {!p.applicability.inScope && <Badge tone="red">Outside model scope</Badge>}
        <span className="text-sm text-muted">
          {p.batteryId ? (
            <Link href={`/app/batteries/${p.batteryId}`} className="mono text-teal-800 underline underline-offset-2">{p.batteryLabel}</Link>
          ) : (
            p.siteName ?? 'Fleet'
          )}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[13px] font-medium text-muted">{p.output.label}</p>
        <p className="text-xl font-semibold text-navy">
          {p.output.value}
          {p.output.range && <span className="ml-2 text-base font-normal text-muted">({p.output.range})</span>}
        </p>
        <p className="mt-1 text-sm text-ink">Uncertainty: {p.uncertainty}</p>
      </div>

      <p className="mt-2 text-xs text-muted">
        {p.modelName} <span className="mono">{p.modelVersion}</span> · input data as of {formatDateTime(p.inputAt)} · {p.applicability.inScope ? 'within stated scope' : 'outside stated scope'}
      </p>

      <details className="mt-3 rounded-md border border-line">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-teal-800">How this output was produced</summary>
      <dl className="grid gap-x-8 gap-y-3 border-t border-line p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-[13px] font-medium text-muted">Model</dt><dd>{p.modelName} <span className="mono">{p.modelVersion}</span></dd></div>
        <div><dt className="text-[13px] font-medium text-muted">Applicability</dt><dd>{p.applicability.note}</dd></div>
        <div><dt className="text-[13px] font-medium text-muted">Input data as of</dt><dd>{formatDateTime(p.inputAt)}</dd></div>
        <div><dt className="text-[13px] font-medium text-muted">Prediction made</dt><dd>{formatDateTime(p.predictedAt)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[13px] font-medium text-muted">Inputs used</dt><dd>{p.inputsUsed}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[13px] font-medium text-muted">Compared against the simple rule</dt><dd>{p.baseline}</dd></div>
        {p.factors.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-[13px] font-medium text-muted">Factors shown to the reviewer</dt>
            <dd><ul className="list-disc pl-5">{p.factors.map((f) => <li key={f}>{f}</li>)}</ul></dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-[13px] font-medium text-muted">Source records</dt>
          <dd className="mt-0.5 flex flex-wrap gap-1.5">{p.sourceRecordIds.map((id) => <span key={id} className="mono rounded-full border border-line px-2 py-0.5 text-xs">{id}</span>)}</dd>
        </div>
      </dl>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className="text-sm">
          Human review:{' '}
          <strong>{p.reviewState === 'unreviewed' ? 'Not yet reviewed' : `${titleCase(p.reviewState)}${p.reviewedByName ? ` by ${p.reviewedByName}` : ''}`}</strong>
        </span>
        {session.can('test.review') && (
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" loading={review.isPending} onClick={() => review.mutate('agreed')}>Agree</Button>
            <Button size="sm" variant="secondary" loading={review.isPending} onClick={() => review.mutate('disagreed')}>Disagree</Button>
          </span>
        )}
      </div>
    </li>
  );
}

export default function IntelligencePage() {
  const [kind, setKind] = useState<PredictionKind | ''>('');
  const q = useSvcQuery(['predictions', kind], (s) => s.predictions.list(kind ? { kind } : {}));
  return (
    <>
      <PageHeader title="Intelligence" description="Model outputs shown with their provenance so a person can judge them. None of these can approve, qualify or reject a battery." />
      <Notice tone="synthetic" title="Demonstration output — not validated for production decisions." className="mb-6">
        No trained model is connected. These outputs are placeholders produced by fixed rules over synthetic records, to demonstrate how model results would be labelled, compared with a simple rule and reviewed by a person. Accuracy has not been measured.
      </Notice>
      <div className="mb-5 max-w-xs">
        <Field label="Output type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as PredictionKind | '')}>
            <option value="">All types</option>
            {(Object.keys(KIND_LABEL) as PredictionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
      </div>
      <QueryView query={q} skeleton={<LoadingBlock rows={4} />} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No model outputs for this selection" />}>
        {(rows) => (
          <ul className="space-y-4">
            {rows.map((p) => <PredictionCard key={p.id} p={p} />)}
          </ul>
        )}
      </QueryView>
    </>
  );
}

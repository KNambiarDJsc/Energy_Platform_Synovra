'use client';
import { ArrowRight, Cpu, Eraser, Fingerprint, GitCompareArrows, History, Layers, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { cn, formatNumber } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';

function Capability({ icon: Icon, title, children, now }: { icon: LucideIcon; title: string; children: ReactNode; now: ReactNode }) {
  return (
    <li className="card flex flex-col p-5">
      <Icon className="h-5 w-5 text-copper" strokeWidth={1.7} aria-hidden />
      <h3 className="mt-3 font-display text-[22px] leading-7 text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-[22px] text-ink-2">{children}</p>
      <p className="mt-auto border-t border-line pt-3 text-[13px] leading-5 text-muted"><span className="font-medium text-ink">In this build: </span>{now}</p>
    </li>
  );
}

const FLAGS = [
  ['A battery it learned from is corrected', 'Its serial or manufacture date changes after the model was registered.'],
  ['A family it never saw', 'A new attempt is for a battery family with no rows in its training set.'],
  ['A test protocol it never saw', 'The before-test used a protocol revision missing from its training set.'],
  ['An instrument it never saw', 'The before-test came from a bench or meter missing from its training set.'],
];

export function LearningLoopView() {
  const q = useSvcQuery(['insights', 'learning'], (s) => s.insights.learning());
  return (
    <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
      {(l) => {
        const maxMix = Math.max(1, ...l.labelMix.map((m) => m.count));
        return (
          <div className="space-y-8">
            <section aria-labelledby="loop-h">
              <h2 id="loop-h" className="font-display text-[26px] leading-8 text-ink">From a restoration attempt to a training row</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">Counted live from the records. A row reaches the end only if an engineer decided it, the decision says why, and every input existed before the attempt started.</p>
              <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {l.stages.map((s, i) => (
                  <li key={s.key} className={cn('relative rounded-xl p-4', s.key === 'eligible' ? 'bg-copper-50' : 'bg-white')}>
                    <p className="font-display text-[40px] leading-[44px] text-ink">{formatNumber(s.count)}</p>
                    <p className="mt-1 text-sm font-medium text-ink">{s.label}</p>
                    <p className="mt-1 text-[13px] leading-5 text-muted">{s.note}</p>
                    {i < l.stages.length - 1 && (
                      <ArrowRight className="absolute -right-3 top-6 z-10 hidden h-5 w-5 rounded-full bg-canvas p-0.5 text-copper lg:block" aria-hidden />
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid items-start gap-5 lg:grid-cols-2">
              <Section title="Why rows are left out" description="Excluded, not deleted. Each one can come back once the record is fixed.">
                {l.exclusions.length === 0 ? (
                  <p className="text-sm text-muted">Nothing is excluded.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {l.exclusions.map((e) => (
                      <li key={e.reason} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                        <span className="text-ink">{e.reason}</span>
                        <span className="num font-semibold text-ink">{e.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[13px] text-muted">
                  {l.quarantinedImportRows} import rows are in quarantine and {l.corrections.events} corrections are recorded on {l.corrections.batteries} batteries. Quarantined rows never reach the history; corrections keep the previous value.
                </p>
              </Section>
              <Section title="What the labels say" description="Decisions by outcome and reason code. Synthetic data, so the mix says nothing about real performance.">
                <ul className="space-y-3">
                  {l.labelMix.map((m) => (
                    <li key={`${m.outcome}:${m.code}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink">{m.label}</span>
                        <span className="num font-semibold text-ink">{m.count}</span>
                      </div>
                      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-fill" aria-hidden>
                        <span className={cn('anim-grow block h-full rounded-full', m.outcome === 'approved' ? 'bg-teal' : 'bg-copper')} style={{ width: `${(m.count / maxMix) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-start gap-3 rounded-xl bg-canvas p-4">
                  <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-copper" strokeWidth={1.7} aria-hidden />
                  <p className="text-sm text-ink">
                    Training set fingerprint <span className="mono rounded bg-white px-1.5 py-0.5 text-[13px]">{l.fingerprint}</span> over {l.stages.find((s) => s.key === 'eligible')?.count ?? 0} rows.
                    <span className="mt-1 block text-[13px] text-muted">The same selection always gives the same fingerprint, so a model version can name exactly what it learned from.</span>
                  </p>
                </div>
              </Section>
            </div>

            <section aria-labelledby="caps-h">
              <h2 id="caps-h" className="font-display text-[26px] leading-8 text-ink">What “learning” means here</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">Four different things. The platform does the first three; the fourth is a deliberate, reviewed step, not something a model does to itself.</p>
              <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Capability icon={History} title="Learn about each battery" now={`${l.corrections.events} corrections recorded, each keeping the value it replaced.`}>
                  Every test, attempt, deployment and return is added to the battery’s record. Nothing is overwritten.
                </Capability>
                <Capability icon={Layers} title="Learn across batteries" now={`${l.stages.find((s) => s.key === 'eligible')?.count ?? 0} eligible rows; ${l.models.withTrainingRecords} trained model versions.`}>
                  Compare outcomes by family, intake condition, lot and protocol, then train on the same rows, with a simple rule as the baseline to beat.
                </Capability>
                <Capability icon={GitCompareArrows} title="Notice when patterns change" now="No model has training records yet, so nothing can be flagged.">
                  A model is flagged for review when the data it learned from is corrected, or new batteries fall outside what it saw. A person decides what happens next.
                </Capability>
                <Capability icon={Eraser} title="Remove a record’s influence" now={`${l.models.registered} placeholder model versions, all shadow; ${l.models.validated} validated.`}>
                  Retrain without the record, register the new version in shadow, retire the old one once the replacement passes the gate. Trained models are never edited in place.
                </Capability>
              </ul>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <Section title="When a model is flagged for review" description="Checked by the database view ml_model_review_flags. A flag is a prompt for a person, never an automatic retrain.">
                <ul className="divide-y divide-line">
                  {FLAGS.map(([t, d]) => (
                    <li key={t} className="py-2.5">
                      <p className="text-sm font-medium text-ink">{t}</p>
                      <p className="text-[13px] text-muted">{d}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
                  <ShieldCheck className="h-4 w-4 text-teal" aria-hidden />
                  Human reviews of shadow outputs so far: {l.reviews.agreed} agreed, {l.reviews.disagreed} disagreed, {l.reviews.unreviewed} not reviewed.
                </p>
              </Section>
              <Section title="Compute: CPU first">
                <div className="flex items-start gap-3">
                  <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-copper" strokeWidth={1.7} aria-hidden />
                  <div className="space-y-3 text-sm leading-[22px] text-ink">
                    <p>Records, checks, reports and the first models (logistic regression, gradient-boosted trees, survival analysis) run on ordinary CPUs. At pilot volumes they train in seconds to minutes.</p>
                    <p className="text-ink-2">Rent GPU time only for a measured workload: deep models on high-rate telemetry, image inspection, or hosting a large language model yourself. What decides it is data shape, sampling rate, training frequency and latency, not battery count.</p>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

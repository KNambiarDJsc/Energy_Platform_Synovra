'use client';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { cn } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';
import type { CollectionStep } from '@/services/types';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** One capture step: how many records have every required field, and which field is short. */
function Step({ s, i }: { s: CollectionStep; i: number }) {
  const whole = pct(s.complete, s.applicable);
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">Step {i + 1} · {s.capturedIn}</p>
          <h3 className="font-display text-[22px] leading-7 text-ink">{s.step}</h3>
        </div>
        <p className="text-right">
          <span className={cn('font-display text-[30px] leading-9', whole < 100 ? 'text-copper-700' : 'text-ink')}>{whole}%</span>
          <span className="block text-[13px] text-muted">{s.complete} of {s.applicable} complete</span>
        </p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {s.fields.map((f) => {
          const p = pct(f.present, s.applicable);
          return (
            <li key={f.field}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink">{f.field}</span>
                <span className={cn('num', p < 100 ? 'font-semibold text-copper-700' : 'text-ink-2')}>
                  {s.applicable ? `${f.present} of ${s.applicable}` : 'Nothing to collect yet'}
                </span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
                <span className={cn('anim-grow block h-full rounded-full', p < 100 ? 'bg-copper' : 'bg-teal')} style={{ width: `${Math.max(p, p > 0 ? 2 : 0)}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      <Link href={s.href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
        Where this is captured <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </li>
  );
}

export function CollectionView() {
  const q = useSvcQuery(['insights', 'collection'], (s) => s.insights.collection());
  return (
    <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
      {(c) => {
        const top = c.chain[0].count || 1;
        return (
          <div className="space-y-8">
            <section aria-labelledby="chain-h">
              <h2 id="chain-h" className="font-display text-[26px] leading-8 text-ink">The chain each battery needs</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">
                Learning which batteries are worth reviving needs every link, recorded under the same battery ID. Each bar counts batteries that have all the links up to it. The last link is missing everywhere: no sale price or recovered value is recorded yet.
              </p>
              <ol className="mt-5 space-y-2.5">
                {c.chain.map((l, i) => (
                  <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[260px_minmax(0,1fr)_64px]">
                    <span className="text-sm text-ink"><span className="num text-muted">{i + 1}. </span>{l.label}</span>
                    <span className="order-3 col-span-2 block h-3 overflow-hidden rounded-full bg-fill sm:order-none sm:col-span-1" aria-hidden>
                      <span className={cn('anim-grow block h-full rounded-full', l.count === 0 ? '' : i === c.chain.length - 1 ? 'bg-copper' : 'bg-teal')}
                        style={{ width: `${(l.count / top) * 100}%`, animationDelay: `${i * 80}ms` }} />
                    </span>
                    <span className={cn('num text-right font-display text-[22px] leading-7', l.count === 0 ? 'text-copper-700' : 'text-ink')}>{l.count}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="font-display text-[26px] leading-8 text-ink">What each step must capture</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">Measured from the records you can see. A field short of 100% is the next thing to fix at that step: at the bench, on the form, or in the import template.</p>
              <ul className="mt-5 grid items-start gap-4 lg:grid-cols-2">
                {c.steps.map((s, i) => <Step key={s.key} s={s} i={i} />)}
              </ul>
            </section>

            <div className="grid items-start gap-5 lg:grid-cols-2">
              <Section title="Held at the door" description="Stopped before reaching any battery's history, and kept for a person to check. Nothing is silently fixed or dropped.">
                <ul className="divide-y divide-line">
                  {c.held.map((h) => (
                    <li key={h.label} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                      <span className="text-ink">{h.label}</span>
                      <span className="num font-semibold text-ink">{h.count}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Rules every capture follows">
                <ul className="space-y-2.5 text-sm text-ink">
                  {[
                    'Every value has a unit, a time, a source and the person or device that produced it.',
                    'A measurement belongs to one battery ID. A string or bank reading is never copied to each battery.',
                    'Unknown stays unknown: no blank becomes zero, no unit is guessed.',
                    'Nothing is overwritten. A correction is a new event that keeps the old value.',
                    'Suspicious rows are quarantined with the reason, not deleted.',
                  ].map((r) => (
                    <li key={r} className="flex items-start gap-2.5"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />{r}</li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        );
      }}
    </QueryView>
  );
}

'use client';
import { ArrowRight, CalendarCheck, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/ui/Button';
import { DataKindLegend, StatusBadge, StatusRing, STATUS_STYLE } from '@/components/ui/Status';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { STATUS_LABELS, type BatteryStatus } from '@/domain/status';
import { cn, formatDate, formatDateTime } from '@/lib/format';
import { useSession, useSvcQuery } from '@/lib/hooks';
import { since, useLastVisit } from '@/lib/useLastVisit';
import type { HomeItem, HomeView } from '@/services/types';

const ORDER: Exclude<BatteryStatus, 'retired'>[] = ['good', 'watching', 'attention', 'baseline'];

/** One sentence that says how everything is doing. No statistics lesson. */
function summary(h: HomeView): string {
  const { good, watching, attention, baseline } = h.counts;
  if (h.inFleet === 0) return 'No batteries on record yet.';
  if (attention === 0 && watching === 0 && baseline === 0) return 'Every battery is within range.';
  if (attention === 0) return watching ? 'Nothing needs attention. A few are being watched.' : 'Nothing needs attention.';
  if (good >= attention + watching) return `Most batteries are within range. ${attention} ${attention === 1 ? 'needs' : 'need'} attention.`;
  return `${attention} of ${h.inFleet} batteries ${attention === 1 ? 'needs' : 'need'} attention.`;
}

function ItemRow({ item, status }: { item: HomeItem; status: BatteryStatus }) {
  return (
    <li>
      <Link href={`/app/batteries/${item.id}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 rounded-xl px-4 py-4 transition-colors duration-150 hover:bg-canvas">
        <span className={cn('mt-[7px] h-2.5 w-2.5 rounded-full')} style={{ background: STATUS_STYLE[status].stroke }} aria-hidden />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="mono text-[17px] text-ink">{item.label}</span>
            <span className="text-sm text-muted">{item.place}</span>
          </span>
          <span className="mt-1 block text-[15px] leading-6 text-ink">{item.headline}</span>
          <span className="mt-1 flex items-start gap-1.5 text-sm text-copper-700">
            <ArrowRight className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.nextStep}
          </span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function Panel({ title, children, action, id }: { title: string; children: ReactNode; action?: ReactNode; id: string }) {
  return (
    <section className="card p-2 md:p-3" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
        <h2 id={id} className="font-display text-[24px] leading-8 tracking-[-0.01em] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type Snap = { inFleet: number; good: number; watching: number; attention: number; baseline: number };

/** What changed since this viewer last opened Home, in a few words. Nothing is shown on a first visit. */
function SinceLastVisit({ h, userId }: { h: HomeView; userId: string }) {
  // Mounted only once the data is here, so the remembered visit is read against real counts.
  const current: Snap = { inFleet: h.inFleet, ...h.counts };
  const previous = useLastVisit<Snap>(`synovra-home:${userId}`, current);
  if (!previous) return null;
  const lines: string[] = [];
  const added = current.inFleet - previous.inFleet;
  if (added > 0) lines.push(`${added} ${added === 1 ? 'battery' : 'batteries'} added`);
  for (const k of ['attention', 'watching', 'good'] as const) {
    const d = current[k] - previous[k];
    if (d !== 0) lines.push(`${STATUS_LABELS[k]} ${previous[k]} → ${current[k]}`);
  }
  return (
    <section className="card p-6" aria-labelledby="since-h">
      <h2 id="since-h" className="font-display text-[22px] leading-7 text-ink">Since your last visit</h2>
      <p className="mt-1 text-[13px] text-muted">You last looked {since(previous.at, formatDate)}.</p>
      {lines.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink">No change.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-[15px] text-ink">
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </section>
  );
}

/**
 * Home: how everything is doing, what changed, what needs attention, what happens next. Calm on purpose: one
 * picture, one sentence, then the few batteries that need a person. Detail lives one click away.
 */
export default function HomePage() {
  const session = useSession();
  const q = useSvcQuery(['home'], (s) => s.overview.home());
  const canActions = session.can('alert.read') && session.has('alerts');

  return (
    <QueryView query={q} skeleton={<LoadingBlock label="Loading home" rows={5} />}>
      {(h) => (
        <div className="app-stagger space-y-5">
          {/* how everything is doing */}
          <section className="card overflow-hidden px-6 py-8 md:px-10 md:py-10" aria-labelledby="home-h">
            <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-12">
              <StatusRing
                label={`${h.inFleet} batteries: ${ORDER.map((s) => `${h.counts[s]} ${STATUS_LABELS[s].toLowerCase()}`).join(', ')}.`}
                parts={ORDER.map((s) => ({ status: s, count: h.counts[s] }))}
              >
                <span className="font-display text-[56px] font-light leading-none tracking-[-0.03em] text-ink">{h.inFleet}</span>
                <span className="mt-1.5 text-sm text-muted">batteries</span>
              </StatusRing>
              <div className="min-w-0 flex-1">
                <h1 id="home-h" className="font-display text-[34px] font-light leading-[40px] tracking-[-0.02em] text-ink md:text-[44px] md:leading-[50px]">
                  {summary(h)}
                </h1>
                <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" aria-label="Batteries by status">
                  {ORDER.map((s) => (
                    <li key={s}>
                      <Link href={`/app/batteries?status=${s}`} className="group block rounded-lg py-1">
                        <span className="flex items-center gap-2 text-[13px] text-ink-2 group-hover:text-ink">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_STYLE[s].stroke }} aria-hidden />
                          {STATUS_LABELS[s]}
                        </span>
                        <span className="num mt-1 block text-[26px] font-semibold leading-8 text-ink">{h.counts[s]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 max-w-[64ch] text-[13px] leading-5 text-muted">
                  Status follows fixed rules ({h.rule.name} {h.rule.version}{h.rule.placeholder ? ', placeholder thresholds' : ''}) over the last approved test, sensor readings, open alerts and identity. It is not a model, and no health score is shown until a validated model exists.
                  {h.retired > 0 && <> {h.retired} out-of-service {h.retired === 1 ? 'battery keeps its' : 'batteries keep their'} record and {h.retired === 1 ? 'is' : 'are'} not counted.</>}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              {/* what needs attention */}
              <Panel
                id="attention-h"
                title="Needs attention"
                action={h.counts.attention > h.attention.length && (
                  <Link href="/app/batteries?status=attention" className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">All {h.counts.attention}</Link>
                )}
              >
                {h.attention.length === 0 ? (
                  <p className="flex items-center gap-2 px-4 pb-5 pt-2 text-[15px] text-ink">
                    <CheckCircle2 className="h-5 w-5 text-approved" aria-hidden /> Nothing needs attention.
                  </p>
                ) : (
                  <ul>{h.attention.map((i) => <ItemRow key={i.id} item={i} status="attention" />)}</ul>
                )}
              </Panel>
              {h.watching.length > 0 && (
                <Panel
                  id="watching-h"
                  title="Watching"
                  action={h.counts.watching > h.watching.length && (
                    <Link href="/app/batteries?status=watching" className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">All {h.counts.watching}</Link>
                  )}
                >
                  <ul>{h.watching.map((i) => <ItemRow key={i.id} item={i} status="watching" />)}</ul>
                </Panel>
              )}
            </div>

            <div className="space-y-5">
              {/* what happens next */}
              <section className="card p-6" aria-labelledby="actions-h">
                <h2 id="actions-h" className="font-display text-[22px] leading-7 text-ink">Actions</h2>
                <dl className="mt-4 grid grid-cols-3 gap-3">
                  {([
                    ['Now', h.actions.now, Clock, 'Batteries that need attention'],
                    ['Scheduled', h.actions.scheduled, CalendarCheck, 'Open service tasks'],
                    ['Completed', h.actions.completed, CheckCircle2, 'Service tasks done'],
                  ] as const).map(([label, n, Icon, hint]) => (
                    <div key={label} className="rounded-xl bg-canvas p-4" title={hint}>
                      <dt className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</dt>
                      <dd className="num mt-1 text-[28px] font-semibold leading-8 text-ink">{n}</dd>
                    </div>
                  ))}
                </dl>
                {canActions && (
                  <Link href="/app/alerts?tab=tasks" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
                    Open alerts and tasks <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </section>

              <section className="card p-6" aria-labelledby="journey-h">
                <h2 id="journey-h" className="font-display text-[22px] leading-7 text-ink">Your batteries and reports</h2>
                <p className="mt-1 text-[13px] text-muted">The fleet by site, each battery’s record, and an evidence-backed data report.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton href="/app/customer">Open the customer demo</LinkButton>
                  <LinkButton href="/app/customer/report" variant="secondary">Report preview</LinkButton>
                </div>
              </section>

              {session.user && <SinceLastVisit h={h} userId={session.user.id} />}

              <section className="card p-6" aria-labelledby="kinds-h">
                <h2 id="kinds-h" className="font-display text-[22px] leading-7 text-ink">What the numbers are</h2>
                <p className="mt-1 text-[13px] text-muted">Every value in a battery’s record says which of these it is.</p>
                <DataKindLegend className="mt-4 sm:grid-cols-1" />
              </section>

              <p className="px-1 text-[13px] text-muted">
                <StatusBadge status="baseline" className="mr-1.5 align-middle" />
                means there is no approved capacity test yet. It is shown instead of a number.
              </p>
              <p className="px-1 text-[13px] text-muted">Synthetic snapshot taken {formatDateTime(h.snapshotAt)}.</p>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}

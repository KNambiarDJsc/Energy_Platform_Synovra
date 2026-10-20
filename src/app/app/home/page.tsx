'use client';
import { ArrowRight, CalendarCheck, CheckCircle2, ChevronRight, Clock, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoDataNotice } from '@/components/customer/Parts';
import { LinkButton } from '@/components/ui/Button';
import { DataKindLegend, StatusBadge, StatusRing, STATUS_STYLE } from '@/components/ui/Status';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { STATUS_LABELS, type BatteryStatus } from '@/domain/status';
import { useFleet } from '@/lib/customer/hooks';
import { buildTimeline, computeCoverage } from '@/lib/customer/model';
import { useDemoRequests } from '@/lib/customer/requests';
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
        <span className="mt-[7px] h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[status].stroke }} aria-hidden />
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
  const current: Snap = { inFleet: h.inFleet, ...h.counts };
  const previous = useLastVisit<Snap>(`synovra-home:${userId}`, current);
  if (!previous) return null;
  const lines: string[] = [];
  const added = current.inFleet - previous.inFleet;
  if (added > 0) lines.push(`${added} ${added === 1 ? 'battery' : 'batteries'} added`);
  for (const k of ['attention', 'watching', 'good'] as const) {
    if (current[k] !== previous[k]) lines.push(`${STATUS_LABELS[k]} ${previous[k]} → ${current[k]}`);
  }
  return (
    <section className="card p-6" aria-labelledby="since-h">
      <h2 id="since-h" className="font-display text-[22px] leading-7 text-ink">Since your last visit</h2>
      <p className="mt-1 text-[13px] text-muted">You last looked {since(previous.at, formatDate)}.</p>
      {lines.length === 0 ? <p className="mt-3 text-[15px] text-ink">No change.</p> : <ul className="mt-3 space-y-1.5 text-[15px] text-ink">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </section>
  );
}

/** Now, scheduled, completed: one place, organised and calm. The detail is one click away on Actions. */
function ActionsGlance({ now }: { now: number }) {
  const requests = useDemoRequests();
  const { data } = useFleet();
  const completed = (data.data?.passports ?? []).reduce((n, p) => n + buildTimeline(p).filter((t) => t.completed).length, 0);
  return (
    <section className="card p-6" aria-labelledby="actions-h">
      <h2 id="actions-h" className="font-display text-[22px] leading-7 text-ink">Actions</h2>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {([
          ['Now', now, Clock, 'Batteries that need attention'],
          ['Scheduled', requests.length, CalendarCheck, 'Requests and plans you have made (demo)'],
          ['Completed', completed, CheckCircle2, 'Service work completed, from the records'],
        ] as const).map(([label, n, Icon, hint]) => (
          <div key={label} className="rounded-xl bg-canvas p-4" title={hint}>
            <dt className="flex items-center gap-1.5 text-[13px] text-ink-2"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</dt>
            <dd className="num mt-1 text-[28px] font-semibold leading-8 text-ink">{n}</dd>
          </div>
        ))}
      </dl>
      <Link href="/app/actions" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
        Open actions <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/** How far to trust the picture: what the records hold and how old it is. */
function Freshness() {
  const { data } = useFleet();
  if (!data.data) return null;
  const cov = computeCoverage(data.data.passports, data.data.snapshotAt);
  return (
    <p className="px-1 text-[13px] leading-5 text-muted" data-testid="home-coverage">
      {cov.withApprovedTest} of {cov.batteries} batteries have an approved capacity test, {cov.testsCurrent} within the last year. Sensors are simulated in this demonstration.
      {cov.lastUpdated && <> Records last changed {formatDateTime(cov.lastUpdated)}.</>}
    </p>
  );
}

/**
 * Home: how everything is doing, what changed, what needs attention, what happens next. Calm on purpose: one
 * picture, one sentence, then the few batteries that need a person. Detail lives one click away.
 */
export default function HomePage() {
  const session = useSession();
  const q = useSvcQuery(['home'], (s) => s.overview.home());

  return (
    <QueryView query={q} skeleton={<LoadingBlock label="Loading home" rows={5} />}>
      {(h) => (
        <div className="app-stagger space-y-5">
          <DemoDataNotice />
          <section className="card overflow-hidden px-6 py-8 md:px-10 md:py-10" aria-labelledby="home-h">
            <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-12">
              <StatusRing
                label={`${h.inFleet} batteries: ${ORDER.map((s) => `${h.counts[s]} ${STATUS_LABELS[s].toLowerCase()}`).join(', ')}.`}
                parts={ORDER.map((s) => ({ status: s, count: h.counts[s] }))}
              >
                <span className="font-display text-[60px] font-normal leading-none tracking-[-0.01em] text-ink">{h.inFleet}</span>
                <span className="mt-1.5 text-sm text-muted">batteries</span>
              </StatusRing>
              <div className="min-w-0 flex-1">
                <h1 id="home-h" className="font-display text-[36px] font-normal leading-[40px] tracking-[-0.01em] text-ink md:text-[44px] md:leading-[50px]">{summary(h)}</h1>
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
                <div className="no-print mt-5 flex flex-wrap gap-2">
                  <LinkButton href="/app/batteries">See every battery</LinkButton>
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-fill px-5 text-sm font-medium text-ink hover:bg-fill-2"
                    onClick={() => window.dispatchEvent(new CustomEvent('synovra:ask', { detail: 'Which batteries need attention?' }))}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden /> Ask which need attention
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel
                id="attention-h"
                title="Needs attention"
                action={h.counts.attention > h.attention.length && <Link href="/app/batteries?status=attention" className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">All {h.counts.attention}</Link>}
              >
                {h.attention.length === 0 ? (
                  <p className="flex items-center gap-2 px-4 pb-5 pt-2 text-[15px] text-ink"><CheckCircle2 className="h-5 w-5 text-approved" aria-hidden /> Nothing needs attention.</p>
                ) : (
                  <ul>{h.attention.map((i) => <ItemRow key={i.id} item={i} status="attention" />)}</ul>
                )}
              </Panel>
              {h.watching.length > 0 && (
                <Panel
                  id="watching-h"
                  title="Watching"
                  action={h.counts.watching > h.watching.length && <Link href="/app/batteries?status=watching" className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">All {h.counts.watching}</Link>}
                >
                  <ul>{h.watching.map((i) => <ItemRow key={i.id} item={i} status="watching" />)}</ul>
                </Panel>
              )}
            </div>

            <div className="space-y-5">
              <ActionsGlance now={h.counts.attention} />
              {session.user && <SinceLastVisit h={h} userId={session.user.id} />}
              <section className="card p-6" aria-labelledby="kinds-h">
                <h2 id="kinds-h" className="font-display text-[22px] leading-7 text-ink">What the numbers are</h2>
                <p className="mt-1 text-[13px] text-muted">Every value in a battery’s record says which of these it is.</p>
                <DataKindLegend className="mt-4 sm:grid-cols-1" />
              </section>
              <p className="px-1 text-[13px] text-muted">
                <StatusBadge status="baseline" className={cn('mr-1.5 align-middle')} />
                means there is no approved capacity test yet. It is shown instead of a number.
              </p>
              <Freshness />
              <p className="px-1 text-[13px] text-muted">Synthetic snapshot taken {formatDateTime(h.snapshotAt)}.</p>
            </div>
          </div>
        </div>
      )}
    </QueryView>
  );
}

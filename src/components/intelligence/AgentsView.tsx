'use client';
import { BookOpenCheck, CircleSlash, FileSearch, Play, Scale, ScanSearch, Send, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { chipClass } from '@/components/ui/buttonClass';
import { Field, Select } from '@/components/ui/Field';
import { Notice, Section } from '@/components/ui/Layout';
import { cn, formatDateTime } from '@/lib/format';
import { errorMessage, useAction, useSvcQuery } from '@/lib/hooks';
import type { AgentKind, AgentReport, AnalystAnswer, AssistantCitation } from '@/services/types';
import { LocalAgent } from './LocalAgent';

function hrefFor(c: AssistantCitation): string | null {
  switch (c.kind) {
    case 'battery': return `/app/batteries/${c.id}`;
    case 'test': return `/app/tests?test=${c.id}`;
    case 'alert': return `/app/alerts?alert=${c.id}`;
    case 'attempt':
    case 'batch': return '/app/restoration';
    case 'prediction': return '/app/intelligence';
    default: return null;
  }
}

/** Four bounded capabilities. Each reads, cites and stops; none writes or acts. */
const AGENTS: { kind: AgentKind; icon: LucideIcon; name: string; run: string; job: string; reads: string; battery?: boolean }[] = [
  {
    kind: 'data_steward', icon: BookOpenCheck, name: 'Data quality', run: 'Check data quality',
    job: 'Finds missing identities, units, dates, calibration and labels before they reach a report or a model. Says what to fix; never changes a value.',
    reads: 'Battery records, tests, attempts, cost entries and sensor mappings.',
  },
  {
    kind: 'battery_investigator', icon: FileSearch, name: 'Battery evidence', run: 'Summarise the evidence', battery: true,
    job: 'Summarises one battery’s passport and links every sentence to the record it came from. Keeps measurements apart from estimates.',
    reads: 'One passport: tests, attempts, alerts, telemetry summary and model outputs.',
  },
  {
    kind: 'recovery_decision', icon: Scale, name: 'Recovery decision', run: 'Weigh the routes', battery: true,
    job: 'Runs the revive, test or recycle calculation on recorded inputs and names the inputs that are missing. Would call a model only if a validated one existed; none does.',
    reads: 'One battery, its family’s decided attempts, and recorded costs.',
  },
  {
    kind: 'recovery_analyst', icon: TrendingUp, name: 'Process learning', run: 'Compare outcomes',
    job: 'Compares verified outcomes by family and batch, with sample sizes and intervals. Says when a controlled trial would be needed; makes no causal claims.',
    reads: 'Decided restoration attempts and their reason codes; costs if your role may see them.',
  },
];
const CAPABILITY = Object.fromEntries(AGENTS.map((a) => [a.kind, a.name])) as Record<AgentKind, string>;

const EXAMPLES = [
  'Which battery types had the best revival yield last month?',
  'Show batteries where treatment cost exceeded the value recovered.',
  'What measurements are missing before we can compare these batches?',
  'How did outcomes differ between batches?',
  'Should we revive or recycle B-0034?',
  'Summarise the history of B-0017.',
];

const TOOL_TEXT: Record<string, string> = {
  validate_records: 'Validate records',
  get_battery_history: 'Get battery history',
  compare_process_cohorts: 'Compare cohorts',
  calculate_route_economics: 'Calculate route economics',
  get_model_prediction: 'Get model prediction',
  retrieve_approved_procedure: 'Retrieve approved procedure',
  get_cost_lines: 'Get cost lines',
};

function Report({ r }: { r: AgentReport }) {
  return (
    <div className="lens-in mt-5 border-t border-line pt-5" aria-live="polite">
      <p className="text-[13px] text-muted">{r.title} · run {formatDateTime(r.generatedAt)}</p>
      {r.findings.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {r.findings.map((f, i) => (
            <li key={i} className={cn('rounded-xl p-3.5 text-sm leading-[22px] text-ink', f.attention ? 'bg-copper-50' : 'bg-canvas')}>
              {f.text}
              {f.citations.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {f.citations.map((c) => {
                    const href = hrefFor(c);
                    const cls = 'mono rounded-full bg-white px-2.5 py-0.5 text-xs';
                    return href ? (
                      <Link key={`${c.kind}:${c.id}`} href={href} className={cn(cls, 'text-copper-700 hover:underline hover:underline-offset-2')}>{c.label}</Link>
                    ) : (
                      <span key={`${c.kind}:${c.id}`} className={cls}>{c.label}</span>
                    );
                  })}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : null}
      {r.missing.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-ink">Looked for, not found</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
            {r.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[13px] text-muted">{r.scope}</p>
    </div>
  );
}

/** The one entry point: a question goes to a fixed router, which picks one capability and shows its working. */
function Analyst() {
  const [text, setText] = useState('');
  const ask = useAction<string, AnalystAnswer>((s, q) => s.insights.ask(q), { toastError: false });
  const submit = (q: string) => {
    const t = q.trim();
    if (!t || ask.isPending) return;
    setText(t);
    ask.mutate(t);
  };
  const a = ask.data;
  return (
    <section aria-labelledby="analyst-h" className="card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="analyst-h" className="font-display text-[28px] leading-9 text-ink">Ask the analyst</h2>
          <p className="mt-1 text-sm text-muted">
            One question box. A fixed router sends the question to one of the four capabilities below, which reads records, runs approved calculations and shows its working. No language model is connected in this demonstration.
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5"><Badge tone="teal">Read-only</Badge><Badge tone="neutral">Shows its tools</Badge></span>
      </div>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e: FormEvent) => { e.preventDefault(); submit(text); }}>
        <label htmlFor="analyst-q" className="sr-only">Your question</label>
        <input id="analyst-q" className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder="For example: which battery types had the best revival yield last month?" />
        <Button type="submit" icon={<Send className="h-4 w-4" aria-hidden />} loading={ask.isPending} disabled={!text.trim()}>Ask</Button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Example questions">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => submit(q)} className={chipClass(false, 'min-h-[36px] whitespace-normal py-1.5 text-left text-[13px]')}>{q}</button>
          </li>
        ))}
      </ul>
      {ask.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(ask.error)}</p>}
      {a && (
        <div className="lens-in mt-6 border-t border-line pt-5" aria-live="polite">
          <p className="text-[13px] text-muted">“{a.question}”</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {a.capability ? <Badge tone="teal">{CAPABILITY[a.capability]}</Badge> : <Badge tone="neutral">Not routed</Badge>}
            <span className="text-[13px] text-muted">Routed because it {a.routedBecause}.</span>
          </div>
          {a.insufficient ? (
            <Notice tone="warn" title="The records cannot answer this yet" className="mt-4">{a.lead}</Notice>
          ) : (
            <p className="mt-3 font-display text-[22px] leading-8 text-ink">{a.lead}</p>
          )}
          {a.toolsCalled.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink"><Wrench className="h-3.5 w-3.5 text-copper" aria-hidden />Tools called, in order</p>
              <ol className="mt-2 space-y-1.5 text-[13px]">
                {a.toolsCalled.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-canvas px-3 py-2">
                    <span className="mono text-ink">{t.tool}</span>
                    <span className="text-muted">{TOOL_TEXT[t.tool]} · {t.input}</span>
                    <span className="text-ink-2">→ {t.result}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {a.report && <Report r={a.report} />}
        </div>
      )}
    </section>
  );
}

function AgentCard({ kind, icon: Icon, name, run: runLabel, job, reads, battery }: (typeof AGENTS)[number]) {
  const [batteryId, setBatteryId] = useState('');
  const batteries = useSvcQuery(['batteries', 'for-agent'], (s) => s.batteries.list(), { enabled: !!battery });
  const run = useAction<void, AgentReport>((s) => s.insights.runAgent(kind, { batteryId: batteryId || null }), { toastError: false });
  const needsBattery = !!battery && !batteryId;
  return (
    <li className="card flex flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-copper" strokeWidth={1.7} aria-hidden />
        <span className="flex flex-wrap justify-end gap-1.5">
          <Badge tone="teal">Read-only</Badge>
          <Badge tone="neutral">Cites records</Badge>
        </span>
      </div>
      <h3 className="mt-3 font-display text-[24px] leading-8 text-ink">{name}</h3>
      <p className="mt-1 text-sm leading-[22px] text-ink-2">{job}</p>
      <p className="mt-2 text-[13px] text-muted">Reads: {reads}</p>
      <div className="mt-auto flex flex-wrap items-end gap-3 pt-5">
        {battery && (
          <Field label="Battery" className="min-w-[180px] flex-1">
            <Select value={batteryId} onChange={(e) => setBatteryId(e.target.value)}>
              <option value="">Choose a battery</option>
              {(batteries.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.label} · {b.model}</option>)}
            </Select>
          </Field>
        )}
        <Button icon={<Play className="h-4 w-4" aria-hidden />} loading={run.isPending} disabled={needsBattery} onClick={() => run.mutate()}>
          {runLabel}
        </Button>
      </div>
      {run.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(run.error)}</p>}
      {run.data && <Report r={run.data} />}
    </li>
  );
}

export function AgentsView() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h2 className="font-display text-[26px] leading-8 text-ink">Narrow capabilities, not autonomous agents</h2>
        <p className="mt-1 text-sm text-muted">
          Each one reads approved records you are allowed to see, cites them, and says what it could not find. A person decides what to do with the result. Updating the records changes what they know; no model is retrained for that.
        </p>
      </div>
      <LocalAgent />
      <Analyst />
      <ul className="grid items-start gap-4 lg:grid-cols-2">
        {AGENTS.map((a) => <AgentCard key={a.kind} {...a} />)}
      </ul>
      <Section title="What no agent can do here">
        <ul className="grid gap-x-8 gap-y-2.5 text-sm text-ink sm:grid-cols-2">
          {[
            'Send a command to a charger, rectifier or test machine',
            'Change a restoration procedure, recipe or solvent',
            'Approve, qualify or reject a battery',
            'Route a battery to sale, reuse or recycling',
            'Write to a record without a person confirming it',
            'Read records outside your role and sites',
          ].map((x) => (
            <li key={x} className="flex items-start gap-2.5">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-critical-700" aria-hidden />{x}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2.5 text-[13px] text-muted">
          <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Learning by trial and error on live equipment (reinforcement learning) is out of scope: it needs a safe, validated test environment that does not exist.
        </p>
      </Section>
    </div>
  );
}

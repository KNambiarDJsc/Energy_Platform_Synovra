'use client';
import { Bot, CircleAlert, CircleCheck, Cpu, Play, Wrench } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { chipClass } from '@/components/ui/buttonClass';
import { Notice } from '@/components/ui/Layout';
import { errorMessage, useAction, useSvcQuery } from '@/lib/hooks';
import type { AgentRun, AgentStep } from '@/services/types';

const GOALS = [
  'Audit our data collection: where is the chain from intake to recovered value weakest, and what should we fix first?',
  'Which batteries cost more than the value we recorded for them, and what do they have in common?',
  'Compare outcomes by process version and say what data would make the comparison fair.',
  'Prepare a short briefing on B-0017 for the site visit.',
];

/** Renders the model's plain-text answer: paragraphs, bullet lines and **bold**, nothing else. */
function AnswerText({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <div className="space-y-2 text-[15px] leading-6 text-ink">
      {lines.map((l, i) => (/^\s*[-*•]\s+/.test(l)
        ? <p key={i} className="flex gap-2 pl-1"><span aria-hidden className="text-copper">•</span><span>{bold(l.replace(/^\s*[-*•]\s+/, ''))}</span></p>
        : <p key={i}>{bold(l)}</p>))}
    </div>
  );
}

/**
 * An agent on a local model (Ollama). Given a goal, it decides which read-only tools to call and in what order,
 * then summarises. It runs on this machine; nothing leaves it. It cannot change a record or touch equipment.
 */
export function LocalAgent() {
  const status = useSvcQuery(['agent', 'status'], (s) => s.agent.status());
  const [goal, setGoal] = useState('');
  const [live, setLive] = useState<AgentStep[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const run = useAction<string, AgentRun>((s, g) => s.agent.run(g, { onStep: (st) => setLive((xs) => [...xs, st]) }), { toastError: false });

  useEffect(() => {
    if (!run.isPending) return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [run.isPending]);

  const start = (g: string) => {
    const t = g.trim();
    if (!t || run.isPending) return;
    setGoal(t);
    setLive([]);
    setElapsed(0);
    run.mutate(t);
  };
  const st = status.data;
  const r = run.data;
  const steps = r?.steps ?? live;

  return (
    <section aria-labelledby="agent-h" className="card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="agent-h" className="flex items-center gap-2.5 font-display text-[28px] leading-9 text-ink"><Bot className="h-6 w-6 text-copper" strokeWidth={1.6} aria-hidden />Agent on a local model</h2>
          <p className="mt-1 text-sm text-muted">
            Give it a goal. It plans its own sequence of read-only look-ups, reads what comes back, and writes a summary. It runs through Ollama on this machine, so no record leaves it. It cannot change a record, run a charger or decide a battery’s route.
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="teal">Read-only tools</Badge>
          {st?.available ? <Badge tone="green" icon={Cpu}>{st.model}</Badge> : <Badge tone="neutral" icon={Cpu}>{status.isLoading ? 'Checking Ollama…' : 'Ollama not running'}</Badge>}
        </span>
      </div>

      {st && !st.available && (
        <Notice tone="info" className="mt-4" title="The local model is not available">
          {st.reason} Start Ollama and pull a model (for example <span className="mono">ollama pull qwen2.5:7b</span>), then reload. Until then, use the analyst below: it answers with fixed rules and no model.
        </Notice>
      )}

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e: FormEvent) => { e.preventDefault(); start(goal); }}>
        <label htmlFor="agent-goal" className="sr-only">Goal for the agent</label>
        <input id="agent-goal" className="input flex-1" value={goal} maxLength={600} onChange={(e) => setGoal(e.target.value)} placeholder="For example: where is our data collection weakest?" disabled={!st?.available} />
        <Button type="submit" icon={<Play className="h-4 w-4" aria-hidden />} loading={run.isPending} disabled={!st?.available || !goal.trim()}>Run agent</Button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Example goals">
        {GOALS.map((g) => (
          <li key={g}><button type="button" disabled={!st?.available || run.isPending} onClick={() => start(g)} className={chipClass(false, 'min-h-[36px] whitespace-normal py-1.5 text-left text-[13px] disabled:opacity-40')}>{g}</button></li>
        ))}
      </ul>

      {(run.isPending || r || run.error) && (
        <div className="mt-6 border-t border-line pt-5">
          {run.isPending && (
            <p className="text-sm text-muted" role="status">
              Working for {elapsed} s on a CPU-only model. Each step can take 20–60 seconds.
            </p>
          )}
          {steps.length > 0 && (
            <div className="mt-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink"><Wrench className="h-3.5 w-3.5 text-copper" aria-hidden />What it looked up, in the order it chose</p>
              <ol className="mt-2 space-y-1.5">
                {steps.map((s, i) => (
                  <li key={i} className="rounded-lg bg-canvas px-3 py-2 text-[13px]">
                    <details>
                      <summary className="cursor-pointer">
                        <span className="mono text-ink">{s.tool}</span>
                        {Object.keys(s.args).length > 0 && <span className="text-muted"> {JSON.stringify(s.args)}</span>}
                        {!s.allowed && <Badge tone="red" className="ml-2">Refused: not an allowed tool</Badge>}
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-4 text-ink-2">{s.resultPreview}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {run.error && <p role="alert" className="mt-3 text-sm font-medium text-critical-700">{errorMessage(run.error)}</p>}
          {r && (
            <div className="lens-in mt-5" aria-live="polite">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span>{r.model} · {r.seconds} s · {r.steps.length} look-ups</span>
                {r.ungroundedNumbers.length === 0
                  ? <Badge tone="green" icon={CircleCheck}>Every number traced to a tool result</Badge>
                  : <Badge tone="amber" icon={CircleAlert}>Not found in any tool result: {r.ungroundedNumbers.join(', ')}</Badge>}
              </div>
              <AnswerText text={r.answer} />
              <p className="mt-4 text-[13px] text-muted">
                Written by a general-purpose language model from the look-ups above. It can still misread a result, so check anything you act on against them. A person decides.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

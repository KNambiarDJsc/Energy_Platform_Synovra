'use client';
import { Calculator, Recycle, RotateCcw, Scale, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, parseNumberInput } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Overlay';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { routeEconomics, type Route, type RouteInputs } from '@/domain/routeEconomics';
import { cn, formatNumber } from '@/lib/format';
import { errorMessage, useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { RouteInputsView } from '@/services/types';

const ORDER: { key: keyof RouteInputs; label: string; unit: 'AED' | '%'; group: 'chance' | 'value' | 'cost' }[] = [
  { key: 'pSaleable', label: 'Chance of reaching saleable grade', unit: '%', group: 'chance' },
  { key: 'salePriceAed', label: 'Sale price if saleable', unit: 'AED', group: 'value' },
  { key: 'recyclingValueAed', label: 'Recycling value', unit: 'AED', group: 'value' },
  { key: 'treatmentCostAed', label: 'Treatment and retest cost', unit: 'AED', group: 'cost' },
  { key: 'reviveLogisticsAed', label: 'Logistics if revived', unit: 'AED', group: 'cost' },
  { key: 'recycleLogisticsAed', label: 'Logistics if recycled', unit: 'AED', group: 'cost' },
  { key: 'warrantyAllowanceAed', label: 'Warranty allowance per sale', unit: 'AED', group: 'cost' },
  { key: 'furtherTestCostAed', label: 'Cost of a further test', unit: 'AED', group: 'cost' },
];

const ROUTE: Record<Route, { label: string; icon: typeof Recycle }> = {
  revive: { label: 'Revive', icon: RotateCcw },
  test: { label: 'Test further', icon: Search },
  recycle: { label: 'Recycle', icon: Recycle },
};

const aed = (n: number) => `${n < 0 ? '−' : ''}AED ${formatNumber(Math.abs(n), 0)}`;

/** The calculator's state in words, kept with the decision in the audit history. */
function describe(i: RouteInputs, r: ReturnType<typeof routeEconomics>): string {
  const f = (n: number | null, unit = 'AED') => (n === null ? 'not entered' : unit === '%' ? `${Math.round(n * 100)}%` : `AED ${n}`);
  return [
    `chance ${f(i.pSaleable, '%')}${i.cohortN ? ` (n=${i.cohortN})` : ' (entered)'}`, `sale ${f(i.salePriceAed)}`, `recycling ${f(i.recyclingValueAed)}`,
    `treatment ${f(i.treatmentCostAed)}`, `logistics ${f(i.reviveLogisticsAed)} / ${f(i.recycleLogisticsAed)}`, `warranty ${f(i.warrantyAllowanceAed)}`,
    `revive ${r.revive.value === null ? '—' : `AED ${r.revive.value}`}`, `recycle ${r.recycle.value === null ? '—' : `AED ${r.recycle.value}`}`,
    `suggested ${r.suggestion ?? 'none'}`,
  ].join('; ');
}

/** A person picks the route; the calculator only informs it. Engineers only. */
function RecordDecision({ view, suggestion, assumptions }: { view: RouteInputsView; suggestion: Route | null; assumptions: string }) {
  const session = useSession();
  const [route, setRoute] = useState<Route | ''>('');
  const [reason, setReason] = useState('');
  const chosen = route || suggestion || '';
  const act = useAction<void, unknown>((s) => s.insights.recordRoute({ batteryId: view.batteryId, route: chosen as Route, reason, assumptions }), {
    success: 'Decision recorded on the battery’s timeline, with these assumptions in the audit history.', toastError: false,
    onSuccess: () => setReason(''),
  });
  if (!session.can('restoration.review')) return null;
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-sm font-medium text-ink">Record your decision</p>
      <p className="text-[13px] text-muted">You decide; the suggestion is one input. The numbers above are kept with it.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
        <Field label="Route">
          <Select value={chosen} onChange={(e) => setRoute(e.target.value as Route)}>
            <option value="">Choose</option>
            <option value="revive">Revive</option>
            <option value="test">Test further</option>
            <option value="recycle">Recycle</option>
          </Select>
        </Field>
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why this route" />
        </Field>
      </div>
      {act.error && <p role="alert" className="mt-2 text-sm font-medium text-critical-700">{errorMessage(act.error)}</p>}
      <Button size="sm" className="mt-3" loading={act.isPending} disabled={!chosen || reason.trim().length < 5} onClick={() => act.mutate()}>Record decision</Button>
    </div>
  );
}

function Calculator_({ view }: { view: RouteInputsView }) {
  // Text state per field, so a person can clear a box without it snapping back.
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(ORDER.map((o) => {
      const v = view.fields[o.key].value;
      return [o.key, v === null ? '' : String(o.unit === '%' ? Math.round(v * 1000) / 10 : v)];
    })));
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const inputs = useMemo<RouteInputs>(() => {
    const out = Object.fromEntries(ORDER.map((o) => {
      const n = parseNumberInput(text[o.key] ?? '');
      return [o.key, n === null ? null : o.unit === '%' ? n / 100 : n];
    })) as unknown as RouteInputs;
    // The cohort size only describes the observed chance; once a person changes the chance, it no longer applies.
    out.cohortN = touched.has('pSaleable') ? null : view.fields.cohortN.value;
    return out;
  }, [text, touched, view.fields.cohortN.value]);
  const r = routeEconomics(inputs);

  const card = (route: 'revive' | 'recycle', value: number | null, lines: { label: string; aed: number }[]) => {
    const Icon = ROUTE[route].icon;
    return (
      <div className={cn('rounded-xl p-4', r.suggestion === route ? 'bg-copper-50' : 'bg-canvas')}>
        <p className="flex items-center gap-2 text-sm font-medium text-ink"><Icon className="h-4 w-4 text-copper" aria-hidden />{ROUTE[route].label}</p>
        <p className="mt-1 font-display text-[30px] leading-9 text-ink">{value === null ? '—' : aed(value)}</p>
        {lines.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[13px] text-ink-2">
            {lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-3"><span>{l.label}</span><span className="num">{aed(l.aed)}</span></li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {ORDER.map((o) => {
          const f = view.fields[o.key];
          const edited = touched.has(o.key);
          return (
            <Field key={o.key} label={`${o.label} (${o.unit})`} hint={edited ? 'Entered by you for this what-if.' : f.source}>
              <Input
                inputMode="decimal"
                value={text[o.key] ?? ''}
                placeholder="Not recorded"
                onChange={(e) => {
                  setText((t) => ({ ...t, [o.key]: e.target.value }));
                  setTouched((s) => new Set(s).add(o.key));
                }}
              />
            </Field>
          );
        })}
      </div>
      <div className="space-y-4" aria-live="polite">
        {r.suggestion ? (
          <div className="rounded-xl bg-night p-5 text-white">
            <p className="text-[13px] text-[#D9D0C4]">Suggested route · decision support, not a decision</p>
            <p className="mt-1 font-display text-[34px] leading-10">{ROUTE[r.suggestion].label}</p>
            <p className="mt-2 text-sm leading-[22px] text-[#EDE6DC]">{r.why}</p>
          </div>
        ) : (
          <Notice tone="warn" title="Not enough to suggest a route">{r.why}</Notice>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {card('revive', r.revive.value, r.revive.lines)}
          {card('recycle', r.recycle.value, r.recycle.lines)}
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-[13px] text-muted">Break-even chance</dt>
            <dd className="font-display text-[22px] text-ink">{r.breakEvenP === null ? '—' : `${Math.round(r.breakEvenP * 100)}%`}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">A further test costs</dt>
            <dd className="font-display text-[22px] text-ink">{r.test.cost === null ? '—' : aed(r.test.cost)}</dd>
          </div>
        </dl>
        {view.sunkCostsAed !== null && (
          <p className="text-[13px] text-muted">{aed(view.sunkCostsAed)} already spent on {view.batteryLabel} is left out: it is the same on every route.</p>
        )}
        <RecordDecision view={view} suggestion={r.suggestion} assumptions={describe(inputs, r)} />
        <details className="rounded-xl bg-canvas p-4 text-[13px] leading-5 text-ink-2">
          <summary className="cursor-pointer font-medium text-copper-700">How this is calculated</summary>
          <p className="mt-2">Revive = chance × sale price + (1 − chance) × recycling value − treatment − logistics − chance × warranty allowance.</p>
          <p className="mt-1">Recycle = recycling value − logistics.</p>
          <p className="mt-1">Further testing is suggested when the chance rests on fewer than 10 batteries or sits within 10 points of break-even, because then a better measurement could change the answer.</p>
          <p className="mt-1">The chance is an observed rate in this family, not a prediction for this battery. Nothing here is saved.</p>
        </details>
      </div>
    </div>
  );
}

export function RouteCalculatorButton({ batteryId, label }: { batteryId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const q = useSvcQuery(['insights', 'route', batteryId], (s) => s.insights.routeInputs(batteryId), { enabled: open });
  return (
    <>
      <Button variant="secondary" size="sm" icon={<Calculator className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>
        Open route calculator
      </Button>
      <Modal open={open} onOpenChange={setOpen} size="lg" title={`Revive, test or recycle ${label}?`}
        description="A what-if over stated assumptions. Every input shows where it came from; change any of them.">
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone="amber" icon={Scale}>Decision support</Badge>
          <Badge tone="neutral">No prediction model</Badge>
        </div>
        <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
          {(view) => <Calculator_ view={view} />}
        </QueryView>
      </Modal>
    </>
  );
}

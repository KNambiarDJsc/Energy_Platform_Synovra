import { routeEconomics, type RouteInputs } from '@/domain/routeEconomics';
import type { Services } from '../types';

/**
 * The only things the agent can do. Each tool is read-only, runs through the same services as the screens,
 * and therefore with the signed-in person's permissions. There is no tool that writes, deletes, runs SQL,
 * fetches a URL or reaches a device. Results are trimmed so a small local model can hold them.
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string; enum?: string[] }>; required: string[] };
}

export const AGENT_TOOLS: ToolSpec[] = [
  { name: 'get_collection_pipeline', description: 'How many batteries have each link of the data chain (intake test, treatment, retest and decision, outcome, value) and how complete each capture step is.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_data_quality', description: 'Missing or conflicting identities, fields and labels, with the battery labels affected.', parameters: { type: 'object', properties: {}, required: [] } },
  {
    name: 'find_batteries', description: 'List batteries, optionally filtered by lifecycle state. Returns label, model, state, last approved capacity as % of rated.',
    parameters: { type: 'object', properties: { state: { type: 'string', description: 'Lifecycle state, e.g. received, restoration_candidate, in_restoration, qualified, deployed, rejected, recycled' } }, required: [] },
  },
  {
    name: 'get_battery_history', description: 'One battery\'s record: lifecycle, tests, restoration attempts with decisions and reason codes, alerts, money in if visible.',
    parameters: { type: 'object', properties: { label: { type: 'string', description: 'Battery label such as B-0017' } }, required: ['label'] },
  },
  {
    name: 'compare_process_cohorts', description: 'Restoration outcomes by battery family and process version, with sample sizes and 95% intervals.',
    parameters: { type: 'object', properties: { period_days: { type: 'number', description: 'Only decisions in the last N days; omit for all time' } }, required: [] },
  },
  {
    name: 'calculate_route_economics', description: 'Revive versus recycle for one battery from recorded inputs; optionally override the sale price. Says which inputs are missing.',
    parameters: { type: 'object', properties: { label: { type: 'string', description: 'Battery label' }, sale_price_aed: { type: 'number', description: 'Optional sale price to try' } }, required: ['label'] },
  },
  { name: 'get_recovery_metrics', description: 'Retest pass rate, cost per qualified battery, contribution per battery, warranty claims, record completeness, recycling certificates.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_learning_loop', description: 'How many restoration attempts are eligible training rows, why others are excluded, and whether any model is trained.', parameters: { type: 'object', properties: {}, required: [] } },
];

const clip = (o: unknown, max = 3500) => {
  const s = JSON.stringify(o);
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
};

async function batteryId(svc: Services, label: unknown): Promise<string | null> {
  if (typeof label !== 'string' || !label.trim()) return null;
  const rows = await svc.batteries.list({ q: label.trim() });
  return rows.find((r) => r.label.toUpperCase() === label.trim().toUpperCase())?.id ?? null;
}

/** Runs one allowlisted tool. Unknown tools and bad arguments return an error the model can read, never throw. */
export async function runTool(svc: Services, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'get_collection_pipeline': {
        const c = await svc.insights.collection();
        // Say "recorded" and "missing" outright: a bare "45/49" was read the wrong way round by a small model.
        return clip({
          chain_batteries_with_every_link_so_far: c.chain.map((l) => ({ link: l.label, batteries: l.count })),
          steps: c.steps.map((s) => ({
            step: s.step, records_fully_complete: s.complete, records_in_step: s.applicable,
            fields_with_gaps: s.fields.filter((f) => f.present < s.applicable).map((f) => ({ field: f.field, recorded: f.present, missing: s.applicable - f.present })),
          })),
          held_for_review: c.held,
        });
      }
      case 'get_data_quality': {
        const r = await svc.insights.runAgent('data_steward');
        return clip({ findings: r.findings.map((f) => ({ text: f.text, batteries: f.citations.map((c) => c.label) })), missing: r.missing });
      }
      case 'find_batteries': {
        const rows = await svc.batteries.list(typeof args.state === 'string' && args.state ? { state: args.state as never } : {});
        return clip({ count: rows.length, batteries: rows.slice(0, 25).map((b) => ({ label: b.label, model: b.model, state: b.lifecycleState, capacity_pct_of_rated: b.lastApprovedTest?.pctOfRated ?? null })), shown: Math.min(25, rows.length) });
      }
      case 'get_battery_history': {
        const id = await batteryId(svc, args.label);
        if (!id) return clip({ error: `No battery "${String(args.label)}" that you can see.` });
        const p = await svc.batteries.get(id);
        return clip({
          label: p.battery.label, model: p.family.model, chemistry: p.family.chemistry, rated_ah: p.family.ratedCapacityAh, state: p.battery.lifecycleState,
          evidence: p.evidenceStatus.label, manufactured: p.battery.manufacturedOn,
          tests: p.tests.map((t) => ({ kind: t.kind, status: t.status, date: t.startedAt.slice(0, 10), capacity_ah: t.result.capacityAh, ir_mohm: t.result.internalResistanceMOhm })),
          attempts: p.attempts.map((a) => ({ no: a.attemptNo, batch: a.batchId, status: a.status, reason_code: a.decisionReasonCode })),
          open_alerts: p.alerts.filter((a) => a.state !== 'closed' && a.state !== 'resolved').map((a) => a.title),
          money_in: p.values === null ? 'not visible to your role' : p.values.map((v) => ({ kind: v.kind, aed: v.amountAed })),
          telemetry: p.telemetry.available ? { voltage: p.telemetry.voltageV, temperature_c: p.telemetry.temperatureC, freshness: p.telemetry.freshness, synthetic: true } : p.telemetry.reason,
        });
      }
      case 'compare_process_cohorts': {
        const days = typeof args.period_days === 'number' && args.period_days > 0 ? args.period_days : null;
        const r = await svc.insights.runAgent('recovery_analyst', { periodDays: days });
        return clip({ findings: r.findings.map((f) => f.text), caveats: r.missing });
      }
      case 'calculate_route_economics': {
        const id = await batteryId(svc, args.label);
        if (!id) return clip({ error: `No battery "${String(args.label)}" that you can see.` });
        const view = await svc.insights.routeInputs(id);
        const values = Object.fromEntries(Object.entries(view.fields).map(([k, f]) => [k, f.value])) as unknown as RouteInputs;
        if (typeof args.sale_price_aed === 'number') values.salePriceAed = args.sale_price_aed;
        const r = routeEconomics(values);
        return clip({ battery: view.batteryLabel, inputs: Object.fromEntries(Object.entries(view.fields).map(([k, f]) => [k, { value: k === 'salePriceAed' && typeof args.sale_price_aed === 'number' ? args.sale_price_aed : f.value, source: f.source }])), revive_aed: r.revive.value, recycle_aed: r.recycle.value, break_even_chance: r.breakEvenP, suggestion: r.suggestion, why: r.why, missing: r.missing });
      }
      case 'get_recovery_metrics':
        return clip(await svc.insights.recovery());
      case 'get_learning_loop': {
        const l = await svc.insights.learning();
        return clip({ stages: l.stages.map((s) => ({ label: s.label, count: s.count })), exclusions: l.exclusions, models: l.models });
      }
      default:
        return clip({ error: `Tool "${name}" does not exist. Use only the tools you were given.` });
    }
  } catch (e) {
    return clip({ error: (e as Error).message || 'The tool failed.' });
  }
}

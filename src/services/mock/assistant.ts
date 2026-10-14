import { can, isCustomerAudience } from '@/domain/permissions';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import {
  audit, canSeeBattery, db, evidenceStatus, familyOf, latency, authorize, ruleCheck, type Ctx,
} from '../core';
import type { AssistantCitation, AssistantDraft, AssistantResponse, AssistantService } from '../types';
import { createAlertRepository } from './alerts';
import { createReportRepository } from './reports';
import { telemetrySummaryFor } from './telemetry';

const SUGGESTIONS = [
  'Explain why this battery was flagged.',
  'Summarise the restoration history.',
  'Draft a service task.',
  'Prepare a warranty evidence summary.',
  'Which batteries need engineer review?',
];

/**
 * Deterministic mock assistant. No model, no network, no secrets.
 * It reads only through the same permission-checked data the UI uses, returns citations,
 * and can only create drafts. Confirmation is a separate explicit call.
 */
export function createAssistantService(ctx: Ctx): AssistantService {
  const drafts = new Map<string, AssistantDraft>();
  let n = 0;

  const refusal = (prompt: string, reason: string): AssistantResponse => ({
    id: `asst_${++n}`, prompt, answer: reason, citations: [], uncertainty: 'Not applicable: no records were read.',
    refused: true, refusalReason: reason, draft: null, scopeNote: scopeNote(),
  });
  function scopeNote() {
    const a = ctx.actor();
    return `Answers use only records visible to your role (${a.role.replace('_', ' ')}) and sites (${a.siteScope === 'all' ? 'all in tenant' : a.siteScope.join(', ')}). Synthetic data.`;
  }

  return {
    suggestions: () => SUGGESTIONS,

    async ask(prompt, context = {}) {
      await latency(ctx);
      const actor = authorize(ctx, 'assistant.use');
      const d = db(ctx);
      const p = prompt.trim();
      const lower = p.toLowerCase();
      audit(ctx, 'assistant.ask', 'assistant', `asst_${n + 1}`, `Prompt (${p.length} chars)`);
      ctx.store.save();

      // hard boundaries first
      if (p.length === 0) return refusal(prompt, 'Please type a question.');
      if (/\b(select|insert|update|delete|drop)\b.*\b(from|into|table|set)\b|\bsql\b|;\s*--/.test(lower)) {
        return refusal(prompt, 'I cannot run SQL or query the database directly. I can only read records through permission-checked service calls.');
      }
      if (/https?:\/\/|www\.|\bfetch\b.*\b(url|site|page|link)|\bbrowse\b|\bdownload\b/.test(lower)) {
        return refusal(prompt, 'I do not fetch arbitrary URLs or external pages. I can only use records in this workspace.');
      }
      if (/\b(set|change|adjust|control|switch|start|stop|enable|disable|trigger|run|open|close|disconnect|reconnect|reboot|restart|override)\b.*\b(charger|rectifier|sensor|gateway|inverter|breaker|equipment|setpoint|string|bank|discharge|charging|load)\b/.test(lower)) {
        return refusal(prompt, 'I never control sensors, chargers or any equipment. I can draft a service task for a person to review.');
      }
      if (/\b(approve|qualify|sign off|certify|reject)\b/.test(lower)) {
        return refusal(prompt, 'Approval and qualification are human engineering decisions. I can summarise the evidence for the reviewing engineer.');
      }
      if (/\bother (customer|tenant)|\btenant [ab]\b|\ball customers\b|\bacross customers\b|\bother sites?\b/.test(lower) && isCustomerAudience(actor.role)) {
        return refusal(prompt, 'I can only discuss records inside your own tenant and assigned sites.');
      }

      const battery = context.batteryId ? d.batteries.find((b) => b.id === context.batteryId) : null;
      if (context.batteryId && (!battery || !canSeeBattery(ctx, battery))) {
        return refusal(prompt, 'That battery is outside your access scope, so I cannot read it.');
      }

      const cite = (kind: string, id: string, label: string): AssistantCitation => ({ kind, id, label });
      const make = (answer: string, citations: AssistantCitation[], uncertainty: string, draft: AssistantDraft | null = null): AssistantResponse => ({
        id: `asst_${++n}`, prompt, answer, citations, uncertainty, refused: false, refusalReason: null, draft, scopeNote: scopeNote(),
      });
      const needBattery = () => refusal(prompt, 'Open a battery passport first, then ask again so I know which record to read.');

      if (/why.*flag|flagged|explain/.test(lower)) {
        if (!battery) return needBattery();
        const alerts = d.alerts.filter((a) => a.batteryId === battery.id && (!isCustomerAudience(actor.role) || a.source.kind !== 'model'));
        const preds = can(actor.role, 'prediction.read') ? d.predictions.filter((x) => x.batteryId === battery.id) : [];
        const tel = telemetrySummaryFor(ctx, battery);
        const cites = [cite('battery', battery.id, battery.label), ...alerts.map((a) => cite('alert', a.id, `${a.id} ${a.title}`)), ...preds.map((x) => cite('prediction', x.id, `${x.id} ${x.modelName} ${x.modelVersion}`))];
        if (alerts.length === 0 && preds.length === 0) {
          return make(`${battery.label} has no alerts or model flags on record. ${tel.available ? '' : tel.reason}`.trim(), cites, 'Absence of a flag is not evidence of good condition: telemetry coverage and test age matter.');
        }
        const lines = alerts.map((a) => `• ${a.id} (${a.severity}, ${a.state.replace('_', ' ')}): ${a.detail} Source: ${a.source.kind} ${a.source.name} ${a.source.version}.`);
        preds.forEach((x) => lines.push(`• ${x.id}: ${x.modelName} ${x.modelVersion} in shadow mode reports "${x.output.value}" (${x.uncertainty}).`));
        if (tel.available) lines.push(`• Latest measured: ${tel.voltageV} V, ${tel.temperatureC} °C${tel.freshness === 'stale' ? ' (stale)' : ''}.`);
        return make(`${battery.label} is flagged for these recorded reasons:\n${lines.join('\n')}`, cites,
          'Alerts from rules are deterministic comparisons to configured thresholds. Model flags are unvalidated shadow-mode outputs and may be wrong.');
      }

      if (/restoration|history|summar/.test(lower) && !/warranty/.test(lower)) {
        if (!battery) return needBattery();
        const fam = familyOf(ctx, battery);
        const tests = d.tests.filter((t) => t.batteryId === battery.id && (can(actor.role, 'test.create') || t.status === 'approved'));
        const attempts = can(actor.role, 'restoration.read') ? d.attempts.filter((a) => a.batteryId === battery.id) : [];
        const cites = [cite('battery', battery.id, battery.label), ...tests.map((t) => cite('test', t.id, `${t.kind} test, ${t.status}`)), ...attempts.map((a) => cite('attempt', a.id, `Attempt #${a.attemptNo}`))];
        const tl = tests.map((t) => `• ${(t.reviewedAt ?? t.startedAt).slice(0, 10)} ${t.kind} test (${t.status.replace('_', ' ')}): ${t.result.capacityAh === null ? 'no capacity value' : `${t.result.capacityAh} Ah = ${Math.round((t.result.capacityAh / fam.ratedCapacityAh) * 100)}% of rated ${fam.ratedCapacityAh} Ah`}.`);
        const al = attempts.map((a) => `• Attempt #${a.attemptNo} in ${a.batchId}: ${a.status.replace('_', ' ')}${a.decisionReason ? ` — ${a.decisionReason}` : ''}.`);
        const restricted = !can(actor.role, 'restoration.read') ? '\nRestoration process details are not available to your role.' : '';
        const body = [...tl, ...al].join('\n') || 'No tests or attempts are on record.';
        return make(`${battery.label} (${LIFECYCLE_LABELS[battery.lifecycleState]}), identity unchanged through every step:\n${body}${restricted}`, cites,
          'Percentages compare capacity to rated capacity under each test’s stated conditions. Tests under different conditions are not directly comparable.');
      }

      if (/service task|draft.*task|task/.test(lower)) {
        const alert = battery ? d.alerts.find((a) => a.batteryId === battery.id && ['open', 'acknowledged'].includes(a.state)) : null;
        const siteId = alert?.siteId ?? battery?.siteId ?? (actor.siteScope === 'all' ? d.sites[0].id : actor.siteScope[0]);
        const site = d.sites.find((s) => s.id === siteId)!;
        const title = alert ? `Follow up ${alert.id}: ${alert.title}` : battery ? `Inspect ${battery.label} at ${site.name}` : `Site check at ${site.name}`;
        const draft: AssistantDraft = {
          id: `draft_${++n}`, kind: 'service_task', title,
          body: `${alert ? alert.recommendedAction : 'Inspect and re-measure per site procedure.'} Draft prepared by the assistant for a person to review.`,
          payload: { title, description: alert ? alert.recommendedAction : 'Inspect and re-measure.', siteId, batteryId: battery?.id ?? null, alertId: alert?.id ?? null, priority: alert?.severity === 'critical' ? 'high' : 'normal' },
        };
        drafts.set(draft.id, draft);
        return make('I prepared a draft service task. It has not been created: review it, then confirm.', [cite('site', site.id, site.name), ...(alert ? [cite('alert', alert.id, alert.title)] : []), ...(battery ? [cite('battery', battery.id, battery.label)] : [])],
          'The recommended action comes from the alert rule text, not from a diagnosis.', draft);
      }

      if (/warranty/.test(lower)) {
        if (!can(actor.role, 'report.generate')) return refusal(prompt, 'Your role cannot generate reports.');
        const w = battery ? d.warranties.find((x) => x.batteryId === battery.id) : null;
        const draft: AssistantDraft = {
          id: `draft_${++n}`, kind: 'report', title: battery ? `Warranty evidence pack — ${battery.label}` : 'Warranty evidence pack — visible sites',
          body: 'A warranty evidence pack (draft) covering warranty terms, claims, original approved test and linked alerts. Generated as a draft; approval stays with an engineer.',
          payload: { templateId: 'warranty_pack', scopeId: battery?.siteId ?? null, from: '2026-01-01', to: ctx.store.now().slice(0, 10) },
        };
        drafts.set(draft.id, draft);
        const facts = w ? `Warranty record: ${w.state.replace('_', ' ')}, terms ${w.termsRef ?? 'not recorded'}, ${w.claims.length} claim(s).` : 'No warranty record found for the selected battery.';
        return make(`${facts}\nI prepared a draft evidence pack request. Nothing is generated or published until you confirm.`,
          [...(battery ? [cite('battery', battery.id, battery.label)] : []), ...(w ? [cite('warranty', w.id, w.termsRef ?? 'Warranty record')] : [])],
          'Unknown terms or dates are shown as unknown. A claim observation is not a confirmed cause.', draft);
      }

      if (/review|engineer|which batteries/.test(lower)) {
        const waiting = d.batteries.filter((b) => canSeeBattery(ctx, b) && b.lifecycleState === 'awaiting_review');
        const pending = d.tests.filter((t) => ['submitted', 'under_review'].includes(t.status) && t.batteryId && waiting.every((w) => w.id !== t.batteryId) && canSeeBattery(ctx, d.batteries.find((b) => b.id === t.batteryId)!));
        const lines = waiting.map((b) => {
          const att = d.attempts.filter((a) => a.batteryId === b.id).pop();
          const t = att?.afterTestId ? d.tests.find((x) => x.id === att.afterTestId) : null;
          return `• ${b.label}: awaiting qualification decision. Rule check: ${ruleCheck(t, familyOf(ctx, b)).label}. This is a rule result, not an approval.`;
        });
        pending.forEach((t) => lines.push(`• ${d.batteries.find((b) => b.id === t.batteryId)!.label}: ${t.kind} test is ${t.status.replace('_', ' ')}.`));
        const cites = [...waiting.map((b) => cite('battery', b.id, b.label)), ...pending.map((t) => cite('test', t.id, `${t.kind} test`))];
        return make(lines.length ? `${lines.length} item(s) need engineer attention:\n${lines.join('\n')}` : 'No batteries are waiting for engineer review in your scope.', cites,
          'Counts reflect the synthetic snapshot and your access scope only.');
      }

      const first = battery ? evidenceStatus(d, battery) : null;
      return make(
        `I can help with the example questions below. ${first ? `For ${battery!.label} the current evidence status is "${first.label}".` : ''}`,
        battery ? [cite('battery', battery.id, battery.label)] : [], 'I only answer from records in this workspace and never act without confirmation.',
      );
    },

    async confirmDraft(draftId) {
      await latency(ctx);
      authorize(ctx, 'assistant.use');
      const draft = drafts.get(draftId);
      if (!draft) throw new Error('Draft not found or already used.');
      // Creation goes through the ordinary repositories, so role and site permissions apply again.
      if (draft.kind === 'service_task') {
        const repo = createAlertRepository(ctx);
        const task = await repo.createTask(draft.payload as never);
        drafts.delete(draftId);
        audit(ctx, 'assistant.confirm', 'task', task.id, 'Draft confirmed by a person');
        ctx.store.save();
        return { kind: 'task', id: task.id, message: `Service task ${task.id} created.` };
      }
      const reports = createReportRepository(ctx);
      const report = await reports.generate(draft.payload as never);
      drafts.delete(draftId);
      audit(ctx, 'assistant.confirm', 'report', report.id, 'Draft confirmed by a person');
      ctx.store.save();
      return { kind: 'report', id: report.id, message: `Report ${report.id} generated as a draft awaiting approval.` };
    },
  };
}

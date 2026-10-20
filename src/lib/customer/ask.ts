import { TEMPERATURE_RULE } from '@/domain/limits';
import { STATUS_LABELS } from '@/domain/status';
import type { BatteryPassport } from '@/services/types';
import { buildChange, buildOutlook } from './change';
import { lastUpdated } from './model';

/**
 * A contextual Ask. It answers from the records on screen with fixed rules: no model, no network, nothing invented.
 * Each answer says what it used, and a question it cannot answer from the records is refused with the reason.
 */
export interface AskAnswer { answer: string; used: string[]; refused: boolean }

export const SITE_SUGGESTIONS = ['Which batteries need attention?', 'What changed?', 'When will batteries need replacing?'];
export const BATTERY_SUGGESTIONS = ['Why does this battery have this status?', 'What changed?', 'Is it too warm?', 'When will it need replacing?'];

const ok = (answer: string, used: string[]): AskAnswer => ({ answer, used, refused: false });
const no = (answer: string): AskAnswer => ({ answer, used: [], refused: true });

export function answer(question: string, fleet: BatteryPassport[], current: BatteryPassport | null): AskAnswer {
  const q = question.toLowerCase().trim();
  if (!q) return no('Type a question about your batteries.');
  if (/\b(set|change|adjust|control|switch|start|stop|turn|reduce)\b.*\b(charger|charging|discharge|load|inverter|limit|breaker|cooling|fan)\b/.test(q)) {
    return no('Nothing here controls equipment. I can only read your records. A maintenance request goes to a person.');
  }
  if (/\b(approve|certify|guarantee|promise)\b/.test(q)) return no('Approval and certification are engineers’ decisions. I can show the evidence a decision would use.');
  if (/\bother (customer|tenant)|\ball customers\b/.test(q)) return no('I can only discuss your own batteries and sites.');

  if (/replac|how long|life left|lifetime|when will|fail/.test(q)) {
    if (!current) {
      const need = fleet.filter((p) => p.status.status === 'attention');
      const now = need.length ? `${need.length} ${need.length === 1 ? 'battery needs' : 'batteries need'} attention now (${need.map((p) => p.battery.label).join(', ')}), which is a recorded condition, not a forecast.` : 'No battery needs attention now.';
      return ok(`No replacement window is estimated for any battery: no forecast model is validated yet. ${now}`, ['Status rule', 'Approved tests']);
    }
    const o = buildOutlook(current);
    return ok(`No replacement window is shown for ${current.battery.label}. ${o.reason} Known today: ${o.basedOn.join('; ').toLowerCase()}.`, o.basedOn);
  }

  if (/attention|worry|problem|issue|wrong|urgent|priority/.test(q) && !current) {
    const need = fleet.filter((p) => p.status.status === 'attention').sort((a, b) => a.status.urgency - b.status.urgency);
    if (!need.length) return ok('Nothing needs attention. Every battery with enough evidence is within range.', ['Status rule battery-status']);
    const lines = need.map((p) => `• ${p.battery.label}, ${p.location.siteName ?? 'not installed'}: ${p.status.headline} Next: ${p.status.nextStep}`);
    return ok(`${need.length} ${need.length === 1 ? 'battery needs' : 'batteries need'} attention:\n${lines.join('\n')}`, need.map((p) => p.battery.label));
  }

  if (/changed|change|since|new|different|improv/.test(q)) {
    if (current) {
      const c = buildChange(current);
      if (!c) return ok(`${current.battery.label} has fewer than two approved tests, so there is no before-and-after to show. Last record update: ${lastUpdated(current).slice(0, 10)}.`, ['Approved tests']);
      return ok(`Between the last two approved tests (${c.beforeAt.slice(0, 10)} and ${c.afterAt.slice(0, 10)}):\n${c.rows.map((r) => `• ${r.label}: ${r.before} → ${r.after}`).join('\n')}\n${c.note}`, ['Approved tests']);
    }
    const latest = [...fleet].sort((a, b) => lastUpdated(b).localeCompare(lastUpdated(a))).slice(0, 3);
    return ok(`The records changed most recently for ${latest.map((p) => `${p.battery.label} (${lastUpdated(p).slice(0, 10)})`).join(', ')}.`, latest.map((p) => p.battery.label));
  }

  if (current && /why|status|reason|health|condition|explain/.test(q)) {
    const lines = current.status.factors.map((f) => `• ${f.label}: ${f.detail}`);
    return ok(`${current.battery.label} is “${STATUS_LABELS[current.status.status]}”. ${current.status.headline}\n${lines.join('\n')}\nNext: ${current.status.nextStep}`, current.status.factors.map((f) => f.label));
  }

  if (current && /warm|hot|temperature|heat|cool/.test(q)) {
    const t = current.telemetry;
    if (!t.available || t.temperatureC === null) return ok(`No temperature reading is on record for ${current.battery.label}: ${t.reason || 'no sensor is attributed.'}`, ['Sensor attribution']);
    const state = t.temperatureC > TEMPERATURE_RULE.limitC ? 'above the limit' : t.temperatureC > TEMPERATURE_RULE.watchC ? 'above the preferred range' : 'within the preferred range';
    return ok(`${t.temperatureC.toFixed(1)} °C, ${state} (placeholder limits ${TEMPERATURE_RULE.watchC} and ${TEMPERATURE_RULE.limitC} °C). This is a simulated reading in this demonstration. Room temperature is not recorded by the sensor, so the difference cannot be shown.`, ['Simulated sensor reading']);
  }

  if (/recycl|lead|material/.test(q)) {
    const r = current?.recycling ?? fleet.find((p) => p.recycling)?.recycling;
    if (!r) return ok('No battery in these records has gone to recycling yet.', []);
    return ok(`Recycling: ${r.state}, ${r.recyclerName || 'recycler not recorded'}. Consigned mass ${r.massKg === null ? 'not recorded' : `${r.massKg} kg`}. Recovered weights by material are not in the records.`, ['Recycling record']);
  }

  return no(current
    ? `I can answer why ${current.battery.label} has its status, what changed, whether it is warm, and what is known about replacement. I can’t answer that from its records.`
    : 'I can answer which batteries need attention, what changed, and what is known about replacement. I can’t answer that from your records.');
}

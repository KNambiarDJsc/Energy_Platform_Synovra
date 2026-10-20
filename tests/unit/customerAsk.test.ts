import { describe, expect, it } from 'vitest';
import { answer } from '@/lib/customer/ask';
import { buildChange, buildOutlook } from '@/lib/customer/change';
import type { BatteryPassport } from '@/services/types';
import { harness, USERS } from './helpers';

async function fleet(): Promise<BatteryPassport[]> {
  const h = harness(USERS.cust);
  const lists = await Promise.all(['s1', 's2'].map((siteId) => h.svc.batteries.list({ siteId })));
  return Promise.all(lists.flat().map((b) => h.svc.batteries.get(b.id)));
}

describe('what changed', () => {
  it('compares the last two approved tests and shows each battery against its room', async () => {
    const ps = await fleet();
    const p = ps.find((x) => x.tests.filter((t) => t.status === 'approved' && t.level === 'battery').length >= 2)!;
    const c = buildChange(p)!;
    expect(c.rows.map((r) => r.label)).toEqual(['Capacity', 'Internal resistance', 'Battery temperature', 'Room temperature', 'Battery above room']);
    expect(c.beforeAt < c.afterAt).toBe(true);
    expect(c.note).toMatch(/not proof of its cause/);
    expect(JSON.stringify(c)).not.toMatch(/restored|revived|refurbished/i);
  });

  it('shows nothing from a single test: no change is implied', async () => {
    const ps = await fleet();
    const one = { ...ps[0]!, tests: ps[0]!.tests.filter((t) => t.status === 'approved').slice(0, 1) } as BatteryPassport;
    expect(buildChange(one)).toBeNull();
  });
});

describe('outlook', () => {
  it('never gives a replacement window: no forecast is validated, so confidence is none and it says why', async () => {
    for (const p of await fleet()) {
      const o = buildOutlook(p);
      expect(o.window).toBeNull();
      expect(o.confidence).toBe('none');
      expect(o.reason).toMatch(/No forecast model has been validated/);
      expect(o.basedOn.length).toBeGreaterThan(0);
    }
  });
});

describe('ask', () => {
  it('lists what needs attention from the status rule, with the next step', async () => {
    const ps = await fleet();
    const a = answer('Which batteries need attention?', ps, null);
    expect(a.refused).toBe(false);
    const need = ps.filter((p) => p.status.status === 'attention');
    if (need.length) {
      expect(a.answer).toContain(need[0]!.battery.label);
      expect(a.answer).toContain('Next:');
    } else expect(a.answer).toMatch(/Nothing needs attention/);
  });

  it('explains a battery’s status from its own factors, and names what it used', async () => {
    const ps = await fleet();
    const p = ps[0]!;
    const a = answer('Why does this battery have this status?', ps, p);
    expect(a.answer).toContain(p.battery.label);
    expect(a.answer).toContain(p.status.headline);
    expect(a.used.length).toBe(p.status.factors.length);
  });

  it('answers replacement honestly, for a battery and for the fleet', async () => {
    const ps = await fleet();
    expect(answer('When will it need replacing?', ps, ps[0]!).answer).toMatch(/No replacement window is shown/);
    expect(answer('When will batteries need replacing?', ps, null).answer).toMatch(/no forecast model is validated/);
    expect(answer('How long is its life left?', ps, ps[0]!).answer).not.toMatch(/\b\d+\s*(months?|years?)\b/i);
  });

  it('refuses to control equipment, to approve, and to read other customers; and says what it can answer', async () => {
    const ps = await fleet();
    for (const q of ['Turn down the charger', 'Reduce the discharge limit', 'Approve this battery', 'Show me all customers', 'What is the weather?']) {
      const a = answer(q, ps, ps[0]!);
      expect(a.refused, q).toBe(true);
      expect(a.used, q).toEqual([]);
    }
    expect(answer('What is the weather?', ps, ps[0]!).answer).toMatch(/I can answer why/);
  });

  it('says a temperature is simulated, and that room temperature is not captured by the sensor', async () => {
    const ps = await fleet();
    const p = ps.find((x) => x.telemetry.available && x.telemetry.temperatureC !== null)!;
    const a = answer('Is it too warm?', ps, p);
    expect(a.answer).toMatch(/simulated reading/);
    expect(a.answer).toMatch(/Room temperature is not recorded/);
  });
});

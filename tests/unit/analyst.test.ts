import { describe, expect, it } from 'vitest';
import { routeEconomics, type RouteInputs } from '@/domain/routeEconomics';
import { wilson } from '@/services/mock/insights';
import { harness, USERS } from './helpers';

const full: RouteInputs = {
  pSaleable: 0.8, cohortN: 40, salePriceAed: 400, recyclingValueAed: 60, treatmentCostAed: 90,
  reviveLogisticsAed: 20, recycleLogisticsAed: 15, warrantyAllowanceAed: 25, furtherTestCostAed: 30,
};

describe('route economics', () => {
  it('suggests nothing while an input is missing, and says which', () => {
    const r = routeEconomics({ ...full, salePriceAed: null });
    expect(r.suggestion).toBeNull();
    expect(r.missing).toEqual(['Sale price if saleable']);
    expect(r.revive.value).toBeNull();
  });

  it('adds up each route line by line and finds the break-even chance', () => {
    const r = routeEconomics(full);
    // 0.8·400 + 0.2·60 − 90 − 20 − 0.8·25 = 202 ; recycle = 60 − 15 = 45
    expect(r.revive.value).toBe(202);
    expect(r.recycle.value).toBe(45);
    expect(r.revive.lines.reduce((s, l) => s + l.aed, 0)).toBeCloseTo(202);
    expect(r.breakEvenP).toBeCloseTo((90 + 20 - 15) / (400 - 60 - 25));
    expect(r.suggestion).toBe('revive');
  });

  it('suggests another test when the evidence is thin or the call is close', () => {
    expect(routeEconomics({ ...full, cohortN: 4 }).suggestion).toBe('test');
    const p = (90 + 20 - 15) / (400 - 60 - 25);
    expect(routeEconomics({ ...full, pSaleable: p + 0.03 }).suggestion).toBe('test');
    expect(routeEconomics({ ...full, pSaleable: 0.1 }).suggestion).toBe('recycle');
  });

  it('gives honest intervals for small samples', () => {
    expect(wilson(5, 5)).toEqual([57, 100]);
    expect(wilson(0, 0)).toBeNull();
  });
});

describe('analyst', () => {
  it('routes each example question to one capability and shows the tools it called', async () => {
    const h = harness(USERS.eng);
    const cases: [string, string | null][] = [
      ['Which battery types had the best revival yield last month?', 'recovery_analyst'],
      ['What measurements are missing before we can compare these batches?', 'data_steward'],
      ['How did outcomes differ between batches?', 'recovery_analyst'],
      ['Should we revive or recycle B-0034?', 'recovery_decision'],
      ['Summarise the history of B-0017.', 'battery_investigator'],
      ['What is the weather tomorrow?', null],
    ];
    for (const [q, kind] of cases) {
      const a = await h.svc.insights.ask(q);
      expect(a.capability, q).toBe(kind);
      if (kind) expect(a.toolsCalled.length, q).toBeGreaterThan(0);
    }
    expect(h.store.db.audit.filter((e) => e.action === 'analyst.ask')).toHaveLength(cases.length);
  });

  it('compares cost with value for roles that may see money, and says plainly when the records cannot answer', async () => {
    const h = harness(USERS.fin);
    const loss = await h.svc.insights.ask('Show batteries where treatment cost exceeded the value recovered.');
    expect(loss.insufficient).toBe(false);
    expect(loss.lead).toMatch(/comparable batteries/);
    expect(loss.toolsCalled.map((t) => t.tool)).toEqual(['get_cost_lines', 'calculate_route_economics']);
    expect(loss.report?.missing.join(' ')).toMatch(/not allocated per battery/);

    h.as(USERS.eng);
    const hidden = await h.svc.insights.ask('Show batteries where treatment cost exceeded the value recovered.');
    expect(hidden).toMatchObject({ insufficient: true, report: null });

    const decide = await h.svc.insights.ask('Should we revive or recycle B-0034?');
    expect(decide.insufficient).toBe(true);
    expect(decide.toolsCalled.find((t) => t.tool === 'get_model_prediction')?.result).toMatch(/no validated model/);
    expect(decide.report?.missing.join(' ')).toMatch(/Sale price/);

    const noBattery = await h.svc.insights.ask('Should we revive this one?');
    expect(noBattery.insufficient).toBe(true);
    expect(noBattery.report).toBeNull();
  });

  it('prefills the route calculator from records, and hides costs from roles that may not see them', async () => {
    const h = harness(USERS.fin);
    const b = h.store.db.batteries.find((x) => x.label === 'B-0034')!;
    const fin = await h.svc.insights.routeInputs(b.id);
    expect(fin.fields.pSaleable.value).toBeGreaterThan(0);
    expect(fin.fields.pSaleable.source).toMatch(/decided .* attempts qualified/);
    expect(fin.fields.salePriceAed.value).toBeGreaterThan(0);
    expect(fin.fields.salePriceAed.source).toMatch(/recorded .* sales/);
    expect(fin.costsHidden).toBe(false);
    h.as(USERS.eng);
    const eng = await h.svc.insights.routeInputs(b.id);
    expect(eng.costsHidden).toBe(true);
    expect(eng.fields.treatmentCostAed).toMatchObject({ value: null, source: expect.stringMatching(/not shown to your role/) });
    expect(eng.sunkCostsAed).toBeNull();
  });
});

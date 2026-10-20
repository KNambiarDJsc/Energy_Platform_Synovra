import { describe, expect, it } from 'vitest';
import { STATUS_RULE } from '@/domain/status';
import { frameworkOf } from '@/lib/customer/frameworks';
import { buildIndicators, buildTimeline, computeCoverage, customerEvidence, customerName, hierarchyOf } from '@/lib/customer/model';
import { buildCustomerReport, reportToCsv, scenarioValueAed, valueSummary } from '@/lib/customer/report';
import type { BatteryPassport } from '@/services/types';
import { harness, USERS } from './helpers';

const NOW = '2026-10-13T05:00:00.000Z';
const PERIOD = { from: '2025-10-13', to: '2026-10-13' };

async function passportsFor(h: ReturnType<typeof harness>, siteIds: string[]): Promise<BatteryPassport[]> {
  const lists = await Promise.all(siteIds.map((siteId) => h.svc.batteries.list({ siteId })));
  return Promise.all(lists.flat().map((b) => h.svc.batteries.get(b.id)));
}

describe('customer demo: who sees which customers and sites', () => {
  it('a customer sees only their own customer’s sites; staff see every customer', async () => {
    const cust = harness(USERS.cust);
    const own = (await cust.svc.batteries.facets()).sites;
    expect(new Set(own.map((s) => s.tenantId))).toEqual(new Set(['t_custA']));
    const eng = harness(USERS.eng);
    const all = (await eng.svc.batteries.facets()).sites;
    expect(new Set(all.map((s) => s.tenantId))).toEqual(new Set(['t_custA', 't_custB']));
    expect(customerName('t_custA')).toMatch(/Demo/);
  });
});

describe('customer demo: indicators', () => {
  it('every indicator names its basis, scope, source and freshness, and none is a health score or a forecast', async () => {
    const h = harness(USERS.cust);
    const ps = await passportsFor(h, ['s1', 's2']);
    expect(ps.length).toBeGreaterThan(3);
    for (const p of ps) {
      const items = buildIndicators(p, NOW);
      for (const i of items) {
        expect(i.basis, i.key).toBeTruthy();
        expect(i.scope, i.key).toBeTruthy();
        expect(i.source, i.key).toBeTruthy();
        expect(['current', 'dated', 'none'], i.key).toContain(i.freshness);
        if (i.value === null) expect(i.absent, `${i.key} has no value, so it must say why`).toBeTruthy();
      }
      const life = items.find((i) => i.key === 'remaining_life')!;
      expect(life.value).toBeNull();
      expect(life.basis).toBe('predicted');
      expect(JSON.stringify(items)).not.toMatch(/health score:|health %|failure date:|years remaining/i);
    }
  });

  it('with no approved test there is a baseline, never a capacity; simulated telemetry is marked demo only', async () => {
    const h = harness(USERS.cust);
    const ps = await passportsFor(h, ['s1', 's2']);
    const none = ps.find((p) => !p.lastApprovedTest);
    if (none) {
      const cap = buildIndicators(none, NOW).find((i) => i.key === 'capacity')!;
      expect(cap.value).toBeNull();
      expect(cap.absent).toBe('baseline');
    }
    const withSensor = ps.find((p) => p.telemetry.available)!;
    const tel = buildIndicators(withSensor, NOW).filter((i) => ['voltage', 'temperature'].includes(i.key));
    expect(tel.length).toBeGreaterThan(0);
    for (const i of tel) expect(i.basis).toBe('demo_only');
    const tested = ps.find((p) => p.lastApprovedTest?.result.capacityAh != null)!;
    const items = buildIndicators(tested, NOW);
    expect(items.find((i) => i.key === 'capacity')!.basis).toBe('measured');
    expect(items.find((i) => i.key === 'capacity_pct')!.basis).toBe('calculated');
    expect(items.find((i) => i.key === 'condition')!.source).toContain(STATUS_RULE.name);
  });

  it('an old approved test is dated, not current', async () => {
    const h = harness(USERS.cust);
    const p = (await passportsFor(h, ['s1', 's2'])).find((x) => x.lastApprovedTest?.result.capacityAh != null)!;
    const aged = buildIndicators(p, '2030-01-01T00:00:00.000Z').find((i) => i.key === 'capacity')!;
    expect(aged.freshness).toBe('dated');
  });
});

describe('customer demo: what a customer never sees, whoever is looking', () => {
  it('the customer timeline hides process detail and internal evidence even when built from a staff passport', async () => {
    const h = harness(USERS.eng);
    const ps = await passportsFor(h, ['s1', 's2']);
    for (const p of ps) {
      const items = buildTimeline(p);
      const classOf = new Map<string, string>();
      for (const e of p.events as unknown as { evidence?: { id: string; classification: string }[] }[]) for (const f of e.evidence ?? []) classOf.set(f.id, f.classification);
      for (const f of p.evidence) classOf.set(f.id, f.classification);
      for (const it of items) for (const ev of it.evidence) expect(classOf.get(ev.id), `${ev.id} must be customer visible`).toBe('customer_visible');
      const text = JSON.stringify(items);
      for (const a of p.attempts) {
        for (const n of a.notes) expect(text).not.toContain(n.text);
        for (const l of a.lotRefs) expect(text).not.toContain(l.ref);
      }
      const approved = p.events.filter((e) => e.type === 'restoration' && e.approvalState === 'approved').length;
      expect(items.filter((i) => i.title === 'Service work completed')).toHaveLength(approved);
      expect(items.some((i) => /rework|reject|route|cost|margin|candidate/i.test(`${i.title} ${i.detail}`))).toBe(false);
      expect(items.some((i) => /restoration|qualif|qualified store/i.test(`${i.title} ${i.detail}`)), 'staff vocabulary stays out of the customer history').toBe(false);
      expect(customerEvidence(p.evidence).every((f) => f.classification === 'customer_visible')).toBe(true);
    }
  });

  it('a staff member and a customer get the same report for the same sites: nothing internal leaks into it either way', async () => {
    const eng = harness(USERS.eng);
    const cust = harness(USERS.cust);
    const common = { customerName: 'Demo Customer A', siteNames: ['Demo Site A', 'Demo Site B'], period: PERIOD, generatedAt: NOW, snapshotAt: NOW, framework: 'none' as const };
    const a = buildCustomerReport({ ...common, passports: await passportsFor(eng, ['s1', 's2']) });
    const b = buildCustomerReport({ ...common, passports: await passportsFor(cust, ['s1', 's2']) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(reportToCsv(b)).not.toMatch(/AED|internal note|lot ref|margin|recipe/i);
  });
});

describe('customer demo: the report', () => {
  const build = async (framework: 'none' | 'ghg' | 'esrs' = 'none') => {
    const h = harness(USERS.cust);
    return buildCustomerReport({ customerName: 'Demo Customer A', siteNames: ['Demo Site A'], period: PERIOD, generatedAt: NOW, snapshotAt: NOW, passports: await passportsFor(h, ['s1', 's2']), framework });
  };

  it('has every section the brief asks for, labelled synthetic and not a certificate', async () => {
    const r = await build();
    expect(r.sections.map((s) => s.id)).toEqual(['scope', 'inventory', 'operations', 'lifecycle', 'energy', 'social', 'governance']);
    expect(r.batteryCount).toBeGreaterThan(3);
    const scope = r.sections[0]!.tables[0]!.rows;
    expect(scope.find((x) => x[0] === 'Data label')![1]).toMatch(/Synthetic/);
    expect(r.limitations.join(' ')).toMatch(/not a compliance certificate/);
    expect(r.limitations.join(' ')).toMatch(/synthetic/i);
  });

  it('shows no emissions, saved-carbon or compliance claim, and lists the inputs it lacks', async () => {
    const r = await build();
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/tCO2|kgCO2|CO2e|ESG compliant|certified by|carbon saved|emissions avoided/i);
    const energy = r.sections.find((s) => s.id === 'energy')!;
    expect(energy.status).toBe('not_recorded');
    expect(energy.missing.join(' ')).toMatch(/emission factors with source and version/i);
    expect(energy.tables[0]!.rows.find((x) => x[0] === 'Emissions estimate')![1]).toBe('Not calculated');
    const life = r.sections.find((s) => s.id === 'lifecycle')!;
    expect(life.tables.flatMap((t) => t.rows).find((x) => x[0] === 'Recovered material by type (kg)')![1]).toBe('Not recorded');
  });

  it('framework pointers are configuration: they change the candidate areas, never invent a scope', async () => {
    const none = await build('none');
    expect(none.sections.every((s) => s.frameworkArea === null)).toBe(true);
    const ghg = await build('ghg');
    expect(ghg.sections.find((s) => s.id === 'energy')!.frameworkArea).toMatch(/boundary/);
    expect(JSON.stringify(ghg)).not.toMatch(/Scope [123]\b/);
    expect(frameworkOf('esrs').areas.energy).toMatch(/check the current text/i);
  });

  it('counts add up: coverage, inventory and the per-battery tables agree', async () => {
    const h = harness(USERS.cust);
    const ps = await passportsFor(h, ['s1', 's2']);
    const cov = computeCoverage(ps, NOW);
    expect(Object.values(cov.byStatus).reduce((a, b) => a + b, 0)).toBe(ps.length);
    expect(cov.withApprovedTest).toBeGreaterThanOrEqual(cov.testsCurrent);
    const r = await build();
    const inv = r.sections.find((s) => s.id === 'inventory')!;
    expect(inv.tables[0]!.rows.reduce((n, row) => n + Number(row[2]), 0)).toBe(ps.length);
    expect(inv.tables[1]!.rows).toHaveLength(ps.length);
    const csv = reportToCsv(r);
    expect(csv).toContain('Synthetic demonstration data');
    expect(csv.split('\n').length).toBeGreaterThan(40);
  });

  it('value summary is counts from the records, and the scenario is a clamped what-if', async () => {
    const h = harness(USERS.cust);
    const v = valueSummary(await passportsFor(h, ['s1', 's2']), NOW);
    expect(v.map((x) => x.label)).toEqual(['Fleet visibility', 'Traceable history', 'Planned maintenance', 'Replacement planning', 'Evidence for paperwork']);
    expect(JSON.stringify(v)).not.toMatch(/AED|saving|saved/i);
    expect(scenarioValueAed({ batteries: 4, priceAed: 1200, deferredPct: 25 })).toBe(1200);
    expect(scenarioValueAed({ batteries: 4, priceAed: 1200, deferredPct: 250 })).toBe(4800);
    expect(scenarioValueAed({ batteries: -1, priceAed: 1200, deferredPct: 25 })).toBe(0);
    expect(scenarioValueAed({ batteries: Number.NaN, priceAed: 1200, deferredPct: 25 })).toBe(0);
  });
});

describe('customer demo: hierarchy', () => {
  it('runs customer, site, system, bank/string, battery, and says when the system is not recorded', async () => {
    const h = harness(USERS.cust);
    const p = (await passportsFor(h, ['s1'])).find((x) => x.location.siteId)!;
    const levels = hierarchyOf(p, 'Demo Customer A', 'Rooftop cabinet site', 48);
    expect(levels.map((l) => l.level)).toEqual(['Customer', 'Site', 'System', 'Bank / string', 'Battery']);
    expect(levels[2]!.name).toMatch(/48 V DC power system/);
    expect(hierarchyOf(p, 'Demo Customer A', null, null)[2]!.name).toBe('Not recorded');
  });
});

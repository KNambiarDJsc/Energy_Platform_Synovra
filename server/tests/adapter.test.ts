/**
 * Contract test: the browser's HTTP adapter (src/services/http) against the real API routes,
 * in process. Every adapter method used by the UI must reach a route and get the expected shape,
 * and server errors must come back as the same domain error classes the UI handles.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SAMPLE_CSV } from '../../src/domain/csv';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/domain/permissions';
import { createHttpServices } from '../../src/services/http';
import { setToken } from '../../src/services/http/session';
import type { Services } from '../../src/services/types';
import { goodTest, startServer, USERS, type Server } from './helpers';

let server: Server;
let svc: Services;

async function signIn(userId: string) {
  const res = await server.raw('/api/v1/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
  await setToken(((await res.json()) as { token: string }).token);
}

beforeAll(async () => {
  server = await startServer();
  // Route the adapter's fetch calls into the in-process app.
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    return server.raw(url.pathname + url.search, init);
  });
  svc = createHttpServices();
  await signIn(USERS.lab);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await server?.close();
});

describe('HTTP adapter against the API', () => {
  it('covers the battery register, passport, lookup and identity actions', async () => {
    expect(svc.actor()).toMatchObject({ userId: 'u_lab1', role: 'lab_operator' });
    const list = await svc.batteries.list({ q: 'B-00' });
    expect(list.length).toBeGreaterThan(0);
    expect((await svc.batteries.facets()).manufacturers.length).toBeGreaterThan(0);
    expect((await svc.batteries.families()).length).toBeGreaterThan(0);
    const p = await svc.batteries.get(list[0].id);
    expect(p.battery.id).toBe(list[0].id);
    expect((await svc.batteries.lookupByPublicRef(list[0].publicRef)).status).toBe('active');
    const { battery } = await svc.batteries.create({ familyId: 'f1', manufacturerSerial: 'ADAPTER-0001', manufacturedOn: null, physicalLocation: 'Bay 1', legacyId: null, acquisitionCostAed: null });
    const reissued = await svc.batteries.reissueLabel(battery.id, 'Label damaged in handling');
    expect(reissued.retired).toBe(battery.publicRef);
    expect((await svc.batteries.exportCsv([battery.id])).csv).toContain(battery.label);
  });

  it('maps server errors back to domain error classes', async () => {
    await expect(svc.admin.users()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.batteries.create({ familyId: 'f1' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.alerts.acknowledge('x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('covers import, tests and restoration', async () => {
    const templates = await svc.imports.templates();
    const job = await svc.imports.preview({ fileName: 'intake.csv', text: svc.imports.sampleCsv(), templateId: templates[0].id });
    expect(SAMPLE_CSV).toBe(svc.imports.sampleCsv());
    expect((await svc.imports.commit(job.id)).status).toBe('committed');
    expect((await svc.imports.list()).length).toBeGreaterThan(0);

    const received = (await svc.batteries.list({ state: 'received' }))[0];
    const t = await svc.tests.create(goodTest(received.id));
    await svc.tests.submit(t.id);
    expect((await svc.tests.list({ status: 'submitted' })).some((x) => x.id === t.id)).toBe(true);
    expect((await svc.tests.protocols()).length).toBeGreaterThan(0);
    expect((await svc.tests.attachEvidence(t.id, 'bench.pdf', 12)).fileName).toBe('bench.pdf');
    await signIn(USERS.eng);
    await svc.tests.startReview(t.id);
    expect((await svc.tests.approve(t.id, 'Conditions per protocol')).status).toBe('approved');
    expect((await svc.tests.get(t.id)).rule.state).toBeDefined();

    const batches = await svc.restoration.batches();
    expect((await svc.restoration.batchResults(batches[0].id)).batch.id).toBe(batches[0].id);
    expect((await svc.restoration.attempts({ batchId: batches[0].id })).length).toBeGreaterThanOrEqual(0);
  });

  it('covers inventory, deployments, reports, admin and overview', async () => {
    expect((await svc.deployments.inventory()).byFamily.length).toBeGreaterThan(0);
    const sites = await svc.deployments.sites();
    const deployable = await svc.deployments.deployable();
    const slot = sites.flatMap((x) => x.strings).flatMap((st) => st.slots).find((sl) => !sl.battery)!;
    expect(deployable.length).toBeGreaterThan(0);
    expect((await svc.deployments.validate(deployable[0].id, slot.slot.id)).checks.length).toBeGreaterThan(0);

    const templates = await svc.reports.templates();
    const scopes = await svc.reports.scopes('data_completeness');
    const r = await svc.reports.generate({ templateId: 'data_completeness', scopeId: scopes[0].id, from: '2026-01-01', to: '2026-10-13', audience: 'internal' });
    expect(templates.length).toBeGreaterThan(0);
    expect((await svc.reports.approve(r.id)).approvalState).toBe('approved');
    expect((await svc.reports.get(r.id)).id).toBe(r.id);
    expect((await svc.reports.exportCsv(r.id)).csv).toContain(r.title);
    expect((await svc.reports.list()).some((x) => x.id === r.id)).toBe(true);

    expect((await svc.overview.get()).totals.batteries).toBeGreaterThan(0);
    expect((await svc.predictions.list()).length).toBeGreaterThan(0);
    expect((await svc.admin.audit()).length).toBeGreaterThan(0);
    expect((await svc.telemetry.summary('x')).available).toBe(false);
  });
});

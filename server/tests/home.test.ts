import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, USERS, type Server } from './helpers';

let server: Server;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server?.close(); });

describe('home and status over the API', () => {
  it('serves the calm home, consistent with the register', async () => {
    const eng = await server.as(USERS.eng);
    const home = await eng.get('/home');
    expect(home.status).toBe(200);
    const list = await eng.get<{ id: string; status: { code: string; headline: string } }[]>('/batteries');
    const count = (c: string) => list.body.filter((b) => b.status.code === c).length;
    expect(home.body.counts).toEqual({ good: count('good'), watching: count('watching'), attention: count('attention'), baseline: count('baseline') });
    expect(home.body.rule).toMatchObject({ name: 'battery-status', placeholder: true });
    for (const i of home.body.attention) expect(list.body.find((b) => b.id === i.id)?.status.code).toBe('attention');
  });

  it('scopes home to what the reader may see', async () => {
    const cust = await server.as(USERS.cust);
    const eng = await server.as(USERS.eng);
    const mine = await cust.get('/home');
    const all = await eng.get('/home');
    expect(mine.status).toBe(200);
    expect(mine.body.inFleet).toBeGreaterThan(0);
    expect(mine.body.inFleet).toBeLessThan(all.body.inFleet);
  });

  it('carries the full status reasoning on the passport', async () => {
    const eng = await server.as(USERS.eng);
    const list = await eng.get<{ id: string; label: string }[]>('/batteries');
    const id = list.body.find((b) => b.label === 'B-0002')!.id;
    const p = await eng.get(`/batteries/${id}/passport`);
    expect(p.body.status.factors.length).toBeGreaterThan(0);
    for (const f of p.body.status.factors) expect(['measured', 'calculated', 'rule']).toContain(f.kind);
  });

  it('refuses anonymous readers', async () => {
    expect((await server.raw('/api/v1/home')).status).toBe(401);
  });
});

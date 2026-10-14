import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, USERS, type Server } from './helpers';

let server: Server;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server?.close(); });

describe('server smoke', () => {
  it('loads the seed and serves the register', async () => {
    expect((await server.raw('/health')).status).toBe(200);
    const eng = await server.as(USERS.eng);
    const list = await eng.get<unknown[]>('/batteries');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(20);
  });
});

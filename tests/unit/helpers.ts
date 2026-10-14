import { createStore, type Store } from '@/data/store';
import { createServices, actorFromUser } from '@/services';
import type { Services } from '@/services/types';

export interface Harness {
  store: Store;
  svc: Services;
  as(userId: string): void;
}

export const USERS = {
  lab: 'u_lab1',
  lab2: 'u_lab2',
  eng: 'u_eng1',
  eng2: 'u_eng2',
  field1: 'u_field1',
  field2: 'u_field2',
  noc: 'u_noc',
  fin: 'u_fin',
  cust: 'u_cust',
  admin: 'u_admin',
} as const;

export function harness(initial: string = USERS.eng): Harness {
  const store = createStore({ persist: false, latencyMs: 0, now: () => Date.parse('2026-10-13T06:00:00.000Z') });
  let current = initial;
  const svc = createServices(store, () => actorFromUser(store, current));
  return { store, svc, as: (id) => { current = id; } };
}

export async function rejects(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error('Expected the promise to reject');
}

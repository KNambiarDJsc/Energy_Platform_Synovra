/**
 * Demo session. This stores *which demo user is acting* in the browser.
 * It is NOT authentication: the service layer enforces permissions for whichever user is acting,
 * and a real deployment replaces this with OIDC (see docs/API_ADAPTER.md).
 */
import { DATA_SOURCE } from '@/lib/runtime';
import { clearApiSession } from './http/session';

const KEY = 'synovra-demo-user';
let memory: string | null = null;
const listeners = new Set<() => void>();

export function getSessionUserId(): string | null {
  if (memory) return memory;
  try {
    if (typeof window !== 'undefined') memory = window.localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  return memory;
}

export function setSessionUserId(id: string | null) {
  // A different user (or sign-out) must never reuse the previous API token, and a failed sign-in can be retried.
  if (DATA_SOURCE === 'http' && id !== memory) clearApiSession();
  memory = id;
  try {
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function subscribeSession(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Default demo user for each role. */
export const DEMO_USER_FOR_ROLE: Record<string, string> = {
  lab_operator: 'u_lab1',
  battery_engineer: 'u_eng1',
  field_technician: 'u_field1',
  noc_manager: 'u_noc',
  finance_owner: 'u_fin',
  customer_auditor: 'u_cust',
  platform_admin: 'u_admin',
};

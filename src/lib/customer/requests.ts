'use client';
import { useSyncExternalStore } from 'react';

/**
 * Maintenance and replacement requests from the customer demo. They live in this browser only: no backend workflow
 * exists, so nothing is sent to Synovra or to a service team. Every request says so.
 */
export type RequestKind = 'maintenance' | 'replacement';
export type RequestWindow = 'as_soon_as_possible' | 'within_30_days' | 'next_planned_visit';

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = { maintenance: 'Maintenance request', replacement: 'Replacement plan' };
export const REQUEST_WINDOW_LABELS: Record<RequestWindow, string> = {
  as_soon_as_possible: 'As soon as possible', within_30_days: 'Within 30 days', next_planned_visit: 'At the next planned visit',
};

export interface DemoRequest {
  id: string;
  kind: RequestKind;
  batteryId: string;
  batteryLabel: string;
  siteId: string;
  siteName: string;
  window: RequestWindow;
  note: string;
  requestedByRole: string;
  createdAt: string;
  status: 'Recorded in this browser only (demo)';
}

const KEY = 'synovra-customer-demo-requests:v1';
const EVENT = 'synovra-demo-requests';
const EMPTY: DemoRequest[] = [];
let cache: { raw: string | null; value: DemoRequest[] } = { raw: null, value: EMPTY };

function read(): DemoRequest[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const value = Array.isArray(parsed) ? (parsed as DemoRequest[]) : EMPTY;
    cache = { raw, value };
    return value;
  } catch {
    return EMPTY;
  }
}

export function addDemoRequest(input: Omit<DemoRequest, 'id' | 'createdAt' | 'status'>): DemoRequest {
  const all = read();
  const next: DemoRequest = { ...input, id: `DEMO-${String(all.length + 1).padStart(3, '0')}`, createdAt: new Date().toISOString(), status: 'Recorded in this browser only (demo)' };
  try { window.localStorage.setItem(KEY, JSON.stringify([next, ...all])); } catch { /* private mode: the request still shows this session */ cache = { raw: null, value: [next, ...all] }; }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function clearDemoRequests() {
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  cache = { raw: null, value: EMPTY };
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', fn); };
};

export function useDemoRequests(): DemoRequest[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

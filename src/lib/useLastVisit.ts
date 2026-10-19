import { useEffect, useState } from 'react';

/**
 * What this viewer saw last time on this device, and records what they see now. Remembering a visit is a
 * convenience: when storage is blocked or empty, the caller simply shows a first visit.
 */
export function useLastVisit<T extends object>(key: string | null, current: T): (T & { at: string }) | null {
  const [previous] = useState<(T & { at: string }) | null>(() => {
    if (!key || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T & { at: string }) : null;
    } catch {
      return null;
    }
  });
  // Written whenever what is on screen changes, stamped with the time it was seen.
  const seen = JSON.stringify(current);
  useEffect(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...(JSON.parse(seen) as T), at: new Date().toISOString() }));
    } catch {
      /* storage blocked: the next visit shows as a first visit */
    }
  }, [key, seen]);
  return previous;
}

/** "a moment ago", "40 minutes ago", "5 hours ago", then the date. */
export function since(iso: string, formatDate: (iso: string) => string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return 'a moment ago';
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hours ago`;
  return formatDate(iso);
}

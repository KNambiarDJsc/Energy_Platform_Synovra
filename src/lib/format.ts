import clsx, { type ClassValue } from 'clsx';

export const cn = (...v: ClassValue[]) => clsx(v);

const TZ = 'Asia/Dubai';

/** "13 Oct 2026, 09:00 GST". All timestamps are shown in Gulf Standard Time with the zone named. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date}, ${time} GST`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-GB', { timeZone: iso.length === 10 ? 'UTC' : TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short' }).format(new Date(iso));
}

export function formatNumber(n: number | null | undefined, digits = 0, unit = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'Unknown';
  const s = new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  return unit ? `${s} ${unit}` : s;
}

/** Money is always AED. Null means unknown and is never rendered as zero. */
export function formatAed(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Unknown';
  return `AED ${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n)}`;
}

export function relativeTo(iso: string, referenceIso: string): string {
  const ms = Date.parse(referenceIso) - Date.parse(iso);
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min before`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h before`;
  return `${Math.round(h / 24)} d before`;
}

export function titleCase(s: string): string {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function downloadText(fileName: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

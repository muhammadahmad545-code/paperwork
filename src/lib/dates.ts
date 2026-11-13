import type { DateKind } from './extract';

export const KIND_LABELS: Record<DateKind, string> = {
  expiry: 'Expires',
  due: 'Due',
  warranty: 'Warranty ends',
  issued: 'Issued',
  other: 'Date',
};

export function daysUntil(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function formatIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days} days ago`;
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months < 24 ? `in ${months} months` : `in ${Math.round(days / 365)} years`;
}

export function tone(days: number): 'danger' | 'warning' | 'textMuted' {
  if (days < 0) return 'danger';
  if (days <= 14) return 'warning';
  return 'textMuted';
}

/** Local midnight-based date at 9:00 for an ISO day, minus `daysBefore`. */
export function reminderTime(iso: string, daysBefore: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d - daysBefore, 9, 0, 0);
}

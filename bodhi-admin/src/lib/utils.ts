import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/**
 * Formats money as ₹1,23,456.78.
 * Ledger and payment amounts are stored in paise – pass `'paise'` for those.
 */
export function formatCurrency(amount: number | null | undefined, unit: 'inr' | 'paise' = 'inr'): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return inr.format(0);
  return inr.format(unit === 'paise' ? value / 100 : value);
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Indian short form: ₹4.2 L, ₹1.3 Cr. Use for headline figures, not ledgers. */
export function formatCompactINR(amount: number | null | undefined, unit: 'inr' | 'paise' = 'inr'): string {
  const raw = Number(amount ?? 0);
  const value = unit === 'paise' ? raw / 100 : raw;
  if (!Number.isFinite(value)) return '₹0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  return `${sign}${inr.format(abs).replace(/\.00$/, '')}`;
}

const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

/** "3 min ago", "yesterday", falls back to a date after a week. */
export function formatRelative(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  if (Number.isNaN(diff)) return '—';
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Ledger reference types come through as e.g. "P2P_TRANSFER" – show "P2P transfer". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/[_-]+/g, ' ').toLowerCase().trim();
  return s.replace(/\bp2p\b/g, 'P2P').replace(/\bupi\b/g, 'UPI').replace(/\bamo\b/g, 'AMO').replace(/^./, (c) => c.toUpperCase());
}

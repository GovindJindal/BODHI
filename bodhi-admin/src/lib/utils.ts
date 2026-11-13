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

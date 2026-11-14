'use client';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Page chrome ─────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
      <div className="max-w-2xl">
        <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Remove body padding (tables run edge to edge). */
  flush?: boolean;
}) {
  return (
    <section className={cn('bg-surface border border-line rounded-xl shadow-panel overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/* ── Controls ────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-leaf text-on-leaf hover:bg-leaf-strong border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'text-muted hover:text-ink hover:bg-sunken border border-transparent',
  danger: 'bg-surface text-madder border border-line-strong hover:bg-madder-soft hover:border-madder/40',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden />}
      {children}
    </button>
  );
}

const fieldBase =
  'w-full bg-sunken border border-line rounded-lg px-3 text-[14px] text-ink placeholder:text-faint outline-none transition-colors focus:border-leaf focus:bg-surface';

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  },
);

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'py-2.5 leading-relaxed resize-y min-h-28', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-10 pr-8 cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

/** Segmented control for small, mutually exclusive filters. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 bg-sunken border border-line rounded-lg">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 px-3 text-[13px] rounded-md transition-colors',
            value === o.value ? 'bg-surface text-ink font-medium shadow-panel' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Status & identity ───────────────────────────────────────────────────── */

export type Tone = 'leaf' | 'madder' | 'turmeric' | 'sky' | 'neutral';

const toneStyles: Record<Tone, string> = {
  leaf: 'bg-leaf-soft text-leaf',
  madder: 'bg-madder-soft text-madder',
  turmeric: 'bg-turmeric-soft text-turmeric',
  sky: 'bg-sky-soft text-sky',
  neutral: 'bg-sunken text-muted',
};

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap', toneStyles[tone])}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const roleLabels: Record<string, { label: string; tone: Tone }> = {
  super_admin: { label: 'Super admin', tone: 'turmeric' },
  admin: { label: 'Admin', tone: 'sky' },
  support: { label: 'Support', tone: 'sky' },
  user: { label: 'Member', tone: 'neutral' },
};

export function RoleBadge({ role }: { role: string }) {
  const r = roleLabels[role] ?? { label: role, tone: 'neutral' as Tone };
  return <Badge tone={r.tone}>{r.label}</Badge>;
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="leaf" dot>Active</Badge> : <Badge tone="madder" dot>Suspended</Badge>;
}

export function Avatar({ name, size = 32 }: { name?: string | null; size?: number }) {
  const initials = (name || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf font-semibold"
    >
      {initials || '?'}
    </span>
  );
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[14px]">{children}</table>
    </div>
  );
}

export function Th({ children, align = 'left', className }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-5 h-10 bg-sunken/60 border-b border-line text-[12px] font-medium text-muted whitespace-nowrap',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', className }: { children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={cn('px-5 py-3 border-b border-line align-middle', align === 'right' && 'text-right', className)}>{children}</td>;
}

export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-5 py-4 border-b border-line">
              <div className="skeleton h-3.5" style={{ width: `${45 + ((r * 7 + c * 13) % 45)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ── Empty & error states ────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <span className="w-10 h-10 rounded-full bg-sunken text-muted flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="text-[13px] text-muted mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'leaf' | 'madder' | 'turmeric'; children: React.ReactNode }) {
  return (
    <div role={tone === 'madder' ? 'alert' : 'status'} className={cn('rounded-lg px-4 py-3 text-[14px] leading-relaxed', toneStyles[tone])}>
      {children}
    </div>
  );
}

/* ── Money ───────────────────────────────────────────────────────────────── */

export function Money({ value, signed, className }: { value: string; signed?: 'credit' | 'debit'; className?: string }) {
  return (
    <span className={cn('font-medium whitespace-nowrap', signed === 'credit' && 'text-leaf', signed === 'debit' && 'text-madder', className)}>
      {signed === 'credit' ? '+' : signed === 'debit' ? '−' : ''}
      {value}
    </span>
  );
}

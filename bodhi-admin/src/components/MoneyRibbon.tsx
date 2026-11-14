'use client';
import React, { useMemo, useState } from 'react';
import { cn, formatCurrency, formatRelative, humanize } from '@/lib/utils';

export type LedgerItem = {
  id: string;
  user_id?: string;
  user_name?: string | null;
  type: string;
  amount: number;
  ref: string;
  reference_id?: string;
  status: string;
  description?: string | null;
  time: string;
};

/**
 * Each ledger entry is one tick on a shared baseline: credits rise in leaf green,
 * debits hang in madder. Height follows the square root of the amount so a single
 * large top-up doesn't flatten everything else. Oldest on the left.
 */
export function MoneyRibbon({ items }: { items: LedgerItem[] }) {
  const ordered = useMemo(() => [...items].reverse(), [items]);
  const [active, setActive] = useState<number | null>(null);

  const H = 160; // svg height
  const mid = H / 2;
  const gap = 2;
  const w = 6;
  const width = Math.max(ordered.length * (w + gap), 1);
  const max = Math.max(1, ...ordered.map((i) => Math.sqrt(Math.abs(i.amount))));

  const shown = active !== null ? ordered[active] : ordered[ordered.length - 1];

  return (
    <div>
      <div className="relative" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${width} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-40 block"
          role="img"
          aria-label={`Last ${ordered.length} ledger entries, credits above the line and debits below`}
        >
          <line x1="0" x2={width} y1={mid} y2={mid} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {ordered.map((item, i) => {
            const credit = item.type === 'CREDIT';
            const h = Math.max(3, (Math.sqrt(Math.abs(item.amount)) / max) * (mid - 6));
            const x = i * (w + gap);
            const dim = active !== null && active !== i;
            return (
              <g key={item.id} onMouseEnter={() => setActive(i)}>
                {/* wide invisible hit area */}
                <rect x={x - gap / 2} y={0} width={w + gap} height={H} fill="transparent" />
                <rect
                  className={cn('tick', credit ? 'tick-up' : 'tick-down')}
                  style={{ animationDelay: `${Math.min(i * 6, 600)}ms`, opacity: dim ? 0.35 : 1, transition: 'opacity 120ms' }}
                  x={x}
                  y={credit ? mid - h : mid}
                  width={w}
                  height={h}
                  rx={1.5}
                  fill={credit ? 'var(--leaf)' : 'var(--madder)'}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Readout for the hovered (or latest) entry */}
      <div className="mt-3 min-h-[44px] flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px]" aria-live="polite">
        {shown ? (
          <>
            <span className={cn('font-semibold text-[16px] whitespace-nowrap', shown.type === 'CREDIT' ? 'text-leaf' : 'text-madder')}>
              {shown.type === 'CREDIT' ? '+' : '−'}
              {formatCurrency(shown.amount, 'paise')}
            </span>
            <span className="text-ink">{shown.user_name || 'Unknown member'}</span>
            <span className="text-muted">{shown.description || humanize(shown.ref)}</span>
            <span className="text-faint">{formatRelative(shown.time)}</span>
            {active === null && <span className="text-faint ml-auto hidden sm:inline">Latest entry. Point at a bar to inspect it.</span>}
          </>
        ) : (
          <span className="text-muted">No ledger entries yet.</span>
        )}
      </div>
    </div>
  );
}

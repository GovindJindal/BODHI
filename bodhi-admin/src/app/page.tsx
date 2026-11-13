'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ReceiptIndianRupee, RefreshCw, WifiOff } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { formatCompactINR, formatCurrency, formatRelative, humanize, cn } from '@/lib/utils';
import { Button, EmptyState, Money, PageHeader, Panel } from '@/components/ui';
import { MoneyRibbon, type LedgerItem } from '@/components/MoneyRibbon';

type Stats = {
  users?: { total?: number; active_24h?: number };
  financials?: { ledger_volume_paise?: number; success_volume_paise?: number; failed_payments_count?: number };
  features?: { venture_clubs?: number; active_trips?: number };
};

type SystemStatus = {
  database: { ok: boolean; latency_ms: number };
  integrations: { key: string; name: string; configured: boolean }[];
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const stats = useApi<Stats>('/stats');
  const ledger = useApi<LedgerItem[]>('/ledger', { limit: 120 });
  const system = useApi<SystemStatus>('/system');
  const reloadAll = () => {
    stats.reload();
    ledger.reload();
    system.reload();
  };

  const items = useMemo(() => ledger.data ?? [], [ledger.data]);
  const flow = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const i of items) {
      if (i.type === 'CREDIT') inflow += i.amount;
      else outflow += i.amount;
    }
    return { inflow, outflow };
  }, [items]);

  const s = stats.data;
  const failed = s?.financials?.failed_payments_count ?? 0;
  const missing = (system.data?.integrations ?? []).filter((i) => !i.configured);

  if (stats.error && ledger.error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Panel>
          <EmptyState
            icon={WifiOff}
            title="The BODHI API isn't responding"
            description={stats.error}
            action={<Button icon={RefreshCw} onClick={reloadAll}>Try again</Button>}
          />
        </Panel>
      </>
    );
  }

  const figures: { label: string; value: string; note: string; alert?: boolean }[] = [
    { label: 'Members', value: (s?.users?.total ?? 0).toLocaleString('en-IN'), note: `${s?.users?.active_24h ?? 0} active in the last day` },
    { label: 'Ledger volume', value: formatCompactINR(s?.financials?.ledger_volume_paise, 'paise'), note: 'All credits and debits' },
    { label: 'Top-ups received', value: formatCompactINR(s?.financials?.success_volume_paise, 'paise'), note: 'Successful Razorpay payments' },
    { label: 'Failed payments', value: failed.toLocaleString('en-IN'), note: failed ? 'Review them in the ledger' : 'None recorded', alert: failed > 0 },
    { label: 'Trips', value: (s?.features?.active_trips ?? 0).toLocaleString('en-IN'), note: 'Shared trip wallets' },
    { label: 'Investment clubs', value: (s?.features?.venture_clubs ?? 0).toLocaleString('en-IN'), note: 'Group portfolios' },
  ];

  return (
    <>
      <PageHeader
        title={greeting()}
        description="Here is how money is moving through BODHI right now."
        actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={reloadAll}>Refresh</Button>}
      />

      {/* Hero: the ledger itself */}
      <Panel className="mb-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          <div className="lg:w-52 shrink-0">
            <h2 className="text-[15px] font-semibold">Money movement</h2>
            <p className="text-[13px] text-muted mt-1 leading-relaxed">
              The last {items.length || 120} ledger entries, oldest to newest. Credits rise, debits fall.
            </p>
            <dl className="mt-5 grid grid-cols-2 lg:grid-cols-1 gap-3">
              <div>
                <dt className="text-[13px] text-muted">Money in</dt>
                <dd className="text-[22px] font-semibold text-leaf">{formatCompactINR(flow.inflow, 'paise')}</dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted">Money out</dt>
                <dd className="text-[22px] font-semibold text-madder">{formatCompactINR(flow.outflow, 'paise')}</dd>
              </div>
            </dl>
          </div>
          <div className="flex-1 min-w-0">
            {ledger.loading && !ledger.data ? (
              <div className="skeleton h-40" />
            ) : items.length ? (
              <MoneyRibbon items={items} />
            ) : (
              <EmptyState icon={ReceiptIndianRupee} title="No money has moved yet" description="Transfers, top-ups and club contributions will appear here as they happen." />
            )}
          </div>
        </div>
      </Panel>

      {/* Key figures: one divided panel */}
      <section
        aria-label="Key figures"
        className="bg-surface border border-line rounded-xl shadow-panel grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-clip-padding mb-6 overflow-hidden"
        style={{ backgroundColor: 'var(--line)' }}
      >
        {figures.map((f) => (
          <div key={f.label} className="bg-surface px-5 py-4">
            <p className="text-[13px] text-muted">{f.label}</p>
            {stats.loading && !s ? (
              <div className="skeleton h-7 w-20 mt-1.5" />
            ) : (
              <p className={cn('text-[24px] leading-tight font-semibold mt-1', f.alert && 'text-madder')}>{f.value}</p>
            )}
            <p className="text-[12px] text-faint mt-1">{f.note}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
        <Panel
          title="Recent entries"
          flush
          actions={<Link href="/ledger" className="text-[13px] font-medium text-leaf hover:underline">Open ledger</Link>}
        >
          {items.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-muted">{ledger.loading ? 'Loading…' : 'No entries yet.'}</p>
          ) : (
            <ul>
              {items.slice(0, 7).map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-3 border-b border-line last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-ink truncate">{item.user_name || 'Unknown member'}</p>
                    <p className="text-[12px] text-muted truncate">{item.description || humanize(item.ref)}</p>
                  </div>
                  <span className="hidden sm:inline text-[12px] text-faint whitespace-nowrap">{formatRelative(item.time)}</span>
                  <Money value={formatCurrency(item.amount, 'paise')} signed={item.type === 'CREDIT' ? 'credit' : 'debit'} className="w-28 text-right" />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Needs attention" flush>
          <ul>
            {failed > 0 && (
              <AttentionRow
                tone="madder"
                title={`${failed} failed payment${failed === 1 ? '' : 's'}`}
                detail="A member may have paid without receiving a wallet credit."
                href="/ledger"
              />
            )}
            {missing.map((m) => (
              <AttentionRow key={m.key} tone="turmeric" title={`${m.name} isn't set up`} detail="Members will see an error when they use it." href="/system" />
            ))}
            {system.data && failed === 0 && missing.length === 0 && (
              <li className="flex items-start gap-3 px-5 py-4">
                <CheckCircle2 className="w-5 h-5 text-leaf shrink-0 mt-0.5" aria-hidden />
                <p className="text-[14px]">Nothing needs attention. Payments are succeeding and every integration is set up.</p>
              </li>
            )}
            {system.loading && !system.data && (
              <li className="px-5 py-4">
                <div className="skeleton h-4 w-2/3" />
              </li>
            )}
            {system.error && <li className="px-5 py-4 text-[14px] text-muted">System status is unavailable. {system.error}</li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function AttentionRow({ tone, title, detail, href }: { tone: 'madder' | 'turmeric'; title: string; detail: string; href: string }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-sunken">
        <AlertTriangle className={cn('w-[18px] h-[18px] shrink-0 mt-0.5', tone === 'madder' ? 'text-madder' : 'text-turmeric')} aria-hidden />
        <span>
          <span className="block text-[14px] font-medium text-ink">{title}</span>
          <span className="block text-[13px] text-muted">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

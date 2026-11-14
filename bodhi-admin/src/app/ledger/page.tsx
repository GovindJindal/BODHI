'use client';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ReceiptIndianRupee, Copy, Check } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { formatCurrency, formatDate, humanize } from '@/lib/utils';
import { Badge, Button, EmptyState, Money, PageHeader, Panel, Segmented, SkeletonRows, Table, Td, Th, type Tone } from '@/components/ui';
import type { LedgerItem } from '@/components/MoneyRibbon';

const PAGE_SIZE = 50;
type TypeFilter = 'all' | 'CREDIT' | 'DEBIT';

const statusTone: Record<string, Tone> = {
  SUCCESS: 'leaf',
  PENDING: 'turmeric',
  PARTIAL: 'turmeric',
  FAILED: 'madder',
  CANCELLED: 'neutral',
};

export default function LedgerPage() {
  const [type, setType] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<LedgerItem[]>('/ledger', {
    page,
    limit: PAGE_SIZE,
    entry_type: type === 'all' ? undefined : type,
  });
  const rows = data ?? [];
  const hasNext = rows.length === PAGE_SIZE;

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Every credit and debit on member wallets, newest first. Amounts are exact to the paisa."
      />

      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <Segmented<TypeFilter>
            label="Entry type"
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All entries' },
              { value: 'CREDIT', label: 'Credits' },
              { value: 'DEBIT', label: 'Debits' },
            ]}
          />
          <span className="text-[13px] text-muted">Page {page}</span>
        </div>

        {error ? (
          <EmptyState icon={ReceiptIndianRupee} title="The ledger couldn't be loaded" description={error} action={<Button onClick={reload}>Try again</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Member</Th>
                <Th>What</Th>
                <Th>Reference</Th>
                <Th>Status</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows rows={10} cols={6} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={ReceiptIndianRupee} title="No entries here" description={type === 'all' ? 'Wallet movements appear as members transfer, top up and contribute.' : 'Try showing all entries.'} />
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="hover:bg-sunken/70">
                    <Td className="whitespace-nowrap text-muted">{formatDate(item.time)}</Td>
                    <Td className="max-w-[14rem] truncate">{item.user_name || <span className="text-faint">Unknown</span>}</Td>
                    <Td>
                      <span className="block">{humanize(item.ref)}</span>
                      {item.description && <span className="block text-[12px] text-muted truncate max-w-[18rem]">{item.description}</span>}
                    </Td>
                    <Td><RefCell value={item.reference_id || item.id} /></Td>
                    <Td><Badge tone={statusTone[item.status] ?? 'neutral'}>{humanize(item.status)}</Badge></Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Money value={formatCurrency(item.amount, 'paise')} signed={item.type === 'CREDIT' ? 'credit' : 'debit'} />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <Button size="sm" icon={ChevronLeft} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <Button size="sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>
            Older <ChevronRight className="w-3.5 h-3.5" aria-hidden />
          </Button>
        </div>
      </Panel>
    </>
  );
}

/** Shortened reference with copy-to-clipboard, so support can paste it into a search. */
function RefCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="group inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      title={`Copy ${value}`}
      aria-label={copied ? 'Reference copied' : `Copy reference ${value}`}
    >
      {value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}
      {copied ? <Check className="w-3.5 h-3.5 text-leaf" aria-hidden /> : <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
    </button>
  );
}

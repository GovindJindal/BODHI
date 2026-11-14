'use client';
import React from 'react';
import { Briefcase } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { formatCompactINR, formatCurrency, formatRelative, cn } from '@/lib/utils';
import { Badge, Button, EmptyState, PageHeader, Panel, SkeletonRows, Table, Td, Th } from '@/components/ui';

type Club = {
  id: number;
  name: string;
  emoji: string | null;
  status: string;
  members: number;
  total_invested: number;
  cash: number;
  value: number;
  created_by: string | null;
  created_at: string;
};

export default function ClubsPage() {
  const { data, loading, error, reload } = useApi<Club[]>('/clubs', { limit: 200 });
  const clubs = data ?? [];
  const pooled = clubs.reduce((s, c) => s + (c.total_invested || 0), 0);

  return (
    <>
      <PageHeader
        title="Investment clubs"
        description="Groups that pool money from their wallets and vote on paper trades together."
      />

      {clubs.length > 0 && (
        <p className="mb-4 text-[15px] text-muted">
          <span className="text-ink font-medium">{clubs.length}</span> clubs have pooled{' '}
          <span className="text-ink font-medium">{formatCompactINR(pooled)}</span> from member wallets.
        </p>
      )}

      <Panel flush>
        {error ? (
          <EmptyState icon={Briefcase} title="Clubs couldn't be loaded" description={error} action={<Button onClick={reload}>Try again</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Club</Th>
                <Th>Status</Th>
                <Th align="right">Members</Th>
                <Th align="right">Contributed</Th>
                <Th align="right">Uninvested cash</Th>
                <Th align="right">Holdings value</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows rows={6} cols={6} />
              ) : clubs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Briefcase} title="No clubs yet" description="Clubs appear here when a member starts one from the Social tab in the app." />
                  </td>
                </tr>
              ) : (
                clubs.map((c) => {
                  const cashShare = c.total_invested > 0 ? Math.min(100, (c.cash / c.total_invested) * 100) : 0;
                  return (
                    <tr key={c.id} className="hover:bg-sunken/70">
                      <Td>
                        <span className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-lg bg-sunken flex items-center justify-center text-[18px]" aria-hidden>{c.emoji || '📈'}</span>
                          <span>
                            <span className="block font-medium">{c.name}</span>
                            <span className="block text-[12px] text-muted">
                              {c.created_by ? `Started by ${c.created_by}` : 'Founder unknown'}, {formatRelative(c.created_at)}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={c.status === 'active' ? 'leaf' : 'neutral'}>{c.status === 'active' ? 'Active' : 'Closed'}</Badge>
                      </Td>
                      <Td align="right" >{c.members}</Td>
                      <Td align="right" className="font-medium">{formatCurrency(c.total_invested)}</Td>
                      <Td align="right">
                        <span >{formatCurrency(c.cash)}</span>
                        {c.total_invested > 0 && (
                          <span className="mt-1 ml-auto block h-1 w-20 rounded-full bg-sunken overflow-hidden" title={`${cashShare.toFixed(0)}% still in cash`}>
                            <span className={cn('block h-full bg-turmeric')} style={{ width: `${cashShare}%` }} />
                          </span>
                        )}
                      </Td>
                      <Td align="right" >{formatCurrency(c.value)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

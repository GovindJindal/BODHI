'use client';
import React from 'react';
import { Plane } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { formatCompactINR, formatCurrency, formatRelative } from '@/lib/utils';
import { Badge, Button, EmptyState, PageHeader, Panel, SkeletonRows, Table, Td, Th, type Tone } from '@/components/ui';

type Trip = {
  id: number;
  name: string;
  emoji: string | null;
  destination: string | null;
  status: string;
  members: number;
  expenses: number;
  total_spent: number;
  created_by: string | null;
  created_at: string;
};

const statusTone: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'leaf', label: 'Active' },
  settled: { tone: 'sky', label: 'Settled' },
  archived: { tone: 'neutral', label: 'Archived' },
};

export default function TripsPage() {
  const { data, loading, error, reload } = useApi<Trip[]>('/trips', { limit: 200 });
  const trips = data ?? [];
  const totalSpent = trips.reduce((sum, t) => sum + (t.total_spent || 0), 0);
  const travellers = trips.reduce((sum, t) => sum + t.members, 0);

  return (
    <>
      <PageHeader title="Trips" description="Shared trip wallets where friends log expenses and settle up." />

      {trips.length > 0 && (
        <p className="mb-4 text-[15px] text-muted">
          <span className="text-ink font-medium">{trips.length}</span> trips,{' '}
          <span className="text-ink font-medium">{travellers}</span> travellers and{' '}
          <span className="text-ink font-medium">{formatCompactINR(totalSpent)}</span> in logged expenses.
        </p>
      )}

      <Panel flush>
        {error ? (
          <EmptyState icon={Plane} title="Trips couldn't be loaded" description={error} action={<Button onClick={reload}>Try again</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Trip</Th>
                <Th>Created by</Th>
                <Th>Status</Th>
                <Th align="right">Travellers</Th>
                <Th align="right">Expenses</Th>
                <Th align="right">Total spent</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows rows={6} cols={6} />
              ) : trips.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Plane} title="No trips yet" description="Trips appear here once a member creates one from the Social tab in the app." />
                  </td>
                </tr>
              ) : (
                trips.map((t) => {
                  const st = statusTone[t.status] ?? { tone: 'neutral' as Tone, label: t.status };
                  return (
                    <tr key={t.id} className="hover:bg-sunken/70">
                      <Td>
                        <span className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-lg bg-sunken flex items-center justify-center text-[18px]" aria-hidden>{t.emoji || '✈️'}</span>
                          <span>
                            <span className="block font-medium">{t.name}</span>
                            <span className="block text-[12px] text-muted">
                              {t.destination ? `${t.destination}, ` : ''}created {formatRelative(t.created_at)}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td className="text-muted">{t.created_by || 'Unknown'}</Td>
                      <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                      <Td align="right" >{t.members}</Td>
                      <Td align="right" >{t.expenses}</Td>
                      <Td align="right" className="font-medium">{formatCurrency(t.total_spent)}</Td>
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

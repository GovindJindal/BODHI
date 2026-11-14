'use client';
import React, { useEffect, useState } from 'react';
import { Search, Users, X, ChevronLeft, ChevronRight, UserX, UserCheck, LineChart } from 'lucide-react';
import api, { apiErrorMessage } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { formatCurrency, formatDate, formatRelative, humanize } from '@/lib/utils';
import {
  Avatar, Badge, Button, EmptyState, Input, Money, Notice, PageHeader, Panel, RoleBadge, Segmented,
  SkeletonRows, StatusBadge, Table, Td, Th,
} from '@/components/ui';

type Member = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; balance: number; created_at: string };
type Activity = {
  ledger: { id: string; type: string; amount: number; ref: string; description?: string | null; time: string }[];
  trading: { id: string; type: string; symbol: string; val: number; time: string }[];
};

const PAGE_SIZE = 25;
type RoleFilter = 'all' | 'user' | 'staff';

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Member | null>(null);

  // Debounce typing so every keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error, reload, setData } = useApi<{ total: number; users: Member[] }>('/users', {
    search,
    page,
    limit: PAGE_SIZE,
    role: role === 'all' ? undefined : role,
  });

  const rows = data?.users ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onStatusChanged = (id: string, is_active: boolean) => {
    setData((d) => (d ? { ...d, users: d.users.map((u) => (u.id === id ? { ...u, is_active } : u)) } : d));
    setSelected((s) => (s && s.id === id ? { ...s, is_active } : s));
  };

  return (
    <>
      <PageHeader title="Members" description="Everyone with a BODHI account. Select a member to see their wallet activity or suspend access." />

      <Panel flush>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between px-5 py-3 border-b border-line">
          <div className="relative sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" aria-hidden />
            <Input
              type="search"
              aria-label="Search members"
              placeholder="Search name, email or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Segmented<RoleFilter>
            label="Filter by role"
            value={role}
            onChange={(v) => {
              setRole(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'user', label: 'Members' },
              { value: 'staff', label: 'Staff' },
            ]}
          />
        </div>

        {error ? (
          <EmptyState icon={Users} title="Members couldn't be loaded" description={error} action={<Button onClick={reload}>Try again</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th align="right">Wallet balance</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows rows={8} cols={5} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Users}
                      title={search ? `No one matches “${search}”` : 'No members yet'}
                      description={search ? 'Try part of their email address or phone number.' : 'Accounts appear here as soon as people sign up in the app.'}
                    />
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className="cursor-pointer hover:bg-sunken/70 transition-colors"
                  >
                    <Td>
                      <button
                        className="flex items-center gap-3 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(u);
                        }}
                      >
                        <Avatar name={u.full_name || u.email} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink truncate max-w-[16rem]">{u.full_name || 'No name'}</span>
                          <span className="block text-[13px] text-muted truncate max-w-[16rem]">{u.email}</span>
                        </span>
                      </button>
                    </Td>
                    <Td><RoleBadge role={u.role} /></Td>
                    <Td><StatusBadge active={u.is_active} /></Td>
                    <Td className="text-muted whitespace-nowrap">{formatRelative(u.created_at)}</Td>
                    <Td align="right"><Money value={formatCurrency(u.balance)} /></Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 text-[13px] text-muted">
          <span>
            {total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString('en-IN')}` : ' '}
          </span>
          <div className="flex gap-2">
            <Button size="sm" icon={ChevronLeft} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </Panel>

      {selected && <MemberDrawer member={selected} onClose={() => setSelected(null)} onStatusChanged={onStatusChanged} />}
    </>
  );
}

function MemberDrawer({
  member,
  onClose,
  onStatusChanged,
}: {
  member: Member;
  onClose: () => void;
  onStatusChanged: (id: string, active: boolean) => void;
}) {
  const activity = useApi<Activity>(`/users/${member.id}/activity`);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/users/${member.id}/toggle-status`);
      onStatusChanged(member.id, res.data.is_active);
      setConfirming(false);
    } catch (e) {
      setError(apiErrorMessage(e, 'The status could not be changed.'));
    } finally {
      setBusy(false);
    }
  };

  const ledger = activity.data?.ledger ?? [];
  const trades = activity.data?.trading ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="member-title">
      <button aria-label="Close" className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="drawer-in relative w-full max-w-[460px] h-full bg-surface border-l border-line shadow-panel flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-line">
          <Avatar name={member.full_name || member.email} size={48} />
          <div className="min-w-0 flex-1">
            <h2 id="member-title" className="text-[18px] font-semibold truncate">{member.full_name || 'No name'}</h2>
            <p className="text-[14px] text-muted truncate">{member.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <RoleBadge role={member.role} />
              <StatusBadge active={member.is_active} />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-sunken">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-[13px] text-muted">Wallet balance</dt>
              <dd className="text-[22px] font-semibold">{formatCurrency(member.balance)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Joined</dt>
              <dd className="text-[15px] mt-1.5">{formatDate(member.created_at)}</dd>
            </div>
          </dl>

          <section>
            <h3 className="text-[14px] font-semibold mb-2">Wallet activity</h3>
            {activity.loading && !activity.data ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9" />)}</div>
            ) : ledger.length === 0 ? (
              <p className="text-[14px] text-muted">No wallet entries yet.</p>
            ) : (
              <ul className="border border-line rounded-lg divide-y divide-[var(--line)]">
                {ledger.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                    <span className="min-w-0">
                      <span className="block truncate">{l.description || humanize(l.ref)}</span>
                      <span className="block text-[12px] text-faint">{formatRelative(l.time)}</span>
                    </span>
                    <Money value={formatCurrency(l.amount, 'paise')} signed={l.type === 'CREDIT' ? 'credit' : 'debit'} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[14px] font-semibold mb-2">Paper trades</h3>
            {trades.length === 0 ? (
              <p className="text-[14px] text-muted">{activity.loading ? 'Loading…' : 'No paper trades yet.'}</p>
            ) : (
              <ul className="border border-line rounded-lg divide-y divide-[var(--line)]">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                    <span className="flex items-center gap-2 min-w-0">
                      <LineChart className="w-4 h-4 text-faint shrink-0" aria-hidden />
                      <span className="truncate">{t.symbol.replace(/\.NS$/, '')}</span>
                      <Badge tone={t.type === 'BUY' ? 'sky' : 'turmeric'}>{t.type === 'BUY' ? 'Buy' : 'Sell'}</Badge>
                    </span>
                    <span className="text-right">
                      <span className="block">{formatCurrency(t.val)}</span>
                      <span className="block text-[12px] text-faint">{formatRelative(t.time)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {activity.error && <Notice tone="madder">{activity.error}</Notice>}
        </div>

        <div className="border-t border-line px-6 py-4 space-y-3">
          {error && <Notice tone="madder">{error}</Notice>}
          {confirming ? (
            <div className="space-y-3">
              <p className="text-[14px]">
                {member.is_active
                  ? `Suspend ${member.full_name || member.email}? They will be signed out and can't send money or sign in until reactivated.`
                  : `Reactivate ${member.full_name || member.email}? They will be able to sign in again.`}
              </p>
              <div className="flex gap-2">
                <Button variant={member.is_active ? 'danger' : 'primary'} disabled={busy} onClick={toggle}>
                  {busy ? 'Saving…' : member.is_active ? 'Suspend account' : 'Reactivate account'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            </div>
          ) : member.is_active ? (
            <Button variant="danger" icon={UserX} onClick={() => setConfirming(true)}>Suspend account</Button>
          ) : (
            <Button variant="primary" icon={UserCheck} onClick={() => setConfirming(true)}>Reactivate account</Button>
          )}
        </div>
      </div>
    </div>
  );
}

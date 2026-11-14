'use client';
import React from 'react';
import { ScrollText, Lock } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { formatDate, formatRelative, humanize } from '@/lib/utils';
import { Avatar, Button, EmptyState, PageHeader, Panel } from '@/components/ui';

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
};

/** Turns an audit row into a sentence an operator can read at a glance. */
function describe(e: AuditEntry): string {
  const d = e.details ?? {};
  switch (e.action) {
    case 'TOGGLE_USER_STATUS':
      return d.new_status ? 'reactivated a member account' : 'suspended a member account';
    case 'SEND_BULK_NOTIF':
      return `sent “${String(d.title ?? 'an announcement')}” to ${Number(d.count ?? 0).toLocaleString('en-IN')} people`;
    case 'CREATE_ADMIN':
      return `added ${String(d.email ?? 'a new admin')} as an admin`;
    default:
      return humanize(e.action).toLowerCase();
  }
}

/** Group entries under a day heading: "Today", "Yesterday", or the date. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function AuditPage() {
  const { data, loading, error, reload } = useApi<AuditEntry[]>('/audit');

  if (error) {
    const forbidden = /super-admin/i.test(error);
    return (
      <>
        <PageHeader title="Audit log" />
        <Panel>
          <EmptyState
            icon={forbidden ? Lock : ScrollText}
            title={forbidden ? 'Only super admins can read the audit log' : "The audit log couldn't be loaded"}
            description={forbidden ? 'Ask a super admin if you need to check who changed something.' : error}
            action={forbidden ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        </Panel>
      </>
    );
  }

  const groups: { day: string; items: AuditEntry[] }[] = [];
  for (const e of data ?? []) {
    const day = dayLabel(e.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <>
      <PageHeader title="Audit log" description="The last 100 actions taken by admins: suspensions, announcements and new admin accounts." />

      {loading && !data ? (
        <Panel>
          <div className="space-y-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10" />)}</div>
        </Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState icon={ScrollText} title="No admin actions yet" description="Suspending a member, sending an announcement or adding an admin will be recorded here." />
        </Panel>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="text-[14px] font-semibold text-muted mb-3">{g.day}</h2>
              <ol className="relative border-l border-line-strong ml-4 space-y-1">
                {g.items.map((e) => (
                  <li key={e.id} className="relative pl-7 py-2">
                    <span className="absolute -left-4 top-2">
                      <Avatar name={e.actor} size={30} />
                    </span>
                    <p className="text-[14px] leading-relaxed">
                      <span className="font-medium">{e.actor}</span> {describe(e)}
                    </p>
                    <p className="text-[12px] text-faint mt-0.5" title={formatDate(e.timestamp)}>
                      {formatRelative(e.timestamp)}
                      {e.target ? `, target ${e.target.slice(0, 8)}` : ''}
                      {e.ip ? `, from ${e.ip}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

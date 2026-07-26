'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

interface StatusBadgeProps {
  status: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function StatusBadge({ status, activeLabel = 'ACTIVE', inactiveLabel = 'SUSPENDED' }: StatusBadgeProps) {
  return status ? (
    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
      <ShieldCheck className="w-3 h-3" /> {activeLabel}
    </div>
  ) : (
    <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-full border border-rose-500/20">
      <ShieldAlert className="w-3 h-3" /> {inactiveLabel}
    </div>
  );
}

interface RoleBadgeProps {
  role: string;
}

const roleStyles: Record<string, string> = {
  super_admin: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  admin: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  support: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={cn(
      "text-[10px] font-black px-2 py-1 rounded-md tracking-tighter border",
      roleStyles[role] || "bg-slate-500/10 text-slate-400 border-slate-700"
    )}>
      {role.toUpperCase()}
    </span>
  );
}

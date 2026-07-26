'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtext?: string;
  accent?: 'indigo' | 'green' | 'red' | 'amber' | 'violet';
}

const accentMap = {
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  red: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

export function StatCard({ label, value, icon: Icon, subtext, accent = 'indigo' }: StatCardProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-slate-700 transition-all duration-300 group">
      <div className="flex justify-between items-start mb-4">
        <span className={cn("p-2.5 rounded-2xl border", accentMap[accent])}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <h2 className="text-3xl font-bold text-white tracking-tight my-1 group-hover:scale-105 transition-transform origin-left duration-300">
          {value ?? '—'}
        </h2>
        {subtext && <p className="text-xs text-slate-500 font-medium">{subtext}</p>}
      </div>
    </div>
  );
}

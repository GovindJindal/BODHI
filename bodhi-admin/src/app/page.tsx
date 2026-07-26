'use client';
import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  Activity,
  IndianRupee,
  ShieldCheck,
  Zap,
  Briefcase,
  BarChart3
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/EmptyState';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/stats');
        setStats(res.data);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-pulse">
          <div className="w-12 h-12 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-slate-500 font-medium">Initializing System Telemetry...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
          <p className="text-slate-400 mt-1">Real-time intelligence from the BODHI ecosystem.</p>
        </header>
        <EmptyState
          icon={Activity}
          title="Connection Error"
          description="Unable to retrieve system telemetry. Check backend connectivity."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
          <p className="text-slate-400 mt-1">Real-time intelligence from the BODHI ecosystem.</p>
        </div>
        <div className="flex gap-2">
            <span className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                NETWORK SECURE
            </span>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Entities" 
          value={stats?.users?.total ?? 0} 
          icon={Users} 
          subtext={`${stats?.users?.active_24h ?? 0} active today`}
        />
        <StatCard 
          label="Ledger Volume" 
          value={formatCurrency(stats?.financials?.ledger_volume_paise)} 
          icon={IndianRupee} 
          subtext="Total circulating capital"
        />
        <StatCard 
          label="AUM (Venture Clubs)" 
          value={formatCurrency(stats?.financials?.success_volume_paise)} 
          icon={Briefcase} 
          subtext={`${stats?.features?.venture_clubs ?? 0} active clubs`}
          accent="violet"
        />
        <StatCard 
          label="System Health" 
          value={`${stats?.financials?.failed_payments_count > 0 ? 'ANOMALY' : 'OPTIMAL'}`} 
          icon={Activity} 
          accent={stats?.financials?.failed_payments_count > 0 ? 'red' : 'green'}
          subtext={`${stats?.financials?.failed_payments_count ?? 0} failed tx logs`}
        />
      </div>

      {/* Feature Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            Platform Summary
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Active Trips</p>
              <p className="text-2xl font-bold text-white">{stats?.features?.active_trips ?? 0}</p>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Venture Clubs</p>
              <p className="text-2xl font-bold text-white">{stats?.features?.venture_clubs ?? 0}</p>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Failed Payments</p>
              <p className="text-2xl font-bold text-rose-400">{stats?.financials?.failed_payments_count ?? 0}</p>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Active Today</p>
              <p className="text-2xl font-bold text-emerald-400">{stats?.users?.active_24h ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            System Intelligence
          </h3>
          <EmptyState
            icon={BarChart3}
            title="Charts Coming Soon"
            description="Time-series analytics will be available when the backend exposes historical data endpoints."
          />
        </div>
      </div>
    </div>
  );
}

'use client';
import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  AlertCircle, 
  Activity,
  IndianRupee,
  ShieldCheck,
  Zap,
  Briefcase
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';
import api from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/stats');
        setStats(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">Initializing System Telemetry...</div>;

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
          value={stats?.users?.total} 
          icon={Users} 
          subtext={`${stats?.users?.active_24h} active today`}
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
          subtext={`${stats?.features?.venture_clubs} active clubs`}
        />
        <StatCard 
          label="System Health" 
          value={`${stats?.financials?.failed_payments_count > 0 ? 'ANOMALY' : 'OPTIMAL'}`} 
          icon={Activity} 
          accent={stats?.financials?.failed_payments_count > 0 ? 'red' : 'green'}
          subtext={`${stats?.financials?.failed_payments_count} failed tx logs`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-400" />
            Transactional Momentum
          </h3>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            AI assistant (GAP) Utilization
          </h3>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                  />
                  <Line type="monotone" dataKey="value2" stroke="#f59e0b" strokeWidth={3} dot={false} />
                </LineChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, subtext, accent = 'indigo' }: any) {
  const accentColors: any = {
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl hover:border-slate-700 transition-all duration-300 group">
      <div className="flex justify-between items-start mb-4">
        <span className={cn("p-2.5 rounded-2xl border", accentColors[accent])}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <h2 className="text-3xl font-bold text-white tracking-tight my-1 group-hover:scale-105 transition-transform origin-left duration-300">{value}</h2>
        <p className="text-xs text-slate-500 font-medium">{subtext}</p>
      </div>
    </div>
  );
}

const mockChartData = [
  { name: 'Mon', value: 400, value2: 240 },
  { name: 'Tue', value: 300, value2: 139 },
  { name: 'Wed', value: 200, value2: 980 },
  { name: 'Thu', value: 278, value2: 390 },
  { name: 'Fri', value: 189, value2: 480 },
  { name: 'Sat', value: 239, value2: 380 },
  { name: 'Sun', value: 349, value2: 430 },
];

'use client';
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Calendar, User, Activity } from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/audit');
        setLogs(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">System Audit logs</h1>
        <p className="text-slate-400 mt-1">Immutable record of all administrative commands and modifications.</p>
      </header>

      <div className="space-y-4">
        {loading ? (
            <div className="text-slate-500 italic">Scanning cipher-blocks...</div>
        ) : logs.length === 0 ? (
            <div className="text-slate-500 italic">No administrative activity recorded in this session.</div>
        ) : (
            logs.map((log: any) => (
                <div key={log.id} className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center justify-between group hover:border-violet-500/30 transition-all">
                    <div className="flex items-center gap-6">
                        <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-white uppercase tracking-tighter">{log.action}</span>
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">VERIFIED</span>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-4 mt-1">
                                <span className="flex items-center gap-1"><User className="w-3 h-3" /> Admin ID: {log.admin_id.slice(0,8)}...</span>
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(log.created_at)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                            TARGET: {log.target_id || 'SYSTEM_GLOBAL'}
                        </div>
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  );
}

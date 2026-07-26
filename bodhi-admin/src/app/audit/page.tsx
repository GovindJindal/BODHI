'use client';
import React, { useEffect, useState } from 'react';
import { 
  ShieldAlert,
  Activity,
  User,
  History,
  TerminalSquare
} from 'lucide-react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { TableSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

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
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-slate-400 mt-1">Immutable record of all critical system actions and administrator activity.</p>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">Timestamp</th>
                <th className="px-8 py-6">Actor</th>
                <th className="px-8 py-6">Action</th>
                <th className="px-8 py-6">Target</th>
              </tr>
            </thead>
            {loading ? null : (
            <tbody className="divide-y divide-slate-800/50">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-10">
                    <EmptyState 
                      icon={TerminalSquare} 
                      title="No Audit Logs" 
                      description="No administrative actions have been logged yet."
                    />
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-6 text-sm text-slate-400 font-mono">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-violet-400" />
                        <span className="font-bold text-slate-300">{log.actor}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 font-mono text-sm text-slate-300">
                      {log.action}
                    </td>
                    <td className="px-8 py-6 font-mono text-sm text-slate-500">
                      {log.target || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            )}
          </table>
          {loading && <TableSkeleton rows={8} />}
        </div>
      </div>
    </div>
  );
}

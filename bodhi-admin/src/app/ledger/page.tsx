'use client';
import React, { useEffect, useState } from 'react';
import { 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatCurrency, cn } from '@/lib/utils';

export default function LedgerPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/ledger');
        setItems(res.data);
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
        <h1 className="text-3xl font-bold tracking-tight">Global Ledger</h1>
        <p className="text-slate-400 mt-1">The immutable source of truth for all BODHI capital movement.</p>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">Transaction Flow</th>
                <th className="px-8 py-6">Reference ID</th>
                <th className="px-8 py-6">Type</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6">Value</th>
                <th className="px-8 py-6 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500">Retrieving ledger fragments...</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          item.type === 'CREDIT' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                          {item.type === 'CREDIT' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div className="text-xs font-mono text-slate-400">{item.id.slice(0, 8)}...</div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 font-mono italic">
                        {item.ref}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                       <span className="text-xs font-bold text-slate-300">{item.type}</span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                        {item.status === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Clock className="w-3 h-3 text-amber-500" />}
                        {item.status}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                       <span className={cn(
                         "font-bold font-mono tracking-tighter text-lg",
                         item.type === 'CREDIT' ? "text-emerald-400" : "text-rose-400"
                       )}>
                         {item.type === 'CREDIT' ? '+' : '-'}{formatCurrency(item.amount)}
                       </span>
                    </td>
                    <td className="px-8 py-6 text-right text-slate-500 text-sm font-medium">
                      {formatDate(item.time)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

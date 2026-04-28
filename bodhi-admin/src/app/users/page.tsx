'use client';
import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  ShieldAlert, 
  ShieldCheck,
  UserX,
  CreditCard
} from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatCurrency, cn } from '@/lib/utils';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users', { params: { search } });
      setUsers(res.data.users);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleStatus = async (id: string) => {
      try {
          await api.post(`/users/${id}/toggle-status`);
          loadUsers();
      } catch (e) {
          alert('Operation failed');
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Intelligence</h1>
          <p className="text-slate-400 mt-1">Registry of all authorized entities in the BODHI ecosystem.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
            />
          </div>
          <button onClick={loadUsers} className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-violet-500/20">
            Filter
          </button>
        </div>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950/50 text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-800">
                <th className="px-8 py-6">Entity</th>
                <th className="px-8 py-6">Access Level</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6">Current Balance</th>
                <th className="px-8 py-6 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-500 italic">Scanning database...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-500 italic">No entities found in target parameters.</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-white shadow-lg shadow-violet-500/10">
                          {user.full_name[0]}
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 group-hover:text-violet-400 transition-colors">{user.full_name}</div>
                          <div className="text-xs text-slate-500 font-mono">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "text-[10px] font-black px-2 py-1 rounded-md tracking-tighter border",
                        user.role === 'super_admin' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        user.role === 'admin' ? "bg-violet-500/10 text-violet-400 border-violet-500/20" :
                        "bg-slate-500/10 text-slate-400 border-slate-700"
                      )}>
                        {user.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        {user.is_active ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                            <ShieldCheck className="w-3 h-3" /> ACTIVE
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-full border border-rose-500/20">
                            <ShieldAlert className="w-3 h-3" /> SUSPENDED
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-1.5 font-bold text-slate-100">
                        <CreditCard className="w-4 h-4 text-slate-500" />
                        {user.balance.toLocaleString()} INR
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleToggleStatus(user.id)}
                          className={cn(
                            "p-2 rounded-lg border transition-all",
                            user.is_active ? "hover:bg-rose-500/10 hover:border-rose-500/20 text-slate-500 hover:text-rose-500" : "hover:bg-emerald-500/10 hover:border-emerald-500/20 text-slate-500 hover:text-emerald-500"
                          )}
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-lg border border-slate-800 text-slate-500 hover:text-white hover:bg-slate-800 transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
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

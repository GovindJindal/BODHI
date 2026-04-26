'use client';
import React, { useState } from 'react';
import { ShieldPlus, User, Mail, Lock, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function CreateAdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    
    try {
      // Assuming a /create-admin endpoint exists on backend admin router
      await api.post('/create-admin', {
        email,
        password,
        full_name: fullName
      });
      setStatus({ success: true, message: 'New administrative entity has been successfully provisioned.' });
      setEmail('');
      setPassword('');
      setFullName('');
    } catch (err: any) {
      setStatus({ success: false, message: err.response?.data?.detail || 'Provisioning failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in zoom-in duration-700 mt-10">
      <div className="text-center">
          <div className="inline-flex p-5 rounded-[2.5rem] bg-violet-600/10 border border-violet-500/20 mb-6 shadow-2xl shadow-violet-500/10">
              <ShieldPlus className="w-12 h-12 text-violet-400" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tighter">Provision Administrator</h1>
          <p className="text-slate-400 mt-2 font-medium italic">Authorized security-level account creation protocol.</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 p-10 rounded-[3rem] backdrop-blur-2xl shadow-2xl">
        <form onSubmit={handleCreate} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Assigned Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Alexander Pierce" 
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-700"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@bodhi.ai" 
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-700"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Security Credentials</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••" 
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-700"
                required
              />
            </div>
          </div>

          {status && (
            <div className={cn(
              "p-5 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300",
              status.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            )}>
              {status.success ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              <span className="text-sm font-bold">{status.message}</span>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl transition-all shadow-2xl shadow-violet-600/30 flex items-center justify-center gap-3 group"
          >
            {loading ? 'PROVISIONING...' : (
              <>
                AUTHORIZE & CREATE <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="text-center text-slate-600 text-xs font-bold uppercase tracking-widest">
          IP Logged • Action requires audit clearance • SSL/TLS 1.3 Secure
      </div>
    </div>
  );
}

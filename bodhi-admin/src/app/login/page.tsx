'use client';
import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import axios from 'axios';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const res = await axios.post('http://localhost:8000/admin-v2/login', formData);
      localStorage.setItem('bodhi_admin_token', res.data.access_token);
      localStorage.setItem('bodhi_admin_user', JSON.stringify(res.data.user));
      window.location.href = '/';
    } catch (err: any) {
      setError(err.response?.data?.detail || 'System authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-radial-at-t from-violet-900/20 to-slate-950">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
            <div className="inline-flex p-4 rounded-3xl bg-violet-600/10 border border-violet-500/20 mb-6 shadow-2xl shadow-violet-500/10">
                <ShieldCheck className="w-10 h-10 text-violet-400" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter">BODHI <span className="text-violet-500">COMMAND</span></h1>
            <p className="text-slate-400 mt-2 font-medium">Secured Administrative Terminal</p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-10 rounded-[2.5rem] backdrop-blur-xl shadow-2xl">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Identity Email</label>
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Security Key</label>
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

            {error && <div className="text-rose-400 text-sm font-bold bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 rotate-180" /> {error}
            </div>}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-violet-600/20 group flex items-center justify-center gap-2"
            >
              {loading ? 'AUTHORIZING...' : (
                  <>
                    ENTER TERMINAL <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 mt-8 text-xs font-bold uppercase tracking-widest">
            Authorized Personnel Only • IP-Logged • AES-256 Encrypted
        </p>
      </div>
    </div>
  );
}

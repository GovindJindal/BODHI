'use client';
import React, { useState } from 'react';
import { 
  Bell, 
  Send, 
  Users, 
  ShieldAlert, 
  Info,
  CheckCircle2,
  AlertTriangle,
  Mail
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState('user');
  const [type, setType] = useState('INFO');
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    
    try {
      const res = await api.post('/notifications/bulk', {
        title,
        message,
        target_role: targetRole === 'all' ? null : targetRole,
        type: type,
        send_email: sendEmail
      });
      setStatus({ success: true, count: res.data.recipients });
      setTitle('');
      setMessage('');
    } catch (err: any) {
      setStatus({ success: false, error: err.response?.data?.detail || 'Transmission failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Notification Terminal</h1>
        <p className="text-slate-400 mt-1">Broadcast formal communications and emergency alerts across the BODHI network.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl">
            <form onSubmit={handleSend} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Dispatch Title</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. System Maintenance Update" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-700"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Message Content (Markdown Supported)</label>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Compose your broadcast message here..." 
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-slate-700 resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Target Audience</label>
                  <select 
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-4 text-white outline-none focus:border-violet-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="user">General Users</option>
                    <option value="admin">Administrators Only</option>
                    <option value="all">Global Broadcast (Everyone)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Priority Layer</label>
                  <select 
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-4 text-white outline-none focus:border-violet-500 transition-all appearance-none cursor-pointer"
                  >
                    <option value="INFO">Information (Standard)</option>
                    <option value="WARNING">Warning (High)</option>
                    <option value="CRITICAL">Critical (Immediate)</option>
                    <option value="SUCCESS">Success (Completion)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-violet-500/5 rounded-2xl border border-violet-500/10">
                  <input 
                    type="checkbox" 
                    id="send_email"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 bg-slate-950 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-950 cursor-pointer"
                  />
                  <label htmlFor="send_email" className="text-sm font-semibold text-slate-300 cursor-pointer">
                      Dispatch formal email broadcast to target audience
                  </label>
              </div>

              {status && (
                <div className={cn(
                  "p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in zoom-in duration-300",
                  status.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                )}>
                  {status.success ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                  <span className="text-sm font-bold">
                    {status.success ? `Broadcast deployed successfully to ${status.count} entities.` : status.error}
                  </span>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-violet-600/20 flex items-center justify-center gap-3 group"
              >
                {loading ? 'TRANSMITTING...' : (
                  <>
                    DISPATCH BROADCAST <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Protocol Guidelines
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="mt-1"><Info className="w-4 h-4 text-violet-400" /></div>
                <p className="text-xs text-slate-400 leading-relaxed">Notifications appear in real-time within the mobile application's Social Hub.</p>
              </li>
              <li className="flex gap-3">
                <div className="mt-1"><AlertTriangle className="w-4 h-4 text-amber-400" /></div>
                <p className="text-xs text-slate-400 leading-relaxed">Critical alerts bypass local notification silencers on supported devices.</p>
              </li>
              <li className="flex gap-3">
                <div className="mt-1"><Users className="w-4 h-4 text-emerald-400" /></div>
                <p className="text-xs text-slate-400 leading-relaxed">Global broadcasts impact active system load. Use sparingly during peak hours.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

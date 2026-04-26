'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  Bell, 
  ShieldCheck, 
  Settings, 
  LogOut,
  Zap,
  Briefcase,
  Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { name: 'User Intelligence', icon: Users, href: '/users' },
  { name: 'Global Ledger', icon: History, href: '/ledger' },
  { name: 'Trip Monitoring', icon: Wallet, href: '/trips' },
  { name: 'Venture Clubs', icon: Briefcase, href: '/clubs' },
  { name: 'Notifications', icon: Bell, href: '/notifications' },
  { name: 'AI Monitoring', icon: Zap, href: '/ai' },
  { name: 'Audit Logs', icon: ShieldCheck, href: '/audit' },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem('bodhi_admin_token');
    window.location.href = '/login';
  };

  return (
    <aside className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="p-8">
        <h1 className="text-2xl font-extrabold tracking-tighter text-white flex items-center gap-2">
          BODHI <span className="text-violet-500 text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">ADMIN</span>
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-violet-600/10 text-violet-400 border border-violet-500/20" 
                  : "text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-violet-400" : "text-slate-500 group-hover:text-slate-300")} />
              <span className="font-semibold text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-semibold text-sm"
        >
          <LogOut className="w-5 h-5" />
          Log Out
        </button>
      </div>
    </aside>
  );
}

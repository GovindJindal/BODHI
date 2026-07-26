'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from "@/components/Sidebar";
import { config } from '@/lib/config';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoginPage) {
      setIsAuthenticated(true); // Don't guard the login page
      return;
    }
    const token = localStorage.getItem(config.STORAGE_KEYS.TOKEN);
    if (!token) {
      window.location.href = '/login';
    } else {
      setIsAuthenticated(true);
    }
  }, [pathname, isLoginPage]);

  // Show nothing while checking auth (prevents flash of content)
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 animate-pulse text-sm font-medium">Verifying session...</div>
      </div>
    );
  }

  if (isLoginPage) return <div className="min-h-screen bg-slate-950">{children}</div>;

  // Get admin user info for the top bar
  let adminUser: any = null;
  try {
    const stored = localStorage.getItem(config.STORAGE_KEYS.USER);
    if (stored) adminUser = JSON.parse(stored);
  } catch {}

  const pageTitle = getPageTitle(pathname);

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 font-medium">System</span>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-white font-semibold">{pageTitle}</span>
          </div>
          {adminUser && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-bold text-slate-200">{adminUser.full_name || adminUser.email}</div>
                <div className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">{adminUser.role?.replace('_', ' ')}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-500/20">
                {(adminUser.full_name || adminUser.email || 'A')[0].toUpperCase()}
              </div>
            </div>
          )}
        </header>
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/users': 'User Intelligence',
    '/ledger': 'Global Ledger',
    '/trips': 'Trip Monitoring',
    '/clubs': 'Venture Clubs',
    '/notifications': 'Notifications',
    '/ai': 'AI Monitoring',
    '/audit': 'Audit Logs',
    '/create-admin': 'Provision Admin',
  };
  return titles[pathname] || 'Dashboard';
}

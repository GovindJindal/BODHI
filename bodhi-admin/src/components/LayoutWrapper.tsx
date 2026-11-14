'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar, BodhiMark, type AdminUser } from '@/components/Sidebar';
import { config } from '@/lib/config';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const [navOpen, setNavOpen] = useState(false);

  // Read the stored session without a setState-in-effect; null while prerendering.
  const session = useSyncExternalStore(subscribeStorage, readSession, () => null);
  const isAuthenticated = isLoginPage ? true : session === null ? null : Boolean(session.token);

  useEffect(() => {
    if (!isLoginPage && session !== null && !session.token) {
      window.location.href = '/login';
    }
  }, [isLoginPage, session]);

  if (isLoginPage) return <>{children}</>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BodhiMark className="w-10 h-10 opacity-70 animate-pulse" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 bg-surface px-3 py-2 rounded-lg">
        Skip to content
      </a>

      <div className="hidden lg:flex">
        <Sidebar user={session?.user ?? null} />
      </div>

      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button aria-label="Close menu" className="absolute inset-0 bg-ink/30" onClick={() => setNavOpen(false)} />
          <div className="relative drawer-in">
            <Sidebar user={session?.user ?? null} onNavigate={() => setNavOpen(false)} />
            <button
              aria-label="Close menu"
              onClick={() => setNavOpen(false)}
              className="absolute top-4 -right-12 w-9 h-9 rounded-lg bg-surface text-ink flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden h-14 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-surface">
          <button
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-ink hover:bg-sunken"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BodhiMark className="w-7 h-7" />
          <span className="font-bold text-ink">BODHI</span>
          <span className="text-[13px] text-muted">Admin</span>
        </div>
        <main id="main" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-8 lg:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}

type StoredSession = { token: string | null; user: AdminUser | null; raw: string };

let cachedSession: StoredSession | null = null;

function readSession(): StoredSession {
  let token: string | null = null;
  let rawUser = '';
  try {
    token = localStorage.getItem(config.STORAGE_KEYS.TOKEN);
    rawUser = localStorage.getItem(config.STORAGE_KEYS.USER) ?? '';
  } catch {
    /* storage blocked – treat as signed out */
  }
  const raw = `${token ?? ''}|${rawUser}`;
  if (cachedSession && cachedSession.raw === raw) return cachedSession; // stable snapshot
  let user: AdminUser | null = null;
  try {
    user = rawUser ? (JSON.parse(rawUser) as AdminUser) : null;
  } catch {
    user = null;
  }
  cachedSession = { token, user, raw };
  return cachedSession;
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

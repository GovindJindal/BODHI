'use client';
import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ReceiptIndianRupee,
  Plane,
  Briefcase,
  Megaphone,
  ScrollText,
  Activity,
  UserPlus,
  LogOut,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { clearAdminSession } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Avatar, RoleBadge } from '@/components/ui';

type NavItem = { name: string; icon: LucideIcon; href: string; superOnly?: boolean };

const groups: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ name: 'Dashboard', icon: LayoutDashboard, href: '/' }] },
  {
    label: 'People',
    items: [
      { name: 'Members', icon: Users, href: '/users' },
      { name: 'Add admin', icon: UserPlus, href: '/create-admin' },
    ],
  },
  { label: 'Money', items: [{ name: 'Ledger', icon: ReceiptIndianRupee, href: '/ledger' }] },
  {
    label: 'Community',
    items: [
      { name: 'Trips', icon: Plane, href: '/trips' },
      { name: 'Investment clubs', icon: Briefcase, href: '/clubs' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Announcements', icon: Megaphone, href: '/notifications' },
      { name: 'Audit log', icon: ScrollText, href: '/audit', superOnly: true },
      { name: 'System status', icon: Activity, href: '/system' },
    ],
  },
];

export type AdminUser = { full_name?: string; email?: string; role?: string };

/** The official BODHI app icon (the tree), shown as a rounded tile like on a phone. */
export function BodhiMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, tiny local asset
    <img src="/bodhi-icon.png" alt="" aria-hidden className={cn('rounded-[22%] object-cover shrink-0', className)} />
  );
}

/* Theme: stored choice wins, otherwise the OS setting. */
const THEME_KEY = 'bodhi_admin_theme';
function subscribeTheme(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  window.addEventListener('bodhi-theme', cb);
  return () => {
    mq.removeEventListener('change', cb);
    window.removeEventListener('bodhi-theme', cb);
  };
}
function readTheme(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {}
        window.dispatchEvent(new Event('bodhi-theme'));
      }}
      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-sunken"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function Sidebar({ user, onNavigate }: { user: AdminUser | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isSuper = user?.role === 'super_admin';

  const signOut = () => {
    clearAdminSession();
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 shrink-0 h-full bg-surface border-r border-line flex flex-col">
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-line">
        <BodhiMark className="w-8 h-8" />
        <span className="text-[17px] font-bold tracking-[-0.01em] text-ink">BODHI</span>
        <span className="text-[13px] text-muted">Admin</span>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => {
          const items = group.items.filter((i) => !i.superOnly || isSuper);
          if (!items.length) return null;
          return (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[12px] text-faint">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-3 h-9 px-2 rounded-lg text-[14px] transition-colors',
                          active ? 'bg-leaf-soft text-leaf font-medium' : 'text-muted hover:text-ink hover:bg-sunken',
                        )}
                      >
                        <item.icon className="w-[18px] h-[18px]" aria-hidden />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user?.full_name || user?.email} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink truncate">{user?.full_name || user?.email || 'Admin'}</p>
            {user?.role && <RoleBadge role={user.role} />}
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={signOut}
          className="mt-1 w-full flex items-center gap-3 h-9 px-2 rounded-lg text-[14px] text-muted hover:text-madder hover:bg-madder-soft"
        >
          <LogOut className="w-[18px] h-[18px]" aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  );
}

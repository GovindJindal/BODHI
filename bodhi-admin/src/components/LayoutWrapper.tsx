'use client';
import { usePathname } from 'next/navigation';
import { Sidebar } from "@/components/Sidebar";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) return <div className="min-h-screen bg-slate-950">{children}</div>;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 h-screen overflow-y-auto bg-slate-950 p-8">
        {children}
      </main>
    </div>
  );
}

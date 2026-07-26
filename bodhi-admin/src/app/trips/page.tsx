'use client';
import React from 'react';
import { Wallet, Construction } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export default function TripsPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Trip Monitoring</h1>
        <p className="text-slate-400 mt-1">Real-time oversight of collaborative trip wallets across the BODHI network.</p>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <EmptyState 
          icon={Construction}
          title="Coming Soon"
          description="Trip monitoring dashboard is under development. Trip data is currently accessible via the backend API."
        />
      </div>
    </div>
  );
}

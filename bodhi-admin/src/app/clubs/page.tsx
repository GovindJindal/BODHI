'use client';
import React from 'react';
import { Briefcase, Construction } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export default function ClubsPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Venture Clubs</h1>
        <p className="text-slate-400 mt-1">Oversight of investment groups and collaborative portfolio activity.</p>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <EmptyState 
          icon={Construction}
          title="Coming Soon"
          description="Venture Club management dashboard is under development. Club data is currently accessible via the backend API."
        />
      </div>
    </div>
  );
}

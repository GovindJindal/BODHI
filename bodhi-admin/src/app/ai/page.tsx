'use client';
import React from 'react';
import { Zap, Construction } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export default function AIPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">AI Monitoring</h1>
        <p className="text-slate-400 mt-1">GAP assistant utilization metrics and AI-driven insight analytics.</p>
      </header>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <EmptyState 
          icon={Construction}
          title="Coming Soon"
          description="AI monitoring dashboard is under development. AI usage logs are currently accessible via CloudWatch."
        />
      </div>
    </div>
  );
}

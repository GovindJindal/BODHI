'use client';
import React from 'react';
import { FileX2 } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title?: string;
  description?: string;
}

export function EmptyState({ 
  icon: Icon = FileX2, 
  title = 'No data found', 
  description = 'There is nothing to display right now.' 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
      <div className="p-4 rounded-3xl bg-slate-800/50 border border-slate-700/50 mb-6">
        <Icon className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-bold text-slate-400 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 max-w-sm">{description}</p>
    </div>
  );
}

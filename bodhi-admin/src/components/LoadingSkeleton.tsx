'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 5, className }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-4 animate-pulse", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-800 rounded-lg w-3/4" />
            <div className="h-3 bg-slate-800/60 rounded-lg w-1/2" />
          </div>
          <div className="h-6 w-20 bg-slate-800 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-8 py-6 border-b border-slate-800">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-3 bg-slate-800 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-8 py-6 border-b border-slate-800/30">
          <div className="w-10 h-10 rounded-full bg-slate-800/60" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-800/50 rounded w-48" />
            <div className="h-3 bg-slate-800/30 rounded w-32" />
          </div>
          <div className="h-5 w-16 bg-slate-800/40 rounded-full" />
          <div className="h-5 w-20 bg-slate-800/40 rounded" />
        </div>
      ))}
    </div>
  );
}

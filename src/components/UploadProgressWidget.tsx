'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useBulkUpload } from '@/lib/BulkUploadContext';
import { Loader2, UploadCloud, X, ExternalLink, StopCircle } from 'lucide-react';

export default function UploadProgressWidget() {
  const { importing, queue, activeIndex, stats, stopImport } = useBulkUpload();
  const pathname = usePathname();

  // Only show when importing AND not already on the bulk-upload page
  if (!importing || pathname === '/bulk-upload') return null;

  const activeItem = activeIndex >= 0 ? queue[activeIndex] : null;
  const total = queue.filter(
    (i) => i.status !== 'Unsupported' && i.status !== 'File Too Large'
  ).length;
  const done = stats.success + stats.duplicate + stats.fail;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] w-80 rounded-2xl shadow-2xl shadow-black/40 border border-white/10 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1052 100%)' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="relative">
            <UploadCloud className="w-4 h-4 text-[#a78bfa]" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />
          </div>
          <span className="text-xs font-extrabold text-white tracking-wide">Upload in Progress</span>
        </div>
        <button
          onClick={stopImport}
          title="Stop after current file"
          className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
        >
          <StopCircle className="w-3.5 h-3.5" />
          Stop
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Overall progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Overall Progress
            </span>
            <span className="text-[10px] font-extrabold text-white">
              {done} / {total} files
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] transition-all duration-500"
              style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Current file */}
        {activeItem && (
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <Loader2 className="w-3.5 h-3.5 text-[#a78bfa] animate-spin mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white truncate">{activeItem.name}</p>
                <p className="text-[10px] text-[#a78bfa] font-semibold mt-0.5">
                  {activeItem.status === 'Uploading File'
                    ? `Uploading… ${Math.round(activeItem.progress)}%`
                    : activeItem.status}
                </p>
              </div>
            </div>

            {/* Per-file progress bar (only for Uploading File) */}
            {activeItem.status === 'Uploading File' && (
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#6366f1] to-[#a78bfa] transition-all duration-200"
                  style={{ width: `${activeItem.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="text-green-400">✓ {stats.success}</span>
          <span className="text-amber-400">⊘ {stats.duplicate} dup</span>
          <span className="text-red-400">✗ {stats.fail}</span>
          <Link
            href="/bulk-upload"
            className="ml-auto flex items-center gap-1 text-[#a78bfa] hover:text-white transition-colors"
          >
            View all <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

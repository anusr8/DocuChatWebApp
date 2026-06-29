'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Zap,
  ArrowLeft,
  FileUp,
  Inbox,
  Play,
  StopCircle
} from 'lucide-react';
import Header from '@/components/Header';
import Script from 'next/script';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBulkUpload } from '@/lib/BulkUploadContext';

export default function BulkUpload() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // All upload state and logic comes from the global context
  const { queue, importing, activeIndex, stats, addFiles, removeItem, clearQueue, startImport, stopImport } = useBulkUpload();

  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };


  // (Thumbnail generation, upload loop, and state all live in BulkUploadContext — survives navigation)

  const getStatusBadge = (item: ReturnType<typeof useBulkUpload>['queue'][0]) => {
    switch (item.status) {
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-500 border border-green-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'Skipped (Duplicate)':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Duplicate Skipped
          </span>
        );
      case 'Failed':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20 cursor-pointer"
            title={item.error}
          >
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'Unsupported':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Unsupported Type
          </span>
        );
      case 'File Too Large':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            Too Large (&gt;50MB)
          </span>
        );
      case 'Queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-400 border border-slate-500/10">
            Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-brand/10 text-brand dark:text-[#8B5DB5] border border-brand/20 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            {item.status === 'Uploading File'
              ? `Uploading (${Math.round(item.progress)}%)`
              : item.status}
          </span>
        );
    }
  };

  const getFormatBadge = (type: string | null) => {
    if (!type) return <span className="text-slate-400 text-xs font-medium">-</span>;
    const colors: Record<string, string> = {
      pdf: 'bg-red-500/10 text-red-500 border-red-500/10',
      ppt: 'bg-amber-500/10 text-amber-500 border-amber-500/10',
      word: 'bg-blue-500/10 text-blue-500 border-blue-500/10',
      video: 'bg-purple-500/10 text-purple-500 border-purple-500/10',
      audio: 'bg-pink-500/10 text-pink-500 border-pink-500/10',
      image: 'bg-teal-500/10 text-teal-500 border-teal-500/10',
    };
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
          colors[type] || 'bg-slate-500/10 text-slate-400'
        }`}
      >
        {type}
      </span>
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Header />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }}
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
        strategy="lazyOnload"
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
        strategy="lazyOnload"
      />

      <main className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pt-32 px-4 sm:px-6 lg:px-8 gap-6 pb-12">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6E3C96]/10 border border-[#6E3C96]/20 text-[#6E3C96] dark:text-[#8B5DB5] text-[10px] font-bold uppercase tracking-wider">
            <Zap className="w-3 h-3" />
            <span>AI-Powered Import</span>
          </div>
        </div>

        {/* Top Header Card */}
        <div className="glass-card p-8 rounded-[32px] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">
              Bulk GTM Import <span className="text-gradient">Local Pipeline</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-2xl">
              Upload multiple folders and files in one shot. Your files are processed sequentially
              locally, generating visual previews, uploading to GCS, and generating AI embeddings
              without server timeouts.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2.5 px-5 py-3 bg-[#6E3C96] hover:bg-[#5A2E7B] disabled:bg-[#6E3C96]/50 text-white rounded-xl font-bold transition-all shadow-lg shadow-[#6E3C96]/20 cursor-pointer text-sm"
            >
              <Upload className="w-4 h-4" />
              Select Files
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2.5 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 disabled:opacity-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-xl font-bold transition-all cursor-pointer text-sm"
            >
              <FolderOpen className="w-4 h-4" />
              Select Folder
            </button>

            {/* Hidden Inputs */}
            <input
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.mov,.avi,.mp3,.wav,.m4a,.aac,.png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <input
              type="file"
              multiple
              {...({
                webkitdirectory: '',
                directory: '',
              } as any)}
              className="hidden"
              ref={folderInputRef}
              onChange={handleFolderChange}
            />
          </div>
        </div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: Dropzone & Stats */}
          <div className="flex flex-col gap-6">
            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[200px] border-2 border-dashed rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
                dragActive
                  ? 'border-[#6E3C96] bg-[#6E3C96]/5'
                  : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-[#6E3C96]/10 flex items-center justify-center border border-[#6E3C96]/20 text-brand mb-4">
                <FileUp className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                Drag & drop files or folders here
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Supports PDF, PPT, Word, Video, Audio, and Images up to 50MB
              </p>
            </div>

            {/* Import Summary Stats Card */}
            <div className="glass-card p-6 rounded-[32px] space-y-4">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Import Statistics
              </h3>
              
              <div className="space-y-3">
                {/* Stats rows */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-xs text-slate-500 font-semibold">Total Queue</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-white">
                    {stats.total}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-green-500/5 dark:bg-green-500/10 border border-green-500/20 text-green-500">
                  <span className="text-xs font-semibold">Succeeded</span>
                  <span className="text-sm font-black">{stats.success}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <span className="text-xs font-semibold">Duplicate Skipped</span>
                  <span className="text-sm font-black">{stats.duplicate}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 text-red-500">
                  <span className="text-xs font-semibold">Failed</span>
                  <span className="text-sm font-black">{stats.fail}</span>
                </div>
                {stats.unsupported + stats.tooLarge > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-500/5 dark:bg-slate-500/10 border border-slate-500/10 text-slate-400">
                    <span className="text-xs font-semibold">Skipped (Invalid/Too Large)</span>
                    <span className="text-sm font-bold">
                      {stats.unsupported + stats.tooLarge}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  onClick={clearQueue}
                  disabled={importing || queue.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all text-xs border border-slate-200 dark:border-white/10"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Queue
                </button>
                {importing ? (
                  <button
                    onClick={stopImport}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl font-bold transition-all text-xs"
                  >
                    <StopCircle className="w-4 h-4" />
                    Stop Import
                  </button>
                ) : (
                  <button
                    onClick={startImport}
                    disabled={
                      queue.filter(
                        (item) =>
                          item.status !== 'Completed' &&
                          item.status !== 'Skipped (Duplicate)' &&
                          item.status !== 'Unsupported' &&
                          item.status !== 'File Too Large'
                      ).length === 0
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#6E3C96] hover:bg-[#5A2E7B] disabled:bg-slate-300 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-slate-600 rounded-xl font-bold transition-all text-xs text-white shadow-lg shadow-[#6E3C96]/10"
                  >
                    <Play className="w-4 h-4" />
                    Start Import
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Queue Grid Table */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="glass-card p-6 rounded-[32px] flex-1 flex flex-col min-h-[450px]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                    Upload Queue
                  </h3>
                  <p className="text-xs text-slate-400">
                    Manage files and monitor processing status.
                  </p>
                </div>
                {queue.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-[#6E3C96]/10 text-[#6E3C96] dark:text-[#8B5DB5] text-[10px] font-black uppercase tracking-widest border border-[#6E3C96]/10">
                    {queue.length} Files
                  </span>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 dark:text-slate-500">
                  <Inbox className="w-12 h-12 opacity-30 mb-3" />
                  <p className="text-sm font-semibold">Your queue is empty</p>
                  <p className="text-xs max-w-xs mt-1">
                    Select local files or drop an entire folder to begin bulk ingestion.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[500px] pr-2 space-y-3">
                  {queue.map((item, index) => {
                    const isActive = index === activeIndex;
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                          isActive
                            ? 'bg-[#6E3C96]/5 border-[#6E3C96] shadow-md shadow-[#6E3C96]/5'
                            : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 text-slate-400 dark:text-slate-500 border border-slate-200/50 dark:border-white/5">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p
                                className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-xs sm:max-w-md"
                                title={item.relativePath || item.name}
                              >
                                {item.name}
                              </p>
                              {getFormatBadge(item.materialType)}
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {formatSize(item.size)}
                              {item.relativePath && item.relativePath !== item.name && (
                                <span className="ml-2 font-mono text-[9px] text-slate-400/70">
                                  /{item.relativePath.substring(0, item.relativePath.lastIndexOf('/'))}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {getStatusBadge(item)}

                          <button
                            onClick={() => removeItem(item.id)}
                            disabled={importing}
                            className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 rounded-lg hover:bg-red-500/5 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {importing && activeIndex !== -1 && queue[activeIndex] && (
                <div className="mt-6 p-4 rounded-2xl bg-[#6E3C96]/10 border border-[#6E3C96]/20 animate-in slide-in-from-bottom duration-300">
                  <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                      Active: {queue[activeIndex].name}
                    </span>
                    <span>
                      {activeIndex + 1} of {queue.length} files
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#6E3C96] to-amber-500 transition-all duration-300 ease-out"
                      style={{
                        width: `${((activeIndex + 1) / queue.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

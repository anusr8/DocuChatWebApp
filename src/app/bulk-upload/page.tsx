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
  RefreshCcw,
  Zap,
  Shield,
  BarChart3,
  ArrowLeft,
  ChevronRight,
  FileUp,
  Inbox,
  Play
} from 'lucide-react';
import Header from '@/components/Header';
import Script from 'next/script';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  materialType: string | null; // pdf, ppt, word, video, audio, image
  status: 'Queued' | 'Unsupported' | 'Generating Thumbnail' | 'Requesting upload permission' | 'Uploading File' | 'Uploading Thumbnail' | 'Indexing' | 'Completed' | 'Skipped (Duplicate)' | 'Failed' | 'File Too Large';
  progress: number;
  error?: string;
  relativePath?: string;
}

export default function BulkUpload() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [dragActive, setDragActive] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    duplicate: 0,
    fail: 0,
    unsupported: 0,
    tooLarge: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Warn user if they try to leave the page while uploading
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (importing) {
        e.preventDefault();
        e.returnValue = 'Upload in progress. If you leave, the import will stop. Are you sure?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [importing]);

  // Recalculate stats when queue changes
  useEffect(() => {
    const newStats = queue.reduce(
      (acc, item) => {
        acc.total++;
        if (item.status === 'Completed') acc.success++;
        else if (item.status === 'Skipped (Duplicate)') acc.duplicate++;
        else if (item.status === 'Failed') acc.fail++;
        else if (item.status === 'Unsupported') acc.unsupported++;
        else if (item.status === 'File Too Large') acc.tooLarge++;
        return acc;
      },
      { total: 0, success: 0, duplicate: 0, fail: 0, unsupported: 0, tooLarge: 0 }
    );
    setStats(newStats);
  }, [queue]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // File type detector
  const detectMaterialType = (fileName: string): string | null => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (!ext) return null;

    if (['pdf'].includes(ext)) return 'pdf';
    if (['ppt', 'pptx'].includes(ext)) return 'ppt';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';

    return null;
  };

  const processSelectedFiles = (selectedFiles: FileList | File[]) => {
    const newItems: QueueItem[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const type = detectMaterialType(file.name);

      let initialStatus: QueueItem['status'] = 'Queued';
      if (!type) {
        initialStatus = 'Unsupported';
      }

      // Check if file is already in queue
      const relativePath = (file as any).webkitRelativePath || file.name;
      
      newItems.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        materialType: type,
        status: initialStatus,
        progress: 0,
        relativePath
      });
    }

    setQueue((prev) => {
      // Filter duplicates by name + size to prevent duplicate additions in the same session UI
      const existingKeys = new Set(prev.map((item) => `${item.name}-${item.size}`));
      const uniqueNewItems = newItems.filter((item) => !existingKeys.has(`${item.name}-${item.size}`));
      return [...prev, ...uniqueNewItems];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processSelectedFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processSelectedFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const removeItem = (id: string) => {
    if (importing) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    if (importing) return;
    setQueue([]);
  };

  // Thumbnail generation helper reusing app/page.tsx logic
  const generateThumbnail = async (file: File, type: string): Promise<Blob | null> => {
    try {
      if (type === 'pdf') {
        const pdfJS = (window as any).pdfjsLib;
        if (pdfJS) {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfJS.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context!, viewport }).promise;
          return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        }
      } else if (type === 'word') {
        const mammoth = (window as any).mammoth;
        const html2canvas = (window as any).html2canvas;
        if (mammoth && html2canvas) {
          const arrayBuffer = await file.arrayBuffer();
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

          const container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.left = '-9999px';
          container.style.width = '800px';
          container.style.padding = '40px';
          container.style.background = 'white';
          container.style.color = 'black';
          container.innerHTML = html;
          document.body.appendChild(container);

          await new Promise((resolve) => setTimeout(resolve, 500));

          const canvas = await html2canvas(container, {
            width: 800,
            height: 1000,
            scale: 0.5,
            useCORS: true,
            logging: false,
          });
          document.body.removeChild(container);
          return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        }
      } else if (type === 'ppt') {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 800, 500);
          grad.addColorStop(0, '#1E1035');
          grad.addColorStop(0.5, '#3B1D6E');
          grad.addColorStop(1, '#6E3C96');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 500);

          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.lineWidth = 1;
          for (let x = 0; x <= 800; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke();
          }
          for (let y = 0; y <= 500; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
          }

          const accentGrad = ctx.createLinearGradient(0, 0, 800, 0);
          accentGrad.addColorStop(0, '#8B5CF6');
          accentGrad.addColorStop(1, '#EC4899');
          ctx.fillStyle = accentGrad;
          ctx.fillRect(0, 0, 800, 6);

          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.roundRect(40, 140, 160, 200, 20);
          ctx.fill();
          ctx.fillStyle = '#FF6B35';
          ctx.font = 'bold 52px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('PPT', 120, 265);

          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(240, 130); ctx.lineTo(240, 370); ctx.stroke();

          ctx.fillStyle = 'white';
          ctx.font = 'bold 26px sans-serif';
          ctx.textAlign = 'left';
          const baseName = file.name.replace(/\.(pptx?)/i, '');
          const displayName = baseName.length > 35 ? baseName.substring(0, 35) + '...' : baseName;
          const words = displayName.split(' ');
          let line = '';
          let lineY = 215;
          for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            if (ctx.measureText(test).width > 490) {
              ctx.fillText(line, 270, lineY);
              line = word;
              lineY += 36;
            } else {
              line = test;
            }
          }
          if (line) ctx.fillText(line, 270, lineY);

          ctx.font = '500 16px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillText('POWERPOINT PRESENTATION  ·  GTM ASSET', 270, Math.max(lineY + 50, 310));

          return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        }
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        return await new Promise((resolve) => {
          video.onloadeddata = () => {
            video.currentTime = Math.min(video.duration || 2, 2);
          };
          video.onseeked = async () => {
            await new Promise((r) => setTimeout(r, 500));
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            if (ctx && canvas.width > 0 && canvas.height > 0) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((blob) => {
                URL.revokeObjectURL(video.src);
                resolve(blob);
              }, 'image/jpeg', 0.8);
            } else {
              URL.revokeObjectURL(video.src);
              resolve(null);
            }
          };
          video.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve(null);
          };
          video.load();
        });
      } else if (type === 'audio') {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const grad = ctx.createLinearGradient(0, 0, 800, 500);
          grad.addColorStop(0, '#1E293B');
          grad.addColorStop(1, '#6E3C96');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 800, 500);

          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 4;
          for (let i = 0; i < 40; i++) {
            const h = 50 + Math.random() * 150;
            ctx.beginPath();
            ctx.moveTo(100 + i * 15, 250 - h / 2);
            ctx.lineTo(100 + i * 15, 250 + h / 2);
            ctx.stroke();
          }

          ctx.fillStyle = 'white';
          ctx.font = 'bold 40px sans-serif';
          ctx.textAlign = 'center';
          const title = file.name.length > 30 ? file.name.substring(0, 30) + '...' : file.name;
          ctx.fillText(title, 400, 220);

          ctx.font = 'bold 20px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText('AUDIO ASSET', 400, 270);

          return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        }
      } else if (type === 'image') {
        return await new Promise((resolve) => {
          const img = new window.Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxDim = 400;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src);
                resolve(blob);
              }, 'image/jpeg', 0.85);
            } else {
              URL.revokeObjectURL(img.src);
              resolve(null);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(img.src);
            resolve(null);
          };
        });
      }
    } catch (e) {
      console.error('Thumbnail creation logic error:', e);
    }
    return null;
  };

  const updateItemStatus = (
    id: string,
    status: QueueItem['status'],
    progress: number,
    error?: string
  ) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status, progress, error } : item))
    );
  };

  // Sequential Import Process
  const startImport = async () => {
    if (importing || queue.length === 0) return;
    setImporting(true);

    const runnableItems = queue.filter(
      (item) =>
        item.status !== 'Completed' &&
        item.status !== 'Skipped (Duplicate)' &&
        item.status !== 'Unsupported' &&
        item.status !== 'File Too Large'
    );

    if (runnableItems.length === 0) {
      setImporting(false);
      alert('No valid files in queue to process.');
      return;
    }

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      // Skip non-runnable files
      if (
        item.status === 'Completed' ||
        item.status === 'Skipped (Duplicate)' ||
        item.status === 'Unsupported' ||
        item.status === 'File Too Large'
      ) {
        continue;
      }

      setActiveIndex(i);

      try {
        // 1. Generate Thumbnail
        updateItemStatus(item.id, 'Generating Thumbnail', 0);
        let thumbnailBlob: Blob | null = null;
        if (item.materialType) {
          thumbnailBlob = await generateThumbnail(item.file, item.materialType);
        }

        // 2. Request Presigned Upload URLs
        updateItemStatus(item.id, 'Requesting upload permission', 0);
        const presignRes = await fetch('/api/upload/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: item.name,
            contentType: item.file.type || 'application/octet-stream',
            hasThumbnail: !!thumbnailBlob,
          }),
        });

        if (!presignRes.ok) {
          const presignText = await presignRes.text();
          let exists = false;
          let errMsg = `Failed upload check (${presignRes.status})`;
          try {
            const parsed = JSON.parse(presignText);
            exists = !!parsed.exists;
            errMsg = parsed.error || errMsg;
          } catch {}

          if (exists) {
            updateItemStatus(item.id, 'Skipped (Duplicate)', 0);
            continue;
          }
          throw new Error(errMsg);
        }

        const { fileUploadUrl, storagePath, thumbnailUploadUrl, thumbnailPath } =
          await presignRes.json();

        // 3. Upload main file directly to GCS via XHR (with progress tracking)
        updateItemStatus(item.id, 'Uploading File', 0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', fileUploadUrl, true);
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              updateItemStatus(item.id, 'Uploading File', progress);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`GCS upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error during file upload'));
          };

          xhr.send(item.file);
        });

        // 4. Upload thumbnail directly to GCS if generated
        if (thumbnailBlob && thumbnailUploadUrl) {
          updateItemStatus(item.id, 'Uploading Thumbnail', 100);
          const thumbRes = await fetch(thumbnailUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: thumbnailBlob,
          });
          if (!thumbRes.ok) {
            console.warn('Thumbnail upload failed, indexing anyway');
          }
        }

        // 5. Index File in Backend / Firestore
        updateItemStatus(item.id, 'Indexing', 100);
        const indexRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath,
            fileName: item.name,
            materialType: item.materialType,
            thumbnailPath: thumbnailBlob ? thumbnailPath : null,
          }),
        });

        if (!indexRes.ok) {
          const indexText = await indexRes.text();
          let indexError = `Indexing failed (${indexRes.status})`;
          try {
            indexError = JSON.parse(indexText).error || indexError;
          } catch {}
          throw new Error(indexError);
        }

        updateItemStatus(item.id, 'Completed', 100);
      } catch (err: any) {
        console.error(`Error processing file ${item.name}:`, err);
        updateItemStatus(item.id, 'Failed', 0, err.message || 'Unknown error occurred');
      }
    }

    setImporting(false);
    setActiveIndex(-1);
  };

  const getStatusBadge = (item: QueueItem) => {
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
                <button
                  onClick={startImport}
                  disabled={
                    importing ||
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
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start Import
                    </>
                  )}
                </button>
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

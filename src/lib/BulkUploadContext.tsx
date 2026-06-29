'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

export interface QueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  materialType: string | null;
  status:
    | 'Queued'
    | 'Unsupported'
    | 'Generating Thumbnail'
    | 'Requesting upload permission'
    | 'Uploading File'
    | 'Uploading Thumbnail'
    | 'Indexing'
    | 'Completed'
    | 'Skipped (Duplicate)'
    | 'Failed'
    | 'File Too Large';
  progress: number;
  error?: string;
  relativePath?: string;
}

export interface UploadStats {
  total: number;
  success: number;
  duplicate: number;
  fail: number;
  unsupported: number;
  tooLarge: number;
}

interface BulkUploadContextType {
  queue: QueueItem[];
  importing: boolean;
  activeIndex: number;
  stats: UploadStats;
  addFiles: (files: FileList | File[]) => void;
  removeItem: (id: string) => void;
  clearQueue: () => void;
  startImport: () => void;
  stopImport: () => void;
}

const BulkUploadContext = createContext<BulkUploadContextType>({
  queue: [],
  importing: false,
  activeIndex: -1,
  stats: { total: 0, success: 0, duplicate: 0, fail: 0, unsupported: 0, tooLarge: 0 },
  addFiles: () => {},
  removeItem: () => {},
  clearQueue: () => {},
  startImport: () => {},
  stopImport: () => {},
});

export const useBulkUpload = () => useContext(BulkUploadContext);

// ─── File type detector ───────────────────────────────────────────────────────
function detectMaterialType(fileName: string): string | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (!ext) return null;
  if (['pdf'].includes(ext)) return 'pdf';
  if (['ppt', 'pptx'].includes(ext)) return 'ppt';
  if (['doc', 'docx'].includes(ext)) return 'word';
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return null;
}

// ─── Thumbnail generator (browser DOM APIs — works in any client component) ──
async function generateThumbnail(file: File, type: string): Promise<Blob | null> {
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
        container.style.cssText =
          'position:absolute;left:-9999px;width:800px;padding:40px;background:white;color:black';
        container.innerHTML = html;
        document.body.appendChild(container);
        await new Promise((r) => setTimeout(r, 500));
        const canvas = await html2canvas(container, {
          width: 800, height: 1000, scale: 0.5, useCORS: true, logging: false,
        });
        document.body.removeChild(container);
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      }
    } else if (type === 'ppt') {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 500;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 800, 500);
        grad.addColorStop(0, '#1E1035'); grad.addColorStop(0.5, '#3B1D6E'); grad.addColorStop(1, '#6E3C96');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 800, 500);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
        for (let x = 0; x <= 800; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke(); }
        for (let y = 0; y <= 500; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke(); }
        const accentGrad = ctx.createLinearGradient(0, 0, 800, 0);
        accentGrad.addColorStop(0, '#8B5CF6'); accentGrad.addColorStop(1, '#EC4899');
        ctx.fillStyle = accentGrad; ctx.fillRect(0, 0, 800, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath();
        ctx.roundRect(40, 140, 160, 200, 20); ctx.fill();
        ctx.fillStyle = '#FF6B35'; ctx.font = 'bold 52px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('PPT', 120, 265);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(240, 130); ctx.lineTo(240, 370); ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'left';
        const baseName = file.name.replace(/\.(pptx?)/i, '');
        const displayName = baseName.length > 35 ? baseName.substring(0, 35) + '...' : baseName;
        const words = displayName.split(' ');
        let line = ''; let lineY = 215;
        for (const word of words) {
          const test = line + (line ? ' ' : '') + word;
          if (ctx.measureText(test).width > 490) { ctx.fillText(line, 270, lineY); line = word; lineY += 36; }
          else { line = test; }
        }
        if (line) ctx.fillText(line, 270, lineY);
        ctx.font = '500 16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText('POWERPOINT PRESENTATION  ·  GTM ASSET', 270, Math.max(lineY + 50, 310));
        return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      }
    } else if (type === 'video') {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true; video.playsInline = true;
      return await new Promise((resolve) => {
        video.onloadeddata = () => { video.currentTime = Math.min(video.duration || 2, 2); };
        video.onseeked = async () => {
          await new Promise((r) => setTimeout(r, 500));
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx && canvas.width > 0 && canvas.height > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => { URL.revokeObjectURL(video.src); resolve(blob); }, 'image/jpeg', 0.8);
          } else { URL.revokeObjectURL(video.src); resolve(null); }
        };
        video.onerror = () => { URL.revokeObjectURL(video.src); resolve(null); };
        video.load();
      });
    } else if (type === 'audio') {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 500;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 800, 500);
        grad.addColorStop(0, '#1E293B'); grad.addColorStop(1, '#6E3C96');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 800, 500);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4;
        for (let i = 0; i < 40; i++) {
          const h = 50 + Math.random() * 150;
          ctx.beginPath(); ctx.moveTo(100 + i * 15, 250 - h / 2); ctx.lineTo(100 + i * 15, 250 + h / 2); ctx.stroke();
        }
        ctx.fillStyle = 'white'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
        const title = file.name.length > 30 ? file.name.substring(0, 30) + '...' : file.name;
        ctx.fillText(title, 400, 220);
        ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
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
          let width = img.width, height = img.height;
          if (width > height) { if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; } }
          else { if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; } }
          canvas.width = width; canvas.height = height;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => { URL.revokeObjectURL(img.src); resolve(blob); }, 'image/jpeg', 0.85);
          } else { URL.revokeObjectURL(img.src); resolve(null); }
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null); };
      });
    }
  } catch (e) {
    console.error('[BulkUpload] Thumbnail error:', e);
  }
  return null;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function BulkUploadProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [stats, setStats] = useState<UploadStats>({
    total: 0, success: 0, duplicate: 0, fail: 0, unsupported: 0, tooLarge: 0,
  });

  // Abort flag — set to true to request a graceful stop after current file
  const abortRef = useRef(false);
  // Keep a stable ref to the queue for the async loop to read without stale closures
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  // Warn on tab close while importing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (importing) {
        e.preventDefault();
        e.returnValue = 'Upload in progress. Leaving will stop all uploads. Are you sure?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [importing]);

  // Recalculate stats whenever queue changes
  useEffect(() => {
    const s = queue.reduce(
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
    setStats(s);
  }, [queue]);

  const updateItemStatus = useCallback(
    (id: string, status: QueueItem['status'], progress: number, error?: string) => {
      setQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status, progress, error } : item))
      );
    },
    []
  );

  const addFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = detectMaterialType(file.name);
      const relativePath = (file as any).webkitRelativePath || file.name;
      newItems.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        materialType: type,
        status: type ? 'Queued' : 'Unsupported',
        progress: 0,
        relativePath,
      });
    }
    setQueue((prev) => {
      const existingKeys = new Set(prev.map((item) => `${item.name}-${item.size}`));
      return [...prev, ...newItems.filter((item) => !existingKeys.has(`${item.name}-${item.size}`))];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    if (importing) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, [importing]);

  const clearQueue = useCallback(() => {
    if (importing) return;
    setQueue([]);
  }, [importing]);

  const stopImport = useCallback(() => {
    abortRef.current = true;
  }, []);

  const startImport = useCallback(async () => {
    if (importing) return;

    const snapshot = queueRef.current;
    const runnableItems = snapshot.filter(
      (item) =>
        item.status !== 'Completed' &&
        item.status !== 'Skipped (Duplicate)' &&
        item.status !== 'Unsupported' &&
        item.status !== 'File Too Large'
    );

    if (runnableItems.length === 0) {
      alert('No valid files in queue to process.');
      return;
    }

    abortRef.current = false;
    setImporting(true);

    for (let i = 0; i < snapshot.length; i++) {
      // Re-read item from live queue so we get the latest status
      const item = queueRef.current[i];
      if (!item) continue;

      if (
        item.status === 'Completed' ||
        item.status === 'Skipped (Duplicate)' ||
        item.status === 'Unsupported' ||
        item.status === 'File Too Large'
      ) continue;

      // Check for user-requested stop
      if (abortRef.current) break;

      setActiveIndex(i);

      try {
        // 1. Generate Thumbnail
        updateItemStatus(item.id, 'Generating Thumbnail', 0);
        let thumbnailBlob: Blob | null = null;
        if (item.materialType) {
          thumbnailBlob = await generateThumbnail(item.file, item.materialType);
        }

        if (abortRef.current) break;

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
          if (exists) { updateItemStatus(item.id, 'Skipped (Duplicate)', 0); continue; }
          throw new Error(errMsg);
        }

        const { fileUploadUrl, storagePath, thumbnailUploadUrl, thumbnailPath } =
          await presignRes.json();

        if (abortRef.current) break;

        // 3. Upload main file directly to GCS via XHR (with progress tracking)
        updateItemStatus(item.id, 'Uploading File', 0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', fileUploadUrl, true);
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              updateItemStatus(item.id, 'Uploading File', (event.loaded / event.total) * 100);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`GCS upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error('Network error during file upload'));
          xhr.send(item.file);
        });

        // 4. Upload thumbnail to GCS
        if (thumbnailBlob && thumbnailUploadUrl) {
          updateItemStatus(item.id, 'Uploading Thumbnail', 100);
          const thumbRes = await fetch(thumbnailUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: thumbnailBlob,
          });
          if (!thumbRes.ok) console.warn('[BulkUpload] Thumbnail upload failed, indexing anyway');
        }

        if (abortRef.current) break;

        // 5. Index File in Firestore
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
          try { indexError = JSON.parse(indexText).error || indexError; } catch {}
          throw new Error(indexError);
        }

        updateItemStatus(item.id, 'Completed', 100);
      } catch (err: any) {
        console.error(`[BulkUpload] Error processing ${item.name}:`, err);
        updateItemStatus(item.id, 'Failed', 0, err.message || 'Unknown error occurred');
      }
    }

    setImporting(false);
    setActiveIndex(-1);
    abortRef.current = false;
  }, [importing, updateItemStatus]);

  return (
    <BulkUploadContext.Provider
      value={{ queue, importing, activeIndex, stats, addFiles, removeItem, clearQueue, startImport, stopImport }}
    >
      {children}
    </BulkUploadContext.Provider>
  );
}

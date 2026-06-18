'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  Send,
  MessageSquare,
  RefreshCcw,
  Zap,
  Globe2,
  Shield,
  BarChart3,
  ExternalLink
} from 'lucide-react';
import Header from '@/components/Header';
import Script from 'next/script';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  // Upload States
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [materialType, setMaterialType] = useState('pdf');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateFileName, setDuplicateFileName] = useState('');

  // Chat States
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string; recommendations?: any[] }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CHAT_STORAGE_KEY = 'gtm_chat_history';
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Clear chat on mount to refresh each time the page loads
  useEffect(() => {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setMessages([]);
    setInput('');
  }, []);

  // Save chat on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const selectedFile = e.target.files[0];
    const fileName = selectedFile.name.toLowerCase();

    // Validation logic
    let isValid = false;
    let expectedFormat = '';

    if (materialType === 'pdf') {
      isValid = fileName.endsWith('.pdf');
      expectedFormat = 'PDF (.pdf)';
    } else if (materialType === 'ppt') {
      isValid = fileName.endsWith('.ppt') || fileName.endsWith('.pptx');
      expectedFormat = 'PowerPoint (.ppt, .pptx)';
    } else if (materialType === 'word') {
      isValid = fileName.endsWith('.doc') || fileName.endsWith('.docx');
      expectedFormat = 'Word Document (.doc, .docx)';
    } else if (materialType === 'video') {
      isValid = fileName.endsWith('.mp4') || fileName.endsWith('.mov') || fileName.endsWith('.avi');
      expectedFormat = 'Video (.mp4, .mov, .avi)';
    } else if (materialType === 'audio') {
      isValid = fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.m4a') || fileName.endsWith('.aac');
      expectedFormat = 'Audio (.mp3, .wav, .m4a, .aac)';
    } else if (materialType === 'image') {
      isValid = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.gif') || fileName.endsWith('.webp');
      expectedFormat = 'Image (.png, .jpg, .jpeg, .gif, .webp)';
    }

    if (!isValid) {
      alert(`Invalid file format! For the selected category, please upload a ${expectedFormat} file.`);
      e.target.value = ''; // Reset input
      return;
    }

    // Size Validation (50MB Limit for standard Supabase/Netlify/Vercel tiers)
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    console.log(`Uploading ${selectedFile.name} (${fileSizeMB.toFixed(2)} MB)`);

    setFile(selectedFile);
    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Generate thumbnail if applicable (first, so we know if we have a thumbnail blob)
      let thumbnailBlob: Blob | null = null;
      try {
        if (materialType === 'pdf') {
          const pdfJS = (window as any).pdfjsLib;
          if (pdfJS) {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const pdf = await pdfJS.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context!, viewport }).promise;
            thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          }
        } else if (materialType === 'word') {
          const mammoth = (window as any).mammoth;
          const html2canvas = (window as any).html2canvas;
          if (mammoth && html2canvas) {
            try {
              const arrayBuffer = await selectedFile.arrayBuffer();
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

              await new Promise(resolve => setTimeout(resolve, 500));

              const canvas = await html2canvas(container, {
                width: 800,
                height: 1000,
                scale: 0.5,
                useCORS: true,
                logging: false
              });
              document.body.removeChild(container);
              thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            } catch (err) {
              console.error('Word Thumbnail Error:', err);
            }
          }
        } else if (materialType === 'ppt') {
          const canvas = document.createElement('canvas');
          canvas.width = 800;
          canvas.height = 500;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Background: deep dark gradient
            const grad = ctx.createLinearGradient(0, 0, 800, 500);
            grad.addColorStop(0, '#1E1035');
            grad.addColorStop(0.5, '#3B1D6E');
            grad.addColorStop(1, '#6E3C96');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 500);

            // Subtle grid pattern for depth
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= 800; x += 50) {
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 500); ctx.stroke();
            }
            for (let y = 0; y <= 500; y += 50) {
              ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
            }

            // Top accent bar
            const accentGrad = ctx.createLinearGradient(0, 0, 800, 0);
            accentGrad.addColorStop(0, '#8B5CF6');
            accentGrad.addColorStop(1, '#EC4899');
            ctx.fillStyle = accentGrad;
            ctx.fillRect(0, 0, 800, 6);

            // PPT icon area (left side)
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.roundRect(40, 140, 160, 200, 20);
            ctx.fill();
            ctx.fillStyle = '#FF6B35';
            ctx.font = 'bold 52px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PPT', 120, 265);

            // Divider
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(240, 130); ctx.lineTo(240, 370); ctx.stroke();

            // File name (right side)
            ctx.fillStyle = 'white';
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'left';
            const baseName = selectedFile.name.replace(/\.(pptx?)/i, '');
            const displayName = baseName.length > 35 ? baseName.substring(0, 35) + '...' : baseName;
            // Word-wrap the name
            const words = displayName.split(' ');
            let line = '';
            let lineY = 215;
            for (const word of words) {
              const test = line + (line ? ' ' : '') + word;
              if (ctx.measureText(test).width > 490) {
                ctx.fillText(line, 270, lineY);
                line = word;
                lineY += 36;
              } else { line = test; }
            }
            if (line) ctx.fillText(line, 270, lineY);

            // Sub-label
            ctx.font = '500 16px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText('POWERPOINT PRESENTATION  ·  GTM ASSET', 270, Math.max(lineY + 50, 310));

            thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
          }
        } else if (materialType === 'video') {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(selectedFile);
          video.muted = true;
          video.playsInline = true;

          thumbnailBlob = await new Promise((resolve) => {
            video.onloadeddata = () => {
              video.currentTime = Math.min(video.duration || 2, 2);
            };
            video.onseeked = async () => {
              await new Promise(r => setTimeout(r, 500));
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
        } else if (materialType === 'audio') {
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
              ctx.moveTo(100 + i * 15, 250 - h/2);
              ctx.lineTo(100 + i * 15, 250 + h/2);
              ctx.stroke();
            }

            ctx.fillStyle = 'white';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            const title = selectedFile.name.length > 30 ? selectedFile.name.substring(0, 30) + '...' : selectedFile.name;
            ctx.fillText(title, 400, 220);

            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('AUDIO ASSET', 400, 270);

            thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          }
        } else if (materialType === 'image') {
          thumbnailBlob = await new Promise((resolve) => {
            const img = new window.Image();
            img.src = URL.createObjectURL(selectedFile);
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
      } catch (thumbErr) {
        console.error('Thumbnail generation failed:', thumbErr);
      }

      // 2. Request Presigned GCS upload URLs
      console.log('[Upload] Requesting secure upload links from server...');
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedFile.name,
          contentType: selectedFile.type || 'application/octet-stream',
          hasThumbnail: !!thumbnailBlob
        })
      });

      if (!presignRes.ok) {
        const presignText = await presignRes.text();
        let presignError = `Failed to generate upload links (${presignRes.status})`;
        let exists = false;
        try {
          const parsed = JSON.parse(presignText);
          presignError = parsed.error || presignError;
          exists = !!parsed.exists;
        } catch {}

        if (exists) {
          setDuplicateFileName(selectedFile.name);
          setShowDuplicateModal(true);
          setFile(null);
          setUploading(false);
          setUploadProgress(0);
          return;
        }
        throw new Error(presignError);
      }

      const { fileUploadUrl, storagePath, thumbnailUploadUrl, thumbnailPath } = await presignRes.json();

      // 3. Upload the main file directly to GCS via XHR (with progress tracking)
      console.log('[Upload] Uploading main file directly to storage...');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', fileUploadUrl, true);
        xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(progress);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Direct GCS upload failed with status: ${xhr.status}. Check bucket CORS configuration.`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during direct upload — CORS or connectivity issue'));
        };

        xhr.send(selectedFile);
      });
      console.log('[Upload] Main file uploaded successfully.');

      // 4. Upload the thumbnail directly to GCS if applicable
      if (thumbnailBlob && thumbnailUploadUrl) {
        console.log('[Upload] Uploading thumbnail directly to storage...');
        const thumbRes = await fetch(thumbnailUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: thumbnailBlob
        });

        if (!thumbRes.ok) {
          console.warn('[Upload] Thumbnail direct upload failed, continuing without thumbnail.');
        } else {
          console.log('[Upload] Thumbnail uploaded successfully.');
        }
      }

      // 5. Tell the backend to index the uploaded file and generate AI metadata
      console.log('[Upload] Submitting file for AI indexing and metadata extraction...');
      const indexRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          fileName: selectedFile.name,
          materialType,
          thumbnailPath: thumbnailBlob ? thumbnailPath : null
        })
      });

      if (!indexRes.ok) {
        const indexText = await indexRes.text();
        let indexError = `Indexing failed (${indexRes.status})`;
        try { indexError = JSON.parse(indexText).error || indexError; } catch {}
        throw new Error(indexError);
      }

      setFile(null);
      alert('GTM Asset uploaded and indexed successfully!');
    } catch (err: any) {
      console.error('[Upload Workflow Error]', err);
      const errorMessage = err.message || 'An unknown error occurred';
      alert(`Upload Failed: ${errorMessage}\n\nPlease check browser console for details.`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setMessages((prev) => [...prev, { role: 'bot', content: data.answer, recommendations: data.recommendations }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'bot', content: 'Error: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setMessages([]);
    setInput('');
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <Header />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }}
      />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" strategy="lazyOnload" />

      <main className="flex-1 flex flex-col lg:flex-row max-w-[1600px] mx-auto w-full pt-32 px-4 sm:px-6 lg:px-8 gap-6 pb-8">

        {/* LEFT COLUMN: Input & Management */}
        <section className="flex-1 flex flex-col gap-6 lg:max-w-xl">
          <div className="glass-card p-8 rounded-[32px] flex flex-col gap-8 h-fit animate-in fade-in slide-in-from-left duration-700">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6E3C96]/10 border border-[#6E3C96]/20 text-[#6E3C96] dark:text-[#8B5DB5] text-[10px] font-bold uppercase tracking-wider mb-4">
                <Zap className="w-3 h-3" />
                <span>Enterprise GTM Management</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
                AI-driven <span className="text-gradient">Document Management.</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                Streamline your Go-To-Market strategy. Upload your PDFs, Decks, and Briefs to our intelligent repository and interrogate them instantly.
              </p>
            </div>

            {/* Upload Area */}
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Upload className="w-4 h-4 text-brand" />
                Upload GTM Assets
              </h3>
              <div className="flex flex-col gap-3">
                <div className="relative group">
                  <select
                    className="w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 py-3 px-4 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/40 cursor-pointer transition-all"
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                  >
                    <option value="pdf">PDF Document</option>
                    <option value="ppt">PowerPoint Presentation</option>
                    <option value="word">Word Document / Brief</option>
                    <option value="video">Video / Multimedia</option>
                    <option value="audio">Audio / Podcast</option>
                    <option value="image">Image / Graphic</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                <label className="flex items-center justify-center gap-3 px-6 py-3.5 bg-[#6E3C96] hover:bg-[#5A2E7B] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#6E3C96]/20 cursor-pointer group">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                  <span className="text-sm">{file ? file.name : 'Choose GTM to Upload'}</span>
                  <input
                    type="file"
                    accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.mov,.avi,.mp3,.wav,.m4a,.aac,.png,.jpg,.jpeg,.gif,.webp"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>

                {uploading && (
                  <div className="w-full space-y-2 animate-in fade-in duration-300">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <span>Uploading to Cloud...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#6E3C96] to-[#B45309] transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mini Features */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-white/5">
                <Shield className="w-4 h-4 text-brand" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Secure Indexing</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-white/5">
                <BarChart3 className="w-4 h-4 text-brand" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">AI Retrieval</span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Output & Chat History */}
        <section className="flex-[1.5] flex flex-col min-h-[600px] lg:h-[calc(100vh-140px)] animate-in fade-in slide-in-from-right duration-700">
          <div className="glass-card flex flex-col h-full rounded-[32px] overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">GTM Intelligence Console</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />

                  </p>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-[#6E3C96] group"
                title="Clear Chat"
              >
                <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
              </button>
            </div>

            {/* Chat Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 scroll-smooth custom-scrollbar"
            >
              {messages.length === 0 && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <div className="w-20 h-20 bg-slate-200 dark:bg-white/5 rounded-[32px] flex items-center justify-center mb-6">
                    <BarChart3 className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No active intelligence found</h3>
                  <p className="text-sm max-w-xs">Ask a question below to begin searching your GTM repository.</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col gap-4 max-w-3xl",
                    m.role === 'user' ? "self-end items-end" : "self-start items-start"
                  )}
                >
                  <div className={cn(
                    "px-6 py-4 rounded-[24px] text-sm leading-relaxed shadow-sm whitespace-pre-wrap",
                    m.role === 'user'
                      ? "bg-[#6E3C96] text-white rounded-tr-none"
                      : "bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 text-slate-800 dark:text-slate-200 rounded-tl-none"
                  )}>
                    {m.content.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return (
                          <strong key={idx} className={cn("font-extrabold", m.role === 'bot' && "text-slate-950 dark:text-white")}>
                            {part.slice(2, -2)}
                          </strong>
                        );
                      }
                      return part;
                    })}
                  </div>

                  {/* Recommendations */}
                  {m.recommendations && m.recommendations.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                      {m.recommendations.map((rec: any, idx: number) => (
                        <a
                          key={idx}
                          href={rec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 hover:border-[#6E3C96]/50 hover:shadow-lg transition-all group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[#6E3C96] shrink-0 group-hover:bg-[#6E3C96] group-hover:text-white transition-colors mt-0.5">
                            {rec.type?.toUpperCase() === 'PDF' && <FileText className="w-6 h-6" />}
                            {rec.type?.toUpperCase() === 'PPT' && <span className="font-black text-xs">PPT</span>}
                            {rec.type?.toUpperCase() === 'WORD' && <span className="font-black text-xs">DOC</span>}
                            {rec.type?.toUpperCase() === 'AUDIO' && <span className="font-black text-xs">AUD</span>}
                            {rec.type?.toUpperCase() === 'VIDEO' && <span className="font-black text-xs">VID</span>}
                            {rec.type?.toUpperCase() === 'IMAGE' && <span className="font-black text-xs">IMG</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate text-slate-900 dark:text-white group-hover:text-[#6E3C96] transition-colors">{rec.name}</p>
                            {rec.summary && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                {rec.summary}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rec.type}</span>
                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                              <span className="text-[10px] text-[#6E3C96] font-bold">{Math.round(rec.similarity * 100)}% Relevancy</span>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-[#6E3C96] shrink-0 mt-1" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex flex-col items-start gap-3">
                  <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 p-5 rounded-[24px] rounded-tl-none flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#6E3C96] rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-[#6E3C96] rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-[#6E3C96] rounded-full animate-bounce" />
                    </div>
                    <span className="text-xs text-slate-500 font-medium">Scanning GTM Assets...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input Area */}
            <div className="p-8 border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
              <div className="relative group">
                <textarea
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 pr-14 rounded-2xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#6E3C96]/40 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 min-h-[80px] md:min-h-[100px] resize-none"
                  placeholder="Ask your Knowledge Base... (e.g., Which presentation covers our Enterprise Pricing?)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="absolute right-3 bottom-3 p-3 bg-[#6E3C96] hover:bg-[#5A2E7B] disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-[#6E3C96]/20 group-hover:scale-105 active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-6 rounded-[24px] max-w-sm w-full shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-500 mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Duplicate File Blocked</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A Go-To-Market document named <span className="font-semibold text-slate-800 dark:text-slate-200">"{duplicateFileName}"</span> already exists in the repository.
              </p>
            </div>
            <button
              onClick={() => {
                setShowDuplicateModal(false);
                setDuplicateFileName('');
              }}
              className="mt-2 w-full py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
// Local bulk upload disabled on production branch

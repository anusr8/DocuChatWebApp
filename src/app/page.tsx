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
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  // Upload States
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [materialType, setMaterialType] = useState('pdf');

  // Chat States
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string; recommendations?: any[] }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const CHAT_STORAGE_KEY = 'gtm_chat_history';

  // Load chat on mount
  useEffect(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
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

    const formData = new FormData();
    // --- We now send the raw file to the backend instead of uploading from client ---
    try {
      formData.append('file', selectedFile);
      formData.append('fileName', selectedFile.name);
      formData.append('materialType', materialType);

      // (We skip downloadUrl generation here, the backend will return it after uploading)

      try {
        let thumbnailBlob: Blob | null = null;

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
            const grad = ctx.createLinearGradient(0, 0, 800, 500);
            grad.addColorStop(0, '#6E3C96');
            grad.addColorStop(1, '#B45309');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 500);

            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 10; i++) {
              ctx.beginPath();
              ctx.moveTo(Math.random() * 800, 0);
              ctx.lineTo(Math.random() * 800, 500);
              ctx.stroke();
            }

            ctx.fillStyle = 'white';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            const title = selectedFile.name.length > 30 ? selectedFile.name.substring(0, 30) + '...' : selectedFile.name;
            ctx.fillText(title, 400, 220);

            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('POWERPOINT PRESENTATION', 400, 270);

            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.roundRect(350, 300, 100, 30, 15);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = 'black 12px sans-serif';
            ctx.fillText('GTM ASSET', 400, 320);

            thumbnailBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
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
        }

        if (thumbnailBlob) {
          formData.append('thumbnail', thumbnailBlob, 'thumbnail.jpg');
        }
      } catch (thumbErr) {
        console.error('Thumbnail generation failed:', thumbErr);
      }

      // --- Metadata & Indexing API Call ---
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Metadata indexing failed');
      }

      setFile(null);
      alert('GTM Asset uploaded and indexed successfully!');
    } catch (err: any) {
      console.error('[Upload Workflow Error]', err);
      const errorMessage = err.code ? `[${err.code}] ${err.message}` : err.message;
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
                    accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.mov,.avi,.mp3,.wav,.m4a,.aac"
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
                    "px-6 py-4 rounded-[24px] text-sm leading-relaxed shadow-sm",
                    m.role === 'user'
                      ? "bg-[#6E3C96] text-white rounded-tr-none"
                      : "bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 text-slate-800 dark:text-slate-200 rounded-tl-none"
                  )}>
                    {m.content}
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
                          className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 hover:border-[#6E3C96]/50 hover:shadow-lg transition-all group"
                        >
                          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[#6E3C96] shrink-0 group-hover:bg-[#6E3C96] group-hover:text-white transition-colors">
                            {rec.type === 'PDF' && <FileText className="w-6 h-6" />}
                            {rec.type === 'PPT' && <span className="font-black text-xs">PPT</span>}
                            {rec.type === 'Word' && <span className="font-black text-xs">DOC</span>}
                            {rec.type === 'Audio' && <span className="font-black text-xs">AUD</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate text-slate-900 dark:text-white group-hover:text-[#6E3C96] transition-colors">{rec.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rec.type}</span>
                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                              <span className="text-[10px] text-[#6E3C96] font-bold">{Math.round(rec.similarity * 100)}% Relevancy</span>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-[#6E3C96] shrink-0" />
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


    </div>
  );
}

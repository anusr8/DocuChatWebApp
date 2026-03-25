'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import {
    FileText,
    Video,
    File as FileIcon,
    Presentation,
    Search,
    ExternalLink,
    Download,
    Calendar,
    ArrowLeft,
    Loader2,
    X
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface GTMAsset {
    id: number;
    name: string;
    url: string;
    type: 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio';
    category?: string;
    tags?: string[];
    thumbnail_url?: string;
    similarity?: number;
    summary?: string;
    created_at: string;
}

export default function ExploreGTM() {
    const [isSearching, setIsSearching] = useState(false);
    const [assets, setAssets] = useState<GTMAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const isSemantic = searchQuery.trim().length > 2;
        let isCancelled = false;

        if (isSemantic) {
            setIsSearching(true);
            setAssets([]); // Clear previous results immediately
        } else if (searchQuery.trim().length === 0) {
            // If query is cleared, we show all assets again
            setIsSearching(false);
        }

        const fetchAssets = async () => {
            setLoading(true);
            try {
                const url = isSemantic
                    ? `/api/assets?q=${encodeURIComponent(searchQuery)}`
                    : '/api/assets';

                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch assets');
                const data = await res.json();

                if (!isCancelled) {
                    setAssets(data);
                }
            } catch (err) {
                if (!isCancelled) console.error(err);
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                    setIsSearching(false);
                }
            }
        };

        const timer = setTimeout(() => {
            fetchAssets();
        }, 500);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [searchQuery]);

    const [selectedType, setSelectedType] = useState<'All' | 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio'>('All');

    const categories: ('All' | 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio')[] = ['All', 'PDF', 'Video', 'Audio', 'Word', 'PPT'];

    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    const categoriesList = ['All', ...Array.from(new Set(assets.map(a => a.category).filter(Boolean))) as string[]];

    const filteredAssets = assets.filter(asset => {
        const isSemanticSearch = searchQuery.trim().length > 2;

        let matchesSearch = true;
        if (isSemanticSearch) {
            // STRICT FILTER: Only show what the AI returned as a match
            // During semantic search, every document SHOULD have a similarity score from the RPC
            matchesSearch = asset.similarity !== undefined && asset.similarity !== null && asset.similarity > 0;
        } else if (searchQuery.trim().length > 0) {
            // Literal string matching for short queries (1-2 chars)
            const q = searchQuery.toLowerCase();
            matchesSearch = asset.name.toLowerCase().includes(q) ||
                (asset.summary || '').toLowerCase().includes(q);
        } else {
            // If search is empty, everything matches (default state)
            matchesSearch = true;
        }

        const matchesType = selectedType === 'All' || asset.type === selectedType;
        const matchesCategory = selectedCategory === 'All' || asset.category === selectedCategory;

        return matchesSearch && matchesType && matchesCategory;
    });

    const getTypeIcon = (type: GTMAsset['type']) => {
        switch (type) {
            case 'PDF': return '/assets/icon_pdf.png';
            case 'PPT': return '/assets/icon_ppt.png';
            case 'Word': return '/assets/icon_word.png';
            case 'Video': return '/assets/icon_video.png';
            case 'Audio': return '/assets/icon_audio.png';
            default: return '/assets/icon_pdf.png';
        }
    };

    return (
        <main className="min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-white transition-colors duration-300">
            <Header />

            {/* Hero Banner Section */}
            <div className="relative h-[450px] w-full flex items-center justify-center overflow-hidden">
                {/* Background Image with Light Overlay */}
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-105"
                    style={{
                        backgroundImage: `url('/explore_hero_bk.png')`,
                        backgroundColor: '#F5F3FF' // Light Brand Fallback
                    }}
                >
                    <div className="absolute inset-0 bg-[#6E3C96]/5 dark:bg-[#6E3C96]/10 backdrop-blur-[1px]" />
                </div>

                <div className="relative z-10 text-center px-6">
                    <h1 className="text-5xl md:text-7xl font-bold text-[#6E3C96] dark:text-white tracking-tight mb-4">
                        Explore our <span className="text-brand">GTM</span>
                    </h1>
                    <div className="w-24 h-1 bg-brand mx-auto rounded-full shadow-lg shadow-brand/50" />
                </div>
            </div>

            {/* Content Section (Overlapping) */}
            <div className="relative z-20 -mt-16 max-w-7xl mx-auto px-6 pb-24">
                <div className="bg-white dark:bg-[#0F172A]/80 backdrop-blur-2xl rounded-[40px] shadow-2xl dark:shadow-brand/5 border border-slate-100 dark:border-white/5 p-8 md:p-12">

                    {/* Filter Tabs & Search */}
                    <div className="flex flex-col gap-8 mb-16 border-b border-slate-100 dark:border-white/5 pb-12">
                        <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
                            <div className="flex flex-wrap justify-center lg:justify-start gap-4 md:gap-8">
                                {categories.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedType(cat)}
                                        className={cn(
                                            "relative py-2 text-sm font-bold tracking-widest uppercase transition-all whitespace-nowrap",
                                            selectedType === cat
                                                ? "text-brand"
                                                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                                        )}
                                    >
                                        {cat}
                                        {selectedType === cat && (
                                            <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-brand animate-in fade-in zoom-in duration-300" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col items-center gap-8 w-full lg:w-fit">
                                <div className="relative w-full lg:w-[500px] group">
                                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 group-focus-within:text-brand transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Smart Search..."
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-[24px] py-7 pl-16 pr-6 text-lg outline-none focus:border-brand/50 focus:ring-8 focus:ring-brand/5 transition-all shadow-inner"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-6 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-brand"
                                            title="Clear search"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Category & Tag Filters */}
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category:</span>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-brand/50"
                                >
                                    {categoriesList.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Asset Grid */}
                    {(loading || isSearching) ? (
                        <div className="flex flex-col items-center justify-center py-32 gap-6">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-8 h-8 bg-brand/10 rounded-full animate-pulse" />
                                </div>
                            </div>
                            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs">
                                {isSearching ? 'Analyzing GTM Knowledge...' : 'Accessing GTM Intelligence...'}
                            </p>
                        </div>
                    ) : (filteredAssets.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                            {filteredAssets.map((asset) => (
                                <div
                                    key={`${asset.type}-${asset.id}`}
                                    className="group flex flex-col bg-white dark:bg-slate-900/50 rounded-3xl overflow-hidden border border-slate-100 dark:border-white/5 hover:border-brand/30 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand/10"
                                >
                                    {/* Card Header (Image/Icon Placeholder) */}
                                    <div className="relative aspect-[16/10] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                                        {asset.thumbnail_url ? (
                                            <>
                                                <img
                                                    src={asset.thumbnail_url}
                                                    alt={asset.name}
                                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-40 group-hover:opacity-60 transition-opacity" />
                                                <div className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                                    <div className="relative w-6 h-6">
                                                        <Image src={getTypeIcon(asset.type)} alt={asset.type} fill className="object-contain" />
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                                                <div className="absolute inset-0 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                                                    <div className="relative w-32 h-32 md:w-36 md:h-36 drop-shadow-2xl">
                                                        <Image
                                                            src={getTypeIcon(asset.type)}
                                                            alt={asset.type}
                                                            fill
                                                            className="object-contain"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-5 flex-1 flex flex-col">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-brand bg-brand/5 px-2 py-0.5 rounded-full">
                                                {asset.category || 'GTM'}
                                            </span>
                                            <div className="flex items-center gap-1 text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                                                <Calendar className="w-2.5 h-2.5" />
                                                <span>{new Date(asset.created_at).toLocaleDateString(undefined, { year: 'numeric' })}</span>
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-4 line-clamp-2 transition-colors group-hover:text-brand">
                                            {asset.name}
                                        </h3>

                                        {asset.tags && asset.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-6">
                                                {asset.tags.slice(0, 3).map(tag => (
                                                    <span key={tag} className="text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-auto flex flex-col gap-3">
                                            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                                                <Calendar className="w-3 h-3" />
                                                <span>{new Date(asset.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                            </div>

                                            <a
                                                href={asset.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 text-slate-900 dark:text-white font-black text-[11px] uppercase tracking-widest group/link border-b-2 border-brand pb-1 w-fit hover:border-brand-dark transition-all"
                                            >
                                                <span>Read More</span>
                                                <ExternalLink className="w-3 h-3 group-hover/link:translate-x-1 group-hover/link:-translate-y-1 transition-transform" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-40 text-center">
                            <div className="w-24 h-24 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-8">
                                <Search className="w-10 h-10 text-slate-200 dark:text-slate-700" />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">No results found</h3>
                            <p className="text-slate-500 max-w-xs mx-auto mb-10 text-sm leading-relaxed">We couldn't find any GTM assets matching your current selection.</p>
                            <button
                                onClick={() => { setSelectedType('All'); setSearchQuery(''); }}
                                className="px-10 py-4 bg-brand hover:bg-brand-dark text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                            >
                                Reset Filters
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}

'use client';

import { useState, useEffect, useRef } from 'react';
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
    X,
    Trash2,
    Camera,
    AlignLeft,
    ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { ArrowRight as SearchArrow } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface GTMAsset {
    id: string; // Changed to string for Firestore compatibility
    name: string;
    url: string;
    type: 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio' | 'Image';
    category?: string;
    tags?: string[];
    thumbnail_url?: string;
    similarity?: number;
    summary?: string;
    created_at: string;
}

export default function ExploreGTM() {
    const [isSearching, setIsSearching] = useState(false);
    const [isVisualSearching, setIsVisualSearching] = useState(false);
    const [isMultiLine, setIsMultiLine] = useState(false);
    const [assets, setAssets] = useState<GTMAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchImagePreview, setSearchImagePreview] = useState<string | null>(null);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchInputRef = useRef<HTMLTextAreaElement>(null);

    const loadingTexts = [
        'Searching database...',
        'Fetching results...',
        'Analyzing GTM Knowledge...',
        'Extracting insights...',
        'Running AI verification...'
    ];
    const [loadingTextIndex, setLoadingTextIndex] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (loading || isSearching || isVisualSearching) {
            interval = setInterval(() => {
                setLoadingTextIndex(prev => (prev + 1) % loadingTexts.length);
            }, 1500);
        } else {
            setLoadingTextIndex(0);
        }
        return () => clearInterval(interval);
    }, [loading, isSearching, isVisualSearching]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const [currentPage, setCurrentPage] = useState(1);
    const [paginationData, setPaginationData] = useState<{
        totalPages: number;
        totalAssets: number;
        pageSize: number;
    } | null>(null);

    const [selectedType, setSelectedType] = useState<'All' | 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio' | 'Image'>('All');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    const handleClearSearch = () => {
        setSearchQuery('');
        setSearchInput('');
        setSearchImagePreview(null);
        setIsSearching(false);
        setIsVisualSearching(false);
        setCurrentPage(1);
        fetchAssets('', 1);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this asset? This will also remove all indexed slides.')) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/assets/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Delete failed');
            
            // Update UI
            setAssets(prev => prev.filter(a => a.id !== id));
            alert('Asset deleted successfully.');
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete asset.');
        } finally {
            setLoading(false);
        }
    };

    const handleImageSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Set preview
        const reader = new FileReader();
        reader.onloadend = () => setSearchImagePreview(reader.result as string);
        reader.readAsDataURL(file);

        setIsVisualSearching(true);
        setLoading(true);
        setSearchQuery(''); // Clear text search
        setSearchInput('');
        setCurrentPage(1);

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/assets/visual-search', {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Visual search failed');
            const data = await res.json();
            
            // Map visual search results to GTMAsset format
            const formattedAssets = data.results.map((res: any) => ({
                id: res.id,
                assetId: res.assetId,
                name: `${res.assetName} (Slide ${res.slideNumber})`,
                url: res.assetUrl || '#',
                type: res.type || 'PPT',
                category: res.category || 'PPT',
                thumbnail_url: res.thumbnail_url,
                summary: res.description,
                similarity: res.similarity,
                created_at: res.created_at || new Date().toISOString()
            }));
            
            setAssets(formattedAssets);
            setPaginationData({
                totalPages: 1,
                totalAssets: formattedAssets.length,
                pageSize: formattedAssets.length
            });
        } catch (err) {
            console.error('Visual search error:', err);
        } finally {
            setLoading(false);
            setIsVisualSearching(false);
        }
    };

    const fetchAssets = async (queryOverride?: string, pageOverride?: number) => {
        const query = queryOverride !== undefined ? queryOverride : searchInput;
        const page = pageOverride !== undefined ? pageOverride : currentPage;
        const isSemantic = query.trim().length > 2;

        if (isSemantic) {
            setIsSearching(true);
            setAssets([]); // Clear previous results immediately
        } else if (query.trim().length === 0) {
            setIsSearching(false);
        }

        setLoading(true);
        try {
            const url = isSemantic
                ? `/api/assets?q=${encodeURIComponent(query)}`
                : `/api/assets?page=${page}&limit=12`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch assets');
            const data = await res.json();

            setAssets(data.assets || []);
            setPaginationData(data.pagination || null);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setIsSearching(false);
        }
    };

    // Initial fetch and pagination
    useEffect(() => {
        if (!isVisualSearching && !searchImagePreview && searchQuery.trim().length === 0) {
            fetchAssets();
        }
    }, [currentPage]);



    const handleManualSearch = () => {
        if (isVisualSearching || searchImagePreview) return;
        setSearchQuery(searchInput); // Update the query used for filtering
        fetchAssets(searchInput);
        searchInputRef.current?.blur();
    };

    const categories: ('All' | 'PDF' | 'PPT' | 'Word' | 'Video' | 'Audio' | 'Image')[] = ['All', 'PDF', 'Video', 'Audio', 'Word', 'PPT', 'Image'];

    const categoriesList = ['All', ...Array.from(new Set(assets.map(a => a.category).filter(Boolean))) as string[]];

    const filteredAssets = assets.filter(asset => {
        const isSemanticSearch = searchQuery.trim().length > 2;
        const isVisualSearch = !!searchImagePreview;

        let matchesSearch = true;
        if (isVisualSearch) {
            matchesSearch = true; // Visual search results are already filtered by the API
        } else if (isSemanticSearch) {
            // STRICT FILTER: Only show what the AI returned as a match
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
            case 'Image': return '/assets/icon_image.png';
            default: return '/assets/icon_pdf.png';
        }
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

            {/* Search Bar Section */}
            <div className="relative z-40 -mt-10 mb-16">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-block w-full max-w-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[32px] shadow-2xl border border-slate-100 dark:border-white/5 p-2 transition-all hover:shadow-brand/10 hover:border-brand/30">
                        <div className="relative w-full group">
                            <Search className={cn(
                                "absolute left-6 text-slate-400 group-focus-within:text-brand transition-colors",
                                isMultiLine ? "top-8" : "top-1/2 -translate-y-1/2"
                            )} />
                            
                                <textarea
                                    ref={searchInputRef}
                                    placeholder={searchImagePreview ? "Searching by image..." : "Search by text or upload slide..."}
                                    className={cn(
                                        "w-full bg-transparent text-lg outline-none resize-none overflow-hidden transition-all",
                                        searchImagePreview ? "pl-28" : "pl-16",
                                        isMultiLine ? "py-7 pr-44 h-40" : "py-6 pr-44 h-[72px] leading-[24px]"
                                    )}
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleManualSearch();
                                        }
                                    }}
                                    disabled={!!searchImagePreview}
                                    rows={isMultiLine ? 5 : 1}
                                />

                            {/* Image Search Preview */}
                            {searchImagePreview && (
                                <div className={cn(
                                    "absolute left-14 w-10 h-10 rounded-lg overflow-hidden border-2 border-brand shadow-sm animate-in zoom-in duration-300",
                                    isMultiLine ? "top-6" : "top-1/2 -translate-y-1/2"
                                )}>
                                    <img src={searchImagePreview} alt="Search Preview" className="w-full h-full object-cover" />
                                </div>
                            )}

                            <div className={cn(
                                "absolute right-3 flex items-center gap-2",
                                isMultiLine ? "top-7" : "top-1/2 -translate-y-1/2"
                            )}>
                                <button 
                                    onClick={handleManualSearch}
                                    className="p-2 bg-brand hover:bg-brand-dark text-white rounded-xl transition-all shadow-lg shadow-brand/20 group-hover:scale-105 active:scale-95 flex items-center justify-center"
                                    title="Search"
                                >
                                    <SearchArrow className="w-4 h-4" />
                                </button>

                                <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-1" />

                                <button 
                                    onClick={() => setIsMultiLine(!isMultiLine)}
                                    className={cn(
                                        "p-2 rounded-full transition-colors",
                                        isMultiLine ? "bg-brand/10 text-brand" : "text-slate-400 hover:text-brand hover:bg-slate-100 dark:hover:bg-white/10"
                                    )}
                                    title={isMultiLine ? "Switch to single line" : "Switch to multi-line search"}
                                >
                                    <AlignLeft className="w-5 h-5" />
                                </button>

                                <label className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-brand cursor-pointer" title="Visual Search (PPT Only)">
                                    <Camera className="w-6 h-6" />
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={handleImageSearch}
                                    />
                                </label>
                                {(searchQuery || searchImagePreview) && (
                                    <button
                                        onClick={handleClearSearch}
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-brand"
                                        title="Clear search"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Section (Overlapping) */}
            <div className="relative z-20 max-w-7xl mx-auto px-6 pb-24">
                <div className="bg-white dark:bg-[#0F172A]/80 backdrop-blur-2xl rounded-[40px] shadow-2xl dark:shadow-brand/5 border border-slate-100 dark:border-white/5 p-8 md:p-12">

                    {/* Filter Tabs */}
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
                            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs animate-pulse">
                                {loadingTexts[loadingTextIndex]}
                            </p>
                        </div>
                    ) : (
                        <>
                            {filteredAssets.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                                    {filteredAssets.map((asset) => (
                                        <div
                                            key={`${asset.type}-${asset.id}`}
                                            onClick={() => window.open(asset.url, '_blank')}
                                            className="group flex flex-col bg-white dark:bg-slate-900/50 rounded-3xl overflow-hidden border border-slate-100 dark:border-white/5 hover:border-brand/30 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand/10 cursor-pointer"
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
                                                        
                                                        {/* Delete Button */}
                                                        <button 
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(asset.id); }}
                                                            className="absolute top-3 left-3 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 text-slate-400 hover:text-red-500 z-30"
                                                            title="Delete Asset"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>

                                                        <div className="absolute top-3 right-3 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                                            <div className="relative w-6 h-6">
                                                                <Image src={getTypeIcon(asset.type)} alt={asset.type} fill className="object-contain" />
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                                                        
                                                        {/* Delete Button (Fallback) */}
                                                        <button 
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(asset.id); }}
                                                            className="absolute top-3 left-3 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 text-slate-400 hover:text-red-500 z-30"
                                                            title="Delete Asset"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>

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

                                                    <div className="inline-flex items-center gap-2 text-slate-900 dark:text-white font-black text-[11px] uppercase tracking-widest group/link border-b-2 border-brand pb-1 w-fit hover:border-brand-dark transition-all">
                                                        <span>Read More</span>
                                                        <ExternalLink className="w-3 h-3 group-hover/link:translate-x-1 group-hover/link:-translate-y-1 transition-transform" />
                                                    </div>
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
                                        onClick={() => { setSelectedType('All'); setSearchQuery(''); setCurrentPage(1); }}
                                        className="px-10 py-4 bg-brand hover:bg-brand-dark text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                                    >
                                        Reset Filters
                                    </button>
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {!loading && !isSearching && paginationData && paginationData.totalPages > 1 && (
                                <div className="mt-16 flex flex-col items-center gap-6 border-t border-slate-100 dark:border-white/5 pt-12">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                        >
                                            Previous
                                        </button>
                                        
                                        <div className="flex items-center gap-1 mx-4">
                                            {Array.from({ length: Math.min(paginationData.totalPages, 5) }, (_, i) => {
                                                // Show surrounding pages if there are many
                                                let pageNum = i + 1;
                                                if (paginationData.totalPages > 5) {
                                                    if (currentPage > 3) pageNum = currentPage - 3 + i + 1;
                                                    if (pageNum > paginationData.totalPages) pageNum = paginationData.totalPages - 4 + i;
                                                }
                                                return pageNum;
                                            }).filter(p => p > 0 && p <= paginationData.totalPages).map((pageNum) => (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={cn(
                                                        "w-10 h-10 rounded-xl text-xs font-bold transition-all",
                                                        currentPage === pageNum 
                                                            ? "bg-brand text-white shadow-lg shadow-brand/20" 
                                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    {pageNum}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1))}
                                            disabled={currentPage === paginationData.totalPages}
                                            className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                        >
                                            Next
                                        </button>
                                    </div>
                                    
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                        Page {currentPage} of {paginationData.totalPages} • Total {paginationData.totalAssets} GTM Assets
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

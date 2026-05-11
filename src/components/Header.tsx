import { useState } from 'react';
import { ChevronDown, Menu, X, LogOut, User as UserIcon, Shield, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '@/lib/AuthContext';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    const isActive = (path: string) => pathname === path;

    const navItems = [
        { label: 'Home', href: '/' },
        { label: 'Explore GTM', href: '/explore' },
        ...(user?.email === 'admin@10xds.com' || user?.role === 'admin' 
            ? [{ label: 'Manage Users', href: '/admin/users' }] 
            : [])
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-brand/10 dark:border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">
                    {/* Logo */}
                    <div className="flex-shrink-0 flex items-center">
                        <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">
                            10xDS GTM Navigator
                        </span>
                    </div>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-2">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full transition-all",
                                    isActive(item.href)
                                        ? "bg-brand/10 text-brand border border-brand/20"
                                        : "text-slate-500 dark:text-slate-400 hover:text-brand dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                {item.label}
                            </Link>
                        ))}

                        <div className="pl-4 ml-2 border-l border-brand/10 dark:border-white/10 flex items-center gap-4">
                            <ThemeToggle />
                            {user ? (
                                <div className="relative group">
                                    <button className="flex items-center gap-3 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-all outline-none">
                                        <div className="w-8 h-8 rounded-full bg-[#6E3C96]/10 flex items-center justify-center border border-[#6E3C96]/20">
                                            <UserIcon className="w-4 h-4 text-[#6E3C96]" />
                                        </div>
                                        <ChevronDown className="w-4 h-4 text-slate-400 group-hover:rotate-180 transition-transform duration-300" />
                                    </button>

                                    {/* Dropdown Menu */}
                                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-[60]">
                                        <div className="px-4 py-4 border-b border-slate-50 dark:border-white/5">
                                            <p className="text-[10px] font-black text-[#6E3C96] uppercase tracking-widest mb-1">Signed in as</p>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1 flex items-center gap-1.5">
                                                <Shield className="w-3 h-3" />
                                                ID: {user.id.substring(0, 8)}...
                                            </p>
                                        </div>
                                        
                                        <div className="p-1">
                                            {user.role === 'admin' && (
                                                <Link 
                                                    href="/admin/users"
                                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                                >
                                                    <Users className="w-4 h-4" />
                                                    Manage Users
                                                </Link>
                                            )}
                                            <button 
                                                onClick={() => signOut()}
                                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout Account
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Link 
                                    href="/login"
                                    className="px-5 py-2 bg-[#6E3C96] text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#5D3280] transition-all shadow-lg shadow-[#6E3C96]/20"
                                >
                                    Login
                                </Link>
                            )}

                        </div>
                    </nav>

                    {/* Mobile menu button */}
                    <div className="md:hidden flex items-center gap-4">
                        <ThemeToggle />
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="text-slate-600 dark:text-slate-300 p-2 hover:text-brand dark:hover:text-white"
                        >
                            {isMenuOpen ? <X /> : <Menu />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Navigation */}
            {isMenuOpen && (
                <div className="md:hidden glass border-t border-brand/10 dark:border-white/5 p-4 flex flex-col gap-2 animate-in slide-in-from-top duration-300">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMenuOpen(false)}
                            className={cn(
                                "text-sm font-bold uppercase tracking-widest px-4 py-3 rounded-xl transition-all",
                                isActive(item.href)
                                    ? "bg-brand/10 text-brand border border-brand/20"
                                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                            )}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            )}
        </header>
    );
}

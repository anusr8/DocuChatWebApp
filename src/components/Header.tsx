import { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function Header() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    const navItems = [
        { label: 'Home', href: '/' },
        { label: 'Explore GTM', href: '/explore' }
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

                        <div className="pl-4 ml-2 border-l border-brand/10 dark:border-white/10">
                            <ThemeToggle />
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

'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    // Avoid hydration mismatch
    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <div className="w-10 h-10 rounded-xl glass animate-pulse" />
        )
    }

    return (
        <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-xl glass border border-white/10 dark:border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-yellow-400 group-hover:rotate-45 transition-transform" />
            ) : (
                <Moon className="w-5 h-5 text-purple-600 group-hover:-rotate-12 transition-transform" />
            )}
        </button>
    )
}

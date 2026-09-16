import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'

const THEME_STORAGE_KEY = 'app-theme'
const DARK_CLASS = 'dark-theme'

type ThemeMode = 'light' | 'dark'

type ThemeContextValue = {
    isDark: boolean
    mode: ThemeMode
    setDarkMode: (next: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialThemeMode(): ThemeMode {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(() => getInitialThemeMode())
    const isDark = mode === 'dark'

    useEffect(() => {
        const root = document.documentElement
        root.classList.toggle(DARK_CLASS, isDark)
        localStorage.setItem(THEME_STORAGE_KEY, mode)
    }, [isDark, mode])

    const setDarkMode = useCallback((next: boolean) => {
        setMode(next ? 'dark' : 'light')
    }, [])

    const value = useMemo(
        () => ({
            isDark,
            mode,
            setDarkMode,
        }),
        [isDark, mode, setDarkMode]
    )

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    )
}

export function useThemeMode() {
    const ctx = useContext(ThemeContext)
    if (!ctx) {
        throw new Error('useThemeMode must be used within ThemeProvider')
    }
    return ctx
}

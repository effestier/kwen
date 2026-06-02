// Theme React hooks and context
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Theme } from './themes';
import {
  getStoredTheme,
  setStoredTheme,
  loadThemeFromDatabase,
  syncThemeToDatabase,
  subscribeToSystemTheme,
} from './local-storage';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => Promise<void>;
  isLoading: boolean;
  themeSource: 'localStorage' | 'database' | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

// Resolve theme synchronously (no async, no flash)
function resolveThemeSync(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

// Apply theme to DOM immediately
function applyThemeToDOM(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.classList.toggle('light', resolved === 'light');
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Initialize synchronously from localStorage to prevent flash
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return initialTheme || 'system';
    const stored = getStoredTheme();
    return stored || initialTheme || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    return resolveThemeSync(theme);
  });

  const [isLoading, setIsLoading] = useState(false);
  const [themeSource, setThemeSource] = useState<'localStorage' | 'database' | null>(null);

  // Apply theme to DOM on mount (synchronous, before paint)
  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, []);

  // Load from DB in background (for authenticated users)
  useEffect(() => {
    let cancelled = false;

    async function loadFromDB() {
      try {
        const dbTheme = await loadThemeFromDatabase(supabase);
        if (!cancelled && dbTheme) {
          setThemeState(dbTheme);
          setThemeSource('database');
          setStoredTheme(dbTheme);
          const resolved = resolveThemeSync(dbTheme);
          setResolvedTheme(resolved);
          applyThemeToDOM(resolved);
        }
      } catch {
        // Ignore DB errors
      }
    }

    loadFromDB();
    return () => { cancelled = true; };
  }, []);

  // Apply theme to document when theme changes
  useEffect(() => {
    const resolved = resolveThemeSync(theme);
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved);
  }, [theme]);

  // Subscribe to system theme changes (only when theme is 'system')
  useEffect(() => {
    if (theme !== 'system') return;

    const unsubscribe = subscribeToSystemTheme((systemTheme) => {
      setResolvedTheme(systemTheme);
      applyThemeToDOM(systemTheme);
    });

    return unsubscribe;
  }, [theme]);

  // Theme change handler
  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);

    // Sync to database if authenticated
    await syncThemeToDatabase(newTheme, supabase);
    setThemeSource('database');
  }, [supabase]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        isLoading,
        themeSource,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook to get current resolved theme (actual light/dark, not system preference)
export function useResolvedTheme() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme;
}

// Hook to check if dark mode
export function useIsDarkMode() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark';
}
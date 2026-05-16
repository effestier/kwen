// Theme React hooks and context
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Theme,
  lightTheme,
  darkTheme,
  getThemeByName,
  getSystemTheme,
} from './themes';
import {
  getStoredTheme,
  setStoredTheme,
  getInitialTheme,
  syncThemeToDatabase,
  subscribeToSystemTheme,
  getThemeSource,
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

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initialTheme || 'system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [isLoading, setIsLoading] = useState(true);
  const [themeSource, setThemeSource] = useState<'localStorage' | 'database' | null>(null);
  const supabase = createClient();

  // Initialize theme on mount
  useEffect(() => {
    const init = async () => {
      try {
        const initial = await getInitialTheme(supabase);
        setThemeState(initial);
        setThemeSource(getThemeSource());

        // Resolve system theme
        const resolved = getThemeByName(initial);
        setResolvedTheme(resolved.isDark ? 'dark' : 'light');
      } catch (error) {
        console.error('Theme initialization error:', error);
        setThemeState('system');
        setResolvedTheme('light');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (isLoading) return;

    const resolved = theme === 'system' ? getSystemTheme() : getThemeByName(theme);
    const isDark = resolved.isDark;

    // Apply to document
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);

    setResolvedTheme(isDark ? 'dark' : 'light');
  }, [theme, isLoading]);

  // Subscribe to system theme changes
  useEffect(() => {
    if (theme !== 'system') return;

    const unsubscribe = subscribeToSystemTheme((systemTheme) => {
      setResolvedTheme(systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
      document.documentElement.classList.toggle('dark', systemTheme === 'dark');
      document.documentElement.classList.toggle('light', systemTheme === 'light');
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
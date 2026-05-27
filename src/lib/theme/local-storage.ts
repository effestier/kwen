// Theme persistence utilities
// Handles both localStorage (guest) and DB (authenticated) fallback

import type { Theme } from './themes';

const THEME_KEY = 'app_theme';
const THEME_SOURCE_KEY = 'app_theme_source'; // 'localStorage' | 'database'

const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];

export const getStoredTheme = (): Theme | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (!stored || !VALID_THEMES.includes(stored as Theme)) return null;
    return stored as Theme;
  } catch {
    return null;
  }
};

export const setStoredTheme = (theme: Theme): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(THEME_SOURCE_KEY, 'localStorage');
  } catch {
    // Fail silently
  }
};

export const getThemeSource = (): 'localStorage' | 'database' | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(THEME_SOURCE_KEY) as 'localStorage' | 'database' | null;
  } catch {
    return null;
  }
};

// Sync theme to database when user logs in
export const syncThemeToDatabase = async (
  theme: Theme,
  supabase: any
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('user_settings')
      .update({
        theme: theme,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    localStorage.setItem(THEME_SOURCE_KEY, 'database');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

// Load theme from database (for authenticated users)
export const loadThemeFromDatabase = async (
  supabase: any
): Promise<Theme | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_settings')
      .select('theme')
      .eq('user_id', user.id)
      .single();

    if (error || !data?.theme) return null;
    return data.theme as Theme;
  } catch {
    return null;
  }
};

// Get initial theme on app load
export const getInitialTheme = async (
  supabase?: any
): Promise<Theme> => {
  // Priority: DB (if authenticated) > localStorage > system > light
  if (supabase) {
    const dbTheme = await loadThemeFromDatabase(supabase);
    if (dbTheme) {
      if (typeof window !== 'undefined') localStorage.setItem(THEME_SOURCE_KEY, 'database');
      return dbTheme;
    }
  }

  const stored = getStoredTheme();
  if (stored) {
    localStorage.setItem(THEME_SOURCE_KEY, 'localStorage');
    return stored;
  }

  // System preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    localStorage.setItem(THEME_SOURCE_KEY, 'localStorage');
    return isSystemDark ? 'dark' : 'light';
  }

  return 'light';
};

// Listen for system theme changes
export const subscribeToSystemTheme = (
  callback: (theme: 'light' | 'dark') => void
): (() => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };

  mediaQuery.addEventListener('change', handler);

  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
};
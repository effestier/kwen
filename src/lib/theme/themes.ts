// Design System Theme Tokens
// Full premium theme architecture with light/dark/system support

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Borders
  borderSubtle: string;
  borderSoft: string;
  borderStrong: string;

  // Accent
  accentPrimary: string;
  accentHover: string;
  accentSecondary: string;
  accentMuted: string;

  // Semantic
  destructive: string;
  success: string;
  warning: string;
  info: string;

  // Surface
  overlay: string;
  modalBg: string;
  inputBg: string;
  cardBg: string;
  tooltipBg: string;

  // Special
  storyBg: string;
  gradientStart: string;
  gradientEnd: string;

  // Shadows
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowXl: string;
}

export interface ThemeConfig {
  name: Theme;
  colors: ThemeColors;
  isDark: boolean;
}

export const lightTheme: ThemeConfig = {
  name: 'light',
  isDark: false,
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f8f9fa',
    bgTertiary: '#f1f3f4',
    bgElevated: '#ffffff',

    textPrimary: '#1a1a1a',
    textSecondary: '#5f6368',
    textMuted: '#80868b',
    textInverse: '#ffffff',

    borderSubtle: '#e8eaed',
    borderSoft: '#dadce0',
    borderStrong: '#5f6368',

    accentPrimary: '#0095f6',
    accentHover: '#0077d6',
    accentSecondary: '#e8f0fe',
    accentMuted: '#cce4f7',

    destructive: '#dc3545',
    success: '#28a745',
    warning: '#ffc107',
    info: '#17a2b8',

    overlay: 'rgba(0, 0, 0, 0.5)',
    modalBg: '#ffffff',
    inputBg: '#f8f9fa',
    cardBg: '#ffffff',
    tooltipBg: '#323232',

    storyBg: '#000000',
    gradientStart: '#833ab4',
    gradientEnd: '#fd1d1d',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.1)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.1)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    shadowXl: '0 20px 25px rgba(0, 0, 0, 0.15)',
  },
};

export const darkTheme: ThemeConfig = {
  name: 'dark',
  isDark: true,
  colors: {
    bgPrimary: '#000000',
    bgSecondary: '#121212',
    bgTertiary: '#1e1e1e',
    bgElevated: '#1e1e1e',

    textPrimary: '#f8f9fa',
    textSecondary: '#9aa0a6',
    textMuted: '#5f6368',
    textInverse: '#000000',

    borderSubtle: '#303030',
    borderSoft: '#3c4043',
    borderStrong: '#9aa0a6',

    accentPrimary: '#0095f6',
    accentHover: '#64b5f6',
    accentSecondary: '#1e3a5f',
    accentMuted: '#1a3a5f',

    destructive: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
    info: '#38bdf8',

    overlay: 'rgba(0, 0, 0, 0.7)',
    modalBg: '#1e1e1e',
    inputBg: '#121212',
    cardBg: '#1e1e1e',
    tooltipBg: '#323232',

    storyBg: '#000000',
    gradientStart: '#833ab4',
    gradientEnd: '#fd1d1d',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    shadowXl: '0 20px 25px rgba(0, 0, 0, 0.6)',
  },
};

export const getSystemTheme = (): ThemeConfig => {
  if (typeof window === 'undefined') return lightTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? darkTheme : lightTheme;
};

export const getThemeByName = (name: Theme): ThemeConfig => {
  switch (name) {
    case 'dark':
      return darkTheme;
    case 'light':
      return lightTheme;
    case 'system':
      return getSystemTheme();
    default:
      return lightTheme;
  }
};

// Spacing system (8px base)
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  xxxl: '64px',
};

// Border radius scale
export const radius = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};

// Typography scale
export const typography = {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fontSize: {
    xs: '11px',
    sm: '12px',
    base: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
};

// Transitions
export const transitions = {
  fast: '150ms ease',
  normal: '200ms ease',
  slow: '300ms ease',
  spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// Z-index scale
export const zIndex = {
  base: '0',
  dropdown: '100',
  sticky: '200',
  modal: '300',
  popover: '400',
  tooltip: '500',
  toast: '600',
};
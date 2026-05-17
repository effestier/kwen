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
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F8FAFC',
    bgTertiary: '#F1F5F9',
    bgElevated: '#FFFFFF',

    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textInverse: '#FFFFFF',

    borderSubtle: '#E2E8F0',
    borderSoft: '#CBD5E1',
    borderStrong: '#475569',

    accentPrimary: '#2563EB',
    accentHover: '#1D4ED8',
    accentSecondary: '#DBEAFE',
    accentMuted: '#BFDBFE',

    destructive: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
    info: '#0891B2',

    overlay: 'rgba(0, 0, 0, 0.4)',
    modalBg: '#FFFFFF',
    inputBg: '#F8FAFC',
    cardBg: '#FFFFFF',
    tooltipBg: '#1E293B',

    storyBg: '#000000',
    gradientStart: '#833ab4',
    gradientEnd: '#fd1d1d',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.07)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    shadowXl: '0 20px 25px rgba(0, 0, 0, 0.15)',
  },
};

export const darkTheme: ThemeConfig = {
  name: 'dark',
  isDark: true,
  colors: {
    bgPrimary: '#0B1120',
    bgSecondary: '#111827',
    bgTertiary: '#1F2937',
    bgElevated: '#111827',

    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textInverse: '#0B1120',

    borderSubtle: '#1F2937',
    borderSoft: '#374151',
    borderStrong: '#94A3B8',

    accentPrimary: '#3B82F6',
    accentHover: '#60A5FA',
    accentSecondary: '#1E3A5F',
    accentMuted: '#172554',

    destructive: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
    info: '#38BDF8',

    overlay: 'rgba(0, 0, 0, 0.6)',
    modalBg: '#111827',
    inputBg: '#111827',
    cardBg: '#111827',
    tooltipBg: '#1F2937',

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
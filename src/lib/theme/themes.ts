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
    bgSecondary: '#FAFAFA',
    bgTertiary: '#EFEFEF',
    bgElevated: '#FFFFFF',

    textPrimary: '#000000',
    textSecondary: '#262626',
    textMuted: '#8E8E8E',
    textInverse: '#FFFFFF',

    borderSubtle: '#DBDBDB',
    borderSoft: '#C7C7C7',
    borderStrong: '#8E8E8E',

    accentPrimary: '#000000',
    accentHover: '#262626',
    accentSecondary: '#DBDBDB',
    accentMuted: '#EFEFEF',

    destructive: '#ED4956',
    success: '#42D67D',
    warning: '#F7B928',
    info: '#000000',

    overlay: 'rgba(0, 0, 0, 0.65)',
    modalBg: '#FFFFFF',
    inputBg: '#FAFAFA',
    cardBg: '#FFFFFF',
    tooltipBg: '#262626',

    storyBg: '#000000',
    gradientStart: '#833ab4',
    gradientEnd: '#fd1d1d',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.06)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.08)',
    shadowLg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    shadowXl: '0 20px 25px rgba(0, 0, 0, 0.15)',
  },
};

export const darkTheme: ThemeConfig = {
  name: 'dark',
  isDark: true,
  colors: {
    bgPrimary: '#000000',
    bgSecondary: '#0F0F0F',
    bgTertiary: '#161616',
    bgElevated: '#121212',

    textPrimary: '#FFFFFF',
    textSecondary: '#F2F2F2',
    textMuted: '#A8A8A8',
    textInverse: '#000000',

    borderSubtle: '#262626',
    borderSoft: '#3A3A3A',
    borderStrong: '#555555',

    accentPrimary: '#FFFFFF',
    accentHover: '#F2F2F2',
    accentSecondary: '#262626',
    accentMuted: '#161616',

    destructive: '#ED4956',
    success: '#42D67D',
    warning: '#F7B928',
    info: '#A8A8A8',

    overlay: 'rgba(0, 0, 0, 0.75)',
    modalBg: '#121212',
    inputBg: '#121212',
    cardBg: '#121212',
    tooltipBg: '#3A3A3A',

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
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
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
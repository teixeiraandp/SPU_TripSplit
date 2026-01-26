/**
 * TripSplit Theme
 * Dark theme with cyan accents matching the mockup design
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#6b7280',
    background: '#ffffff',
    backgroundSecondary: '#f9fafb',
    tint: '#38bdf8',
    tintSecondary: '#a855f7',
    border: '#e5e7eb',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#38bdf8',
    success: '#22c55e',
    successLight: '#bbf7d0',
    error: '#ef4444',
    errorLight: '#fca5a5',
    warning: '#f59e0b',
    card: '#ffffff',
  },
  dark: {
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    textTertiary: '#6b7280',
    background: '#0f172a',
    backgroundSecondary: '#1e293b',
    backgroundTertiary: '#020617',
    tint: '#38bdf8',
    tintSecondary: '#a855f7',
    border: '#1f2937',
    borderSecondary: '#374151',
    icon: '#9BA1A6',
    tabIconDefault: '#6b7280',
    tabIconSelected: '#38bdf8',
    success: '#22c55e',
    successLight: '#bbf7d0',
    successDark: '#166534',
    error: '#ef4444',
    errorLight: '#fca5a5',
    errorDark: '#991b1b',
    warning: '#f59e0b',
    card: '#0f172a',
    cardSecondary: 'rgba(15, 23, 42, 0.9)',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  full: 999,
};

export const FontSizes = {
  xs: 10,
  sm: 11,
  md: 12,
  base: 13,
  lg: 14,
  xl: 15,
  '2xl': 16,
  '3xl': 20,
  '4xl': 22,
  '5xl': 32,
};
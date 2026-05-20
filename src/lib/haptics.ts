/**
 * Haptic feedback utility.
 * Uses Capacitor Haptics on native, no-op on web.
 */

import { isNativePlatform } from './platform'

export function hapticLight() {
  if (isNativePlatform() && (window as any).__haptics) {
    (window as any).__haptics.light()
  }
}

export function hapticMedium() {
  if (isNativePlatform() && (window as any).__haptics) {
    (window as any).__haptics.medium()
  }
}

export function hapticHeavy() {
  if (isNativePlatform() && (window as any).__haptics) {
    (window as any).__haptics.heavy()
  }
}

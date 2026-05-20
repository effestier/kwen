export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
}

export function isWebPlatform(): boolean {
  return !isNativePlatform();
}

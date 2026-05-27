import { isNativePlatform } from './platform';
import { hasOverlay, dismissTopOverlay } from './overlay-stack';

let lastBackTime = 0;

/**
 * Request microphone permission on native platform.
 * Returns true if granted, false if denied.
 * On web, always returns true (browser handles its own permission prompt).
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;

  try {
    // Request permission via getUserMedia — works on both web and Capacitor
    // with RECORD_AUDIO in AndroidManifest.xml
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

export async function initCapacitor() {
  if (!isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    const { App } = await import('@capacitor/app');
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');

    // Status bar — disable overlay so WebView sits below status bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0a0a0b' });
    await StatusBar.setOverlaysWebView({ overlay: false });

    // Keyboard
    await Keyboard.setResizeMode({ mode: KeyboardResize.Ionic });

    // Don't hide splash here — the landing page or auth-guard will hide it
    // after the redirect completes. This prevents the landing page from flashing.

    // Make haptics available globally
    (window as any).__haptics = {
      light: () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}),
      medium: () => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}),
      heavy: () => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
    };

    // Android back button
    App.addListener('backButton', ({ canGoBack }) => {
      // 1. If an overlay is open (story viewer, modal, etc.), close it
      if (hasOverlay()) {
        dismissTopOverlay();
        return;
      }

      // 2. If we can go back in history, do so
      if (canGoBack) {
        window.history.back();
        return;
      }

      // 3. Double-back-to-exit
      const now = Date.now();
      if (now - lastBackTime < 2000) {
        App.exitApp();
      } else {
        lastBackTime = now;
        // Show toast via a simple DOM element (remove previous if still visible)
        const existing = document.getElementById('exit-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'exit-toast';
        toast.textContent = 'Press back again to exit';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;z-index:9999;font-family:system-ui;pointer-events:none;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
      }
    });
  } catch (err) {
    console.error('Capacitor init failed:', err);
  }
}

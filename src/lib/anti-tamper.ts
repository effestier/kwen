'use client';

import { useEffect } from 'react';

/**
 * Anti-tamper hook — light touch protections that don't break UX:
 * 1. Block DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * 2. Block right-click context menu
 *
 * Removed: iframe-bust (now handled server-side via the
 *   Content-Security-Policy: frame-ancestors 'none' header in middleware.ts,
 *   which is correct, doesn't break the page if it ever fires in a legitimate
 *   context, and doesn't rely on JS that can be disabled).
 * Removed: DevTools size detection (false positives), MutationObserver script
 *   blocking (breaks third-party scripts), console silencing (breaks debugging),
 *   global selectstart blocking (prevents text copy on mobile).
 */
export function useAntiTamper() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I / Cmd+Alt+I
      if ((e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) ||
          (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+J / Cmd+Alt+J
      if ((e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) ||
          (e.metaKey && e.altKey && (e.key === 'J' || e.key === 'j'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+C / Cmd+Alt+C
      if ((e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) ||
          (e.metaKey && e.altKey && (e.key === 'C' || e.key === 'c'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+U / Cmd+U — View source
      if ((e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.keyCode === 85)) ||
          (e.metaKey && (e.key === 'u' || e.key === 'U'))) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', onContextMenu, { passive: false });
    document.addEventListener('keydown', onKeyDown, { passive: false });

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

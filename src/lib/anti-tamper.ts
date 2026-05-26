'use client';

import { useEffect } from 'react';

/**
 * Anti-tamper hook — makes it extremely hard to:
 * 1. Open DevTools (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * 2. Right-click to inspect
 * 3. Edit DOM via console
 * 4. Select/inspect non-interactive elements
 * 5. Use console for tampering
 *
 * All client-side — a determined attacker with DevTools already open
 * can bypass, but this stops 99% of users.
 */
export function useAntiTamper() {
  useEffect(() => {
    // ─── Disable right-click context menu ───
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // ─── Disable keyboard shortcuts for DevTools ───
    const onKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+I / Cmd+Alt+I — Elements
      if ((e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) ||
          (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+J / Cmd+Alt+J — Console
      if ((e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) ||
          (e.metaKey && e.altKey && (e.key === 'J' || e.key === 'j'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+C / Cmd+Alt+C — Select element
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
      // Ctrl+S / Cmd+S — Save page
      if ((e.ctrlKey && (e.key === 's' || e.key === 'S' || e.keyCode === 83)) ||
          (e.metaKey && (e.key === 's' || e.key === 'S'))) {
        e.preventDefault();
        return false;
      }
      // Ctrl+A — Select all (outside inputs)
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A') && !isEditableElement(e.target as HTMLElement)) {
        e.preventDefault();
        return false;
      }
      // Ctrl+P — Print
      if ((e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.keyCode === 80)) ||
          (e.metaKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        return false;
      }
    };

    // ─── Disable text selection on non-input elements ───
    const onSelectStart = (e: Event) => {
      if (!isEditableElement(e.target as HTMLElement)) {
        e.preventDefault();
        return false;
      }
    };

    // ─── Disable drag on non-interactive elements ───
    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'A' || !isEditableElement(target)) {
        e.preventDefault();
        return false;
      }
    };

    // ─── Block common debug/eval patterns in console ───
    const originalConsole = { ...console };
    const noop = () => {};
    // Override debug methods but keep warn/error for actual error reporting
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.trace = noop;
    console.dir = noop;
    console.dirxml = noop;
    console.table = noop;
    console.group = noop;
    console.groupCollapsed = noop;
    console.groupEnd = noop;
    console.time = noop;
    console.timeEnd = noop;
    console.timeLog = noop;
    console.count = noop;
    console.countReset = noop;
    console.clear = noop;

    // ─── DevTools detection (size-based heuristic) ───
    let devToolsOpen = false;
    const threshold = 160;
    const detectInterval = setInterval(() => {
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if ((widthThreshold || heightThreshold) && !devToolsOpen) {
        devToolsOpen = true;
        // Blur the page when DevTools detected
        document.body.style.filter = 'blur(10px)';
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
      } else if (!widthThreshold && !heightThreshold && devToolsOpen) {
        devToolsOpen = false;
        document.body.style.filter = '';
        document.body.style.pointerEvents = '';
        document.body.style.userSelect = '';
      }
    }, 500);

    // ─── DOM integrity — detect and revert unauthorized mutations ───
    const protectedSelectors = [
      '[data-anti-tamper="true"]',
      'meta[name="anti-tamper"]',
      'script[data-security]',
    ];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Block unauthorized script injection
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLScriptElement && !node.hasAttribute('data-security')) {
              node.remove();
              originalConsole.warn?.('[Kwen] Unauthorized script injection blocked');
            }
          }
        }
        // Block attribute modifications on protected elements
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          for (const sel of protectedSelectors) {
            if (mutation.target.matches(sel)) {
              // Revert the change
              const attrName = mutation.attributeName;
              if (attrName) {
                const oldValue = (mutation.oldValue || '');
                mutation.target.setAttribute(attrName, oldValue);
              }
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
    });

    // ─── Prevent iframe embedding (clickjacking) ───
    if (window.self !== window.top) {
      document.documentElement.innerHTML = '';
      window.top!.location.href = window.self.location.href;
    }

    // ─── Register listeners ───
    document.addEventListener('contextmenu', onContextMenu, { passive: false });
    document.addEventListener('keydown', onKeyDown, { passive: false });
    document.addEventListener('selectstart', onSelectStart, { passive: false });
    document.addEventListener('dragstart', onDragStart, { passive: false });

    // ─── Cleanup ───
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('dragstart', onDragStart);
      clearInterval(detectInterval);
      observer.disconnect();
      // Restore console
      Object.assign(console, originalConsole);
      document.body.style.filter = '';
      document.body.style.pointerEvents = '';
      document.body.style.userSelect = '';
    };
  }, []);
}

function isEditableElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return false;
}

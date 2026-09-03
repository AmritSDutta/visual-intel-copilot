/**
 * Client-side deterrents for DevTools shortcuts and View Page Source.
 */
export function initDevToolsDeterrents(): void {
  if (typeof window === 'undefined') return;

  // 1. Block right-click context menu ("Inspect", "View Page Source")
  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (!isTextInput) {
        e.preventDefault();
      }
    },
    { capture: true }
  );

  // 2. Block keyboard shortcuts for DevTools and View Source
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;
      const key = (e.key || '').toUpperCase();

      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl+U / Cmd+Option+U (View Page Source)
      if ((isCtrlOrMeta && key === 'U') || (e.metaKey && isAlt && key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl+Shift+I / Cmd+Option+I (Inspect Elements)
      // Ctrl+Shift+J / Cmd+Option+J (Console)
      // Ctrl+Shift+C / Cmd+Option+C (Inspect Element Picker)
      if (
        (isCtrlOrMeta && isShift && (key === 'I' || key === 'J' || key === 'C')) ||
        (e.metaKey && isAlt && (key === 'I' || key === 'J' || key === 'C'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    },
    { capture: true }
  );
}

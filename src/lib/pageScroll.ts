/**
 * Signed-in phones scroll #root instead of the page (`phone-shell` in globals.css): a page
 * that does not move keeps the browser's bars still, and with them the tab bar.
 */
const SHELL_CLASS = 'phone-shell';

export function setPhoneShell(on: boolean): void {
  document.documentElement.classList.toggle(SHELL_CLASS, on);
}

function shellScroller(): HTMLElement | null {
  const root = document.getElementById('root');
  // The class alone says nothing: from the desktop width on the page scrolls as usual
  return root && getComputedStyle(root).overflowY === 'auto' ? root : null;
}

export function scrollPageTo(options: ScrollToOptions): void {
  (shellScroller() ?? window).scrollTo(options);
}

export function pageScrollTop(): number {
  return shellScroller()?.scrollTop ?? window.scrollY;
}

/** Calls back on scrolling, wherever the page scrolls; returns how to stop. */
export function onPageScroll(listener: () => void): () => void {
  // Scroll events do not bubble, but they do pass the capture phase
  window.addEventListener('scroll', listener, { capture: true, passive: true });
  return () => window.removeEventListener('scroll', listener, { capture: true });
}

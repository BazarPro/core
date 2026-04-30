import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '../../context/OnboardingContext';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../ui/theme-context';
import type { TargetRect } from './types';
import { OnboardingStartPanel } from './OnboardingStartPanel';
import { OnboardingStepPanel } from './OnboardingStepPanel';

/** Minimal distance to top/bottom of the visible viewport when deciding if we need to scroll. */
const VIEWPORT_EDGE_PADDING = 16;

function getViewportClipping(el: HTMLElement): { clippedTop: boolean; clippedBottom: boolean } {
  const rect = el.getBoundingClientRect();
  const viewTop = VIEWPORT_EDGE_PADDING;
  const viewBottom = window.innerHeight - VIEWPORT_EDGE_PADDING;
  return {
    clippedTop: rect.top < viewTop,
    clippedBottom: rect.bottom > viewBottom,
  };
}

/**
 * Scroll target into view when it sits below the fold or too close to the top edge.
 */
function scrollElementIntoViewIfClipped(el: HTMLElement): void {
  const prevHtmlOverflow = document.documentElement.style.overflow;
  const prevBodyOverflow = document.body.style.overflow;

  document.documentElement.style.overflow = 'auto';
  document.body.style.overflow = 'auto';

  el.scrollIntoView({ block: 'nearest', behavior: 'auto', inline: 'nearest' });

  window.requestAnimationFrame(() => {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
  });
}

export function OnboardingOverlay() {
  const { isActive, flow, currentStep } = useOnboarding();
  const { setMobileSidebarOpen } = useSidebar();
  const { resolvedTheme } = useTheme();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [animateHighlight, setAnimateHighlight] = useState(false);
  const location = useLocation();

  // Prevent background scrolling while onboarding is active
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isActive) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow =
        document.documentElement && document.documentElement.style
          ? document.documentElement.style.overflow
          : '';

      document.body.style.overflow = 'hidden';
      if (document.documentElement) {
        document.documentElement.style.overflow = 'hidden';
      }

      return () => {
        document.body.style.overflow = prevBodyOverflow;
        if (document.documentElement) {
          document.documentElement.style.overflow = prevHtmlOverflow;
        }
      };
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !currentStep?.targetId) {
      // No active step or no target → no highlight
      setTargetRect(null);
      setAnimateHighlight(false);
      return;
    }

    const targetId = currentStep.targetId;
    let cancelled = false;
    let hasResolvedInitialRect = false;
    /** At most one programmatic scroll per step to avoid loops for very tall targets. */
    let didScrollForViewport = false;

    // First placement should snap to the target without animation.
    setAnimateHighlight(false);

    // For steps that highlight a sidebar element, ensure the mobile sidebar is open
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    const isSidebarTarget = currentStep.targetId.startsWith('sidebar-');

    if (isMobile && isSidebarTarget) {
      setMobileSidebarOpen(true);
    }

    function trySetRect(): boolean {
      if (cancelled) return false;

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-onboarding-id="${targetId}"]`)
      );

      // Only consider visible elements (no display:none / 0x0)
      const el = candidates.find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (el) {
        const { clippedTop, clippedBottom } = getViewportClipping(el);
        if ((clippedTop || clippedBottom) && !didScrollForViewport) {
          didScrollForViewport = true;
          scrollElementIntoViewIfClipped(el);
          return false;
        }

        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        if (!hasResolvedInitialRect) {
          hasResolvedInitialRect = true;
          window.requestAnimationFrame(() => {
            if (!cancelled) setAnimateHighlight(true);
          });
        }
        return true;
      }
      setTargetRect(null);
      return false;
    }

    // Robust timing:
    // - some targets (e.g. event cards) appear after async queries
    // - some targets (mobile sidebar) appear after a sheet animation
    // So we retry for a short time until the element exists and is visible.
    let rafId: number | null = null;
    let timeoutId: number | null = null;

    const maxAttempts = isMobile && isSidebarTarget ? 10 : 12;
    const startDelayMs = isMobile && isSidebarTarget ? 150 : 0;
    let attempts = 0;

    const tick = () => {
      if (cancelled) return;
      if (trySetRect()) return;
      attempts += 1;
      if (attempts < maxAttempts) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    // start after a short delay so animations / layout settle
    timeoutId = window.setTimeout(() => {
      tick();
    }, startDelayMs);

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isActive, currentStep, location.pathname, setMobileSidebarOpen]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[999] pointer-events-auto">
      {/* Dimmed background with optional highlighted target */}
      {targetRect ? (
        <div
          className={`absolute ring-2 ring-primary/80 rounded-lg ${
            animateHighlight
              ? 'transition-[top,left,width,height] duration-300 ease-out'
              : 'transition-none'
          }`}
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow:
              resolvedTheme === 'dark'
                ? '0 0 0 9999px rgba(134, 134, 134, 0.55)'
                : '0 0 0 9999px rgba(0,0,0,0.35)',
          }}
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 bg-black/50 dark:bg-gray-200/55" aria-hidden />
      )}
      {/* Info panel */}
      <div className="absolute inset-0 pointer-events-none">
        {flow && currentStep ? (
          <OnboardingStepPanel targetRect={targetRect} />
        ) : (
          <OnboardingStartPanel />
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { TargetRect } from './types';
import { Button } from '../ui/button';
import { useOnboarding } from '../../context/OnboardingContext';
import { OnboardingStopPanel } from './OnboardingStopPanel';

const GAP = 20;
const PANEL_WIDTH = 384;
const PANEL_EST_HEIGHT = 240;
const VIEWPORT_MARGIN = 10;
const TOP_ALIGN_OFFSET = 0;

function getStepPanelPosition(
  targetRect: TargetRect | null,
  panelHeight: number = PANEL_EST_HEIGHT
) {
  if (!targetRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availableWidth = Math.max(200, vw - 2 * VIEWPORT_MARGIN);
    const panelWidth = Math.min(PANEL_WIDTH, availableWidth);

    return {
      style: {
        position: 'fixed' as const,
        left: (vw - panelWidth) / 2,
        top: (vh - panelHeight) / 2,
        width: panelWidth,
      },
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Shrink panel on very small screens so it always fits into the viewport with margin
  const availableWidth = Math.max(200, vw - 2 * VIEWPORT_MARGIN);
  const panelWidth = Math.min(PANEL_WIDTH, availableWidth);

  const spaceRight = vw - (targetRect.left + targetRect.width) - VIEWPORT_MARGIN;
  const spaceLeft = targetRect.left - VIEWPORT_MARGIN;

  const fitsRight = spaceRight >= panelWidth;
  const fitsLeft = spaceLeft >= panelWidth;

  // 1. Prefer placing left/right next to the target, vertically centered
  if (fitsRight || fitsLeft) {
    const preferRight = fitsRight && (!fitsLeft || spaceRight >= spaceLeft);
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const topAligned = targetCenterY - panelHeight / 2 + TOP_ALIGN_OFFSET;
    const topClamped = Math.max(
      VIEWPORT_MARGIN,
      Math.min(topAligned, vh - panelHeight - VIEWPORT_MARGIN)
    );
    return {
      style: {
        position: 'fixed' as const,
        left: preferRight
          ? targetRect.left + targetRect.width + GAP
          : targetRect.left - panelWidth - GAP,
        top: topClamped,
        width: panelWidth,
      },
    };
  }

  // 2. Below, if there is enough space (horizontally centered to target)
  const belowTop = targetRect.top + targetRect.height + GAP;
  const belowBottom = belowTop + panelHeight;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const leftAligned = targetCenterX - panelWidth / 2;
  const leftClamped = Math.max(
    VIEWPORT_MARGIN,
    Math.min(leftAligned, vw - panelWidth - VIEWPORT_MARGIN)
  );

  if (belowBottom <= vh - VIEWPORT_MARGIN) {
    return {
      style: {
        position: 'fixed' as const,
        left: leftClamped,
        top: belowTop,
        width: panelWidth,
      },
    };
  }

  // 3. Otherwise above, as far up as possible
  const aboveTop = Math.max(VIEWPORT_MARGIN, targetRect.top - GAP - panelHeight);

  return {
    style: {
      position: 'fixed' as const,
      left: leftClamped,
      top: aboveTop,
      width: panelWidth,
    },
  };
}

interface OnboardingStepPanelProps {
  targetRect: TargetRect | null;
}

export function OnboardingStepPanel({ targetRect }: OnboardingStepPanelProps) {
  const { flow, currentStep, currentIndex, totalSteps, stop, prev, next } = useOnboarding();
  const [measuredHeight] = useState<number | null>(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const isLastStep = totalSteps > 0 && currentIndex === totalSteps - 1;

  const { style: panelStyle } = useMemo(
    () => getStepPanelPosition(targetRect, measuredHeight ?? PANEL_EST_HEIGHT),
    [targetRect, measuredHeight]
  );

  if (!flow || !currentStep) return null;

  return (
    <div className="pointer-events-auto transition-all duration-300 ease-out" style={panelStyle}>
      <div className="relative max-w-sm bg-background text-foreground rounded-lg border border-border/70 shadow-xl dark:shadow-black/50 overflow-visible">
        {showConfirmClose ? (
          <OnboardingStopPanel
            radius="lg"
            onCancel={() => setShowConfirmClose(false)}
            onConfirm={stop}
          />
        ) : (
          <div className="p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-full"
              onClick={() => setShowConfirmClose(true)}
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </Button>
            <div
              key={currentIndex}
              className="animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              <div className="text-xs text-muted-foreground mb-1 pr-6">
                Schritt {currentIndex + 1} von {totalSteps || 1}
              </div>
              <h2 className="font-semibold mb-1">{currentStep.title}</h2>
              <p className="text-sm text-muted-foreground mb-3">{currentStep.description}</p>
              <div className="flex gap-2 justify-end">
                {currentIndex > 0 && (
                  <Button variant="outline" size="sm" onClick={prev}>
                    Zurück
                  </Button>
                )}
                <Button size="sm" onClick={isLastStep ? stop : next}>
                  {isLastStep ? 'Loslegen' : 'Weiter'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

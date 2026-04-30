import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  ONBOARDING_FLOWS,
  type OnboardingFlow,
  type OnboardingStepId,
  type OnboardingStep,
} from '../constants/onboardingSteps';
import { useUserRole } from './UserRoleContext';
import {
  consumeFlowSelectionOnboardingPending,
  consumeParticipantOnboardingPending,
} from '../lib/onboardingTrigger';

interface OnboardingState {
  isActive: boolean;
  currentIndex: number;
  flow: OnboardingFlow | null;
}

interface OnboardingContextValue extends OnboardingState {
  currentStep: OnboardingStep | null;
  /** Total number of steps in the current flow (filtered for mobile/desktop) */
  totalSteps: number;
  start: () => void;
  stop: () => void;
  selectFlow: (flow: OnboardingFlow) => void;
  next: () => void;
  prev: () => void;
  goToStep: (id: OnboardingStepId) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const markOnboardingSeen = useMutation(api.users.markOnboardingSeen);
  const viewer = useQuery(api.users.viewer);
  const { setRoleOnly } = useUserRole();
  const [isActive, setIsActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flow, setFlow] = useState<OnboardingFlow | null>(null);
  // Prevents the onboarding from auto-starting again immediately after closing,
  // in case needsOnboarding in the viewer has not been updated yet.
  const [hasDismissedOnboarding, setHasDismissedOnboarding] = useState(false);

  const getStepsForFlow = (f: OnboardingFlow): OnboardingStep[] => {
    let steps = ONBOARDING_FLOWS[f];
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    if (!isMobile) {
      steps = steps.filter((step) => !step.onlyMobile);
    }
    return steps;
  };

  const currentSteps = flow ? getStepsForFlow(flow) : [];
  const currentStep =
    isActive && currentSteps.length > 0 ? (currentSteps[currentIndex] ?? null) : null;

  // Auto-start only after explicit pending trigger (e.g. successful event registration / first product).
  useEffect(() => {
    if (!viewer) return;
    if (hasDismissedOnboarding) return;
    if (isActive) return;
    const isParticipantMainRoute =
      location.pathname.startsWith('/my-products') ||
      location.pathname.startsWith('/browse-events');
    if (!isParticipantMainRoute) return;
    if (consumeFlowSelectionOnboardingPending()) {
      setFlow(null);
      setCurrentIndex(0);
      setIsActive(true);
      return;
    }

    if (!viewer.needsOnboarding) return;
    if (!consumeParticipantOnboardingPending()) return;

    const participantSteps = getStepsForFlow('participant');
    if (!participantSteps.length) return;

    setRoleOnly('participant');
    setFlow('participant');
    setCurrentIndex(0);
    setIsActive(true);
    navigate(participantSteps[0].route);
  }, [
    viewer,
    isActive,
    hasDismissedOnboarding,
    navigate,
    setRoleOnly,
    location.key,
    location.pathname,
  ]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      isActive,
      currentIndex,
      flow,
      currentStep,
      totalSteps: currentSteps.length,
      start() {
        // Start onboarding without selecting a flow yet
        setIsActive(true);
        setCurrentIndex(0);
        setFlow(null);
      },
      stop() {
        setIsActive(false);
        setFlow(null);
        // When the wizard is finished (cancel or complete), mark onboarding as seen
        setHasDismissedOnboarding(true);
        void markOnboardingSeen({});
      },
      selectFlow(selectedFlow) {
        const steps = getStepsForFlow(selectedFlow);
        if (!steps.length) return;
        // Ensure the app role matches the selected onboarding flow
        setRoleOnly(selectedFlow);
        setFlow(selectedFlow);
        setCurrentIndex(0);
        setIsActive(true);
        navigate(steps[0].route);
      },
      next() {
        if (!flow) return;
        const steps = getStepsForFlow(flow);
        if (!steps.length) return;
        setCurrentIndex((prev) => {
          const nextIdx = Math.min(prev + 1, steps.length - 1);
          const step = steps[nextIdx];
          if (step) navigate(step.route);
          return nextIdx;
        });
      },
      prev() {
        if (!flow) return;
        const steps = getStepsForFlow(flow);
        if (!steps.length) return;
        setCurrentIndex((prev) => {
          const prevIdx = Math.max(prev - 1, 0);
          const step = steps[prevIdx];
          if (step) navigate(step.route);
          return prevIdx;
        });
      },
      goToStep(id) {
        if (!flow) return;
        const steps = getStepsForFlow(flow);
        const idx = steps.findIndex((s) => s.id === id);
        if (idx < 0) return;
        setIsActive(true);
        setCurrentIndex(idx);
        navigate(steps[idx].route);
      },
    }),
    [
      currentIndex,
      currentStep,
      flow,
      isActive,
      markOnboardingSeen,
      currentSteps.length,
      navigate,
      setRoleOnly,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}

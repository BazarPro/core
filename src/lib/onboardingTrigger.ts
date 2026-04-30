const PARTICIPANT_ONBOARDING_PENDING_KEY = 'onboarding.pending.participant';
const FLOW_SELECTION_ONBOARDING_PENDING_KEY = 'onboarding.pending.flow-selection';

export function setParticipantOnboardingPending(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PARTICIPANT_ONBOARDING_PENDING_KEY, '1');
}

export function consumeParticipantOnboardingPending(): boolean {
  if (typeof window === 'undefined') return false;
  const isPending = window.localStorage.getItem(PARTICIPANT_ONBOARDING_PENDING_KEY) === '1';
  if (isPending) {
    window.localStorage.removeItem(PARTICIPANT_ONBOARDING_PENDING_KEY);
  }
  return isPending;
}

export function setFlowSelectionOnboardingPending(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FLOW_SELECTION_ONBOARDING_PENDING_KEY, '1');
}

export function consumeFlowSelectionOnboardingPending(): boolean {
  if (typeof window === 'undefined') return false;
  const isPending = window.localStorage.getItem(FLOW_SELECTION_ONBOARDING_PENDING_KEY) === '1';
  if (isPending) {
    window.localStorage.removeItem(FLOW_SELECTION_ONBOARDING_PENDING_KEY);
  }
  return isPending;
}

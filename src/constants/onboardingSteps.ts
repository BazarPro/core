import i18n from '../i18n';
export type OnboardingFlow = 'participant' | 'organizer';
export type OnboardingStepId =
  | 'participant-mobile-menu'
  | 'participant-role-switch'
  | 'participant-participant-nav'
  | 'participant-new-product'
  | 'participant-first-product'
  | 'participant-first-product-qr'
  | 'participant-nav-events-search'
  | 'participant-events-search'
  | 'participant-finish'
  | 'organizer-role-switch'
  | 'organizer-new-event-button'
  | 'organizer-new-event-details';

export interface OnboardingStep {
  id: OnboardingStepId;
  flow: OnboardingFlow;
  route: string;
  /**
   * Optional target element to highlight on the page.
   * The element should have data-onboarding-id="{targetId}".
   */
  targetId?: string;
  /**
   * If true, this step is only shown on small screens (mobile)
   */
  onlyMobile?: boolean;
  /**
   * Controls whether the app sidebar should be visible on mobile during this step.
   * Defaults to true when omitted.
   */
  showMobileSidebar?: boolean;
  /** In the current language (src/locales/<lang>/onboarding.json) */
  readonly title: string;
  readonly description: string;
}

type StepDefinition = Omit<OnboardingStep, 'title' | 'description'>;

/** Adds title and description, read in the current language whenever they are shown. */
function withTexts(steps: StepDefinition[]): OnboardingStep[] {
  return steps.map(
    (step) =>
      Object.defineProperties(
        { ...step },
        {
          title: {
            enumerable: true,
            get: () => i18n.t(`${step.id}.title` as never, { ns: 'onboarding' }),
          },
          description: {
            enumerable: true,
            get: () => i18n.t(`${step.id}.description` as never, { ns: 'onboarding' }),
          },
        }
      ) as OnboardingStep
  );
}

export const PARTICIPANT_ONBOARDING_STEPS: OnboardingStep[] = withTexts([
  {
    id: 'participant-mobile-menu',
    flow: 'participant',
    route: '/my-products',
    targetId: 'header-mobile-menu',
    showMobileSidebar: false,
    onlyMobile: true,
  },
  {
    id: 'participant-role-switch',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-role-switch',
    showMobileSidebar: true,
  },
  {
    id: 'participant-participant-nav',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-participant-nav',
    showMobileSidebar: true,
  },
  {
    id: 'participant-new-product',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-new-product',
    showMobileSidebar: false,
  },
  {
    id: 'participant-first-product',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-first-product',
    showMobileSidebar: false,
  },
  {
    id: 'participant-first-product-qr',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-first-product-qr',
    showMobileSidebar: false,
  },
  {
    id: 'participant-nav-events-search',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-events-search',
    showMobileSidebar: true,
  },
  {
    id: 'participant-events-search',
    flow: 'participant',
    route: '/browse-events',
    targetId: 'events-search-first-card',
    showMobileSidebar: false,
  },
  {
    id: 'participant-finish',
    flow: 'participant',
    route: '/browse-events',
    showMobileSidebar: false,
  },
]);

export const ORGANIZER_ONBOARDING_STEPS: OnboardingStep[] = withTexts([
  {
    id: 'organizer-role-switch',
    flow: 'organizer',
    route: '/my-events',
    targetId: 'sidebar-role-switch',
    showMobileSidebar: true,
  },
  {
    id: 'organizer-new-event-button',
    flow: 'organizer',
    route: '/my-events',
    targetId: 'my-events-new-event-button',
    showMobileSidebar: false,
  },
  {
    id: 'organizer-new-event-details',
    flow: 'organizer',
    route: '/events/new',
    targetId: '',
    showMobileSidebar: false,
  },
]);

export const ONBOARDING_FLOWS: Record<OnboardingFlow, OnboardingStep[]> = {
  participant: PARTICIPANT_ONBOARDING_STEPS,
  organizer: ORGANIZER_ONBOARDING_STEPS,
};

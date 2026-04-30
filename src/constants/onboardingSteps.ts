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
  title: string;
  description: string;
}

export const PARTICIPANT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'participant-mobile-menu',
    flow: 'participant',
    route: '/my-products',
    targetId: 'header-mobile-menu',
    showMobileSidebar: false,
    onlyMobile: true,
    title: 'Navigation',
    description: 'Hier findest du die Navigation mit allen wichtigen Funktionen.',
  },
  {
    id: 'participant-role-switch',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-role-switch',
    showMobileSidebar: true,
    title: 'Rolle jederzeit wechseln',
    description:
      'Du startest in der Teilnehmer-Ansicht. Mit BazarPro kannst du sowohl an Veranstaltungen teilnehmen als auch eigene Events erstellen. Wechsle deine Rolle jederzeit hier.',
  },
  {
    id: 'participant-participant-nav',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-participant-nav',
    showMobileSidebar: true,
    title: 'Navigation',
    description:
      'Wechsle schnell zwischen allen Funktionen für Teilnehmer. Nimm an Veranstaltungen als Verkäufer teil und verwalte deine Produkte bequem online.',
  },
  {
    id: 'participant-new-product',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-new-product',
    showMobileSidebar: false,
    title: 'Neues Produkt anlegen',
    description:
      'Erstelle ein neues Produkt mit Titel, Beschreibung, Preis und Bildern. Weise es anschließend einer oder mehreren Veranstaltungen zu.',
  },
  {
    id: 'participant-first-product',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-first-product',
    showMobileSidebar: false,
    title: 'Produkt ansehen und bearbeiten',
    description:
      'Bearbeite dein Produkt jederzeit – z. B. um den Preis zu ändern oder es zu einer Veranstaltung hinzufügen. Klicke auf das Produkt, um zur öffentlichen Ansicht zu gelangen. Diese zeigt dir wie Kunden dein Produkt sehen.',
  },
  {
    id: 'participant-first-product-qr',
    flow: 'participant',
    route: '/my-products',
    targetId: 'my-products-first-product-qr',
    showMobileSidebar: false,
    title: 'QR-Code für dein Produkt',
    description:
      'Jedes Produkt hat einen QR-Code, der zur Identifikation bei einer Veranstaltung vor Ort dient. Drucke ihn aus und befestige ihn am Produkt. Kunden können den Code scannen und sehen alle Details zum Produkt. Veranstalter können den Code scannen und so einen Verkauf abwickeln.',
  },
  {
    id: 'participant-nav-events-search',
    flow: 'participant',
    route: '/my-products',
    targetId: 'sidebar-events-search',
    showMobileSidebar: true,
    title: 'Events entdecken',
    description:
      'Über „Events suchen“ gelangst du zur Veranstaltungsübersicht. Dort kannst du passende Events finden und dich als Verkäufer anmelden.',
  },
  {
    id: 'participant-events-search',
    flow: 'participant',
    route: '/browse-events',
    targetId: 'events-search-first-card',
    showMobileSidebar: false,
    title: 'Zu Event anmelden',
    description:
      'Finde passende Veranstaltungen und melde dich als Verkäufer an. Danach kannst du deine Produkte dort anbieten.',
  },
  {
    id: 'participant-finish',
    flow: 'participant',
    route: '/browse-events',
    showMobileSidebar: false,
    title: 'Das war’s!',
    description:
      'Du kannst jetzt loslegen: Melde dich zu deiner ersten Veranstaltung an und füge deine Produkte hinzu. Wenn du später noch einmal Hilfe brauchst, kannst du das Tutorial jederzeit über das Icon unten rechts erneut starten.',
  },
];

export const ORGANIZER_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'organizer-role-switch',
    flow: 'organizer',
    route: '/my-events',
    targetId: 'sidebar-role-switch',
    showMobileSidebar: true,
    title: 'Rolle jederzeit wechseln',
    description:
      'Perfekt! Wir haben für dich direkt die Veranstalter-Ansicht vorausgewählt. Über BazarPro kannst du sowohl an Veranstaltungen teilnehmen als auch selbst Events organisieren. Wechsle deine Rolle jederzeit hier.',
  },
  {
    id: 'organizer-new-event-button',
    flow: 'organizer',
    route: '/my-events',
    targetId: 'my-events-new-event-button',
    showMobileSidebar: false,
    title: 'Neue Veranstaltung erstellen',
    description:
      'Hier startest du mit einer neuen Veranstaltung. Klicke auf „Neue Veranstaltung“, um Titel, Ort, Zeitraum und weitere Details zu definieren.',
  },
  {
    id: 'organizer-new-event-details',
    flow: 'organizer',
    route: '/events/new',
    targetId: '',
    showMobileSidebar: false,
    title: 'Veranstaltungsdetails ausfüllen',
    description:
      'Gib deiner Veranstaltung einen klaren Titel und eine Beschreibung. Diese Informationen sehen später deine Teilnehmer – halte sie präzise und ansprechend.',
  },
];

export const ONBOARDING_FLOWS: Record<OnboardingFlow, OnboardingStep[]> = {
  participant: PARTICIPANT_ONBOARDING_STEPS,
  organizer: ORGANIZER_ONBOARDING_STEPS,
};

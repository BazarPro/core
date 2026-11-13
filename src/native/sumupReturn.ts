/**
 * The deep link back from connecting SumUp in the system browser (src/native/start.tsx)
 * is passed on to the page as this window event. Its own module, so the start of the app
 * does not load the SumUp code.
 */
export const SUMUP_RETURN_EVENT = 'bazarpro:sumup';

/** `error`: the code from the backend, e.g. sumup.cancelled; none when connected */
export type SumUpReturn = { error?: string };

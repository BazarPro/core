// Shared by the public event pages and the web server (server/seo.ts).

/** Where an event takes place: the free-text location (name of the venue) and its address. */
export interface EventPlace {
  location: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/** "Turnhalle Nord, Hauptstr. 5, 89073 Ulm"; parts already in the location are not repeated. */
export function formatEventPlace(event: EventPlace): string {
  const location = event.location.trim();
  const town = [event.postalCode, event.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  const parts = [location];
  for (const part of [event.street?.trim(), town]) {
    if (part && !location.toLowerCase().includes(part.toLowerCase())) parts.push(part);
  }
  return parts.filter(Boolean).join(', ');
}

/** The town for titles like "Kinderbasar in Ulm"; older events only have the location. */
export function eventTown(event: EventPlace): string {
  return event.city?.trim() || event.location;
}

export interface EventJsonLdInput extends EventPlace {
  title: string;
  description: string;
  startDate: number;
  endDate: number;
  /** Address of the event page */
  url: string;
  /** Cover image, or a general picture: Google shows events only with an image */
  image: string;
}

type Place = {
  '@type': 'Place';
  name: string;
  address: string | Record<string, string>;
};

// German postal code and town, e.g. "89073 Ulm" or "D-89073 Ulm"
const POSTAL_CODE_AND_TOWN = /(?:^|[\s,])(?:D-)?(\d{5})\s+([^\d,\n][^,\n]*)/;

/** Venue for schema.org: the address organizers entered, else parsed from the location. */
export function placeOf(event: EventPlace): Place {
  const street = event.street?.trim();
  const postalCode = event.postalCode?.trim();
  const city = event.city?.trim();
  if (!postalCode && !city) return placeFromLocation(event.location);
  return {
    '@type': 'Place',
    name: event.location.trim() || formatEventPlace(event),
    address: {
      '@type': 'PostalAddress',
      ...(street ? { streetAddress: street } : {}),
      ...(postalCode ? { postalCode } : {}),
      ...(city ? { addressLocality: city } : {}),
      addressCountry: 'DE',
    },
  };
}

/**
 * Venue for schema.org from the free text organizers enter, e.g.
 * "Gemeindehaus St. Martin, Hauptstr. 5, 89073 Ulm". With a German postal code the
 * address is structured (Google wants that for event results), otherwise it stays text.
 */
export function placeFromLocation(location: string): Place {
  const text = location.trim();
  const match = text.match(POSTAL_CODE_AND_TOWN);
  if (!match || match.index === undefined) {
    return { '@type': 'Place', name: text, address: text };
  }

  const before = text
    .slice(0, match.index)
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  // The part right before the postal code is the street if it has a house number
  const street = before.length && /\d/.test(before[before.length - 1]) ? before.pop() : undefined;
  const town = match[2].trim();

  return {
    '@type': 'Place',
    name: before.length ? before.join(', ') : text,
    address: {
      '@type': 'PostalAddress',
      ...(street ? { streetAddress: street } : {}),
      postalCode: match[1],
      addressLocality: town,
      addressCountry: 'DE',
    },
  };
}

export function eventJsonLd(input: EventJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.title,
    description: input.description,
    startDate: new Date(input.startDate).toISOString(),
    endDate: new Date(input.endDate).toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: placeOf(input),
    url: input.url,
    image: [input.image],
  };
}

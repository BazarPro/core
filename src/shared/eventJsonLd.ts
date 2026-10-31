// Shared by the public event pages and the web server (server/seo.ts).

export interface EventJsonLdInput {
  title: string;
  description: string;
  location: string;
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
    location: placeFromLocation(input.location),
    url: input.url,
    image: [input.image],
  };
}

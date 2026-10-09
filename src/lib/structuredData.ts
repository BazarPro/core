import { GITHUB_URL } from './links';
import { getSiteUrl } from './seo';

/** schema.org data for the marketing pages (rich results in search engines). */

export function softwareApplication(featureList?: string[]) {
  const siteUrl = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BazarPro',
    url: siteUrl,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    inLanguage: 'de',
    description:
      'Open-Source-Software für Second-Hand-Basare, Flohmärkte, Kinderkleiderbasare und Fahrradbörsen: Artikel online anmelden, QR-Etiketten drucken, an der Kasse per Smartphone scannen, automatische Abrechnung.',
    isAccessibleForFree: true,
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: GITHUB_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    ...(featureList ? { featureList } : {}),
  };
}

export function organization() {
  const siteUrl = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BazarPro',
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    sameAs: [GITHUB_URL],
  };
}

export function faqPage(entries: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

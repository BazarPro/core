/* eslint-disable react-refresh/only-export-components -- a page of its own, not hot-reloaded */
// The preview image of links to bazarpro.de and of the GitHub repository, rendered by
// render.mjs. One scene in two sizes: 1200x630 (Open Graph) and 1280x640 (GitHub).
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '../../src/styles/index.css';
import { createRoot } from 'react-dom/client';
import { Code2, Printer, ReceiptText, ScanLine } from 'lucide-react';
import { BrandMark } from '../../src/components/layout/BrandMark';
import i18n from '../../src/i18n';
import { HeroSaleScene } from '../../src/pages/public/landing/components/demo/HeroSaleScene';

const FEATURES = [
  { icon: Printer, text: 'QR-Etiketten' },
  { icon: ScanLine, text: 'Handy-Kasse' },
  { icon: ReceiptText, text: 'Abrechnung' },
];

function Scene({ width, height, github }: { width: number; height: number; github: boolean }) {
  return (
    <div
      data-preview={github ? 'github' : 'og'}
      className="relative flex items-center overflow-hidden bg-white text-zinc-900"
      style={{ width, height, fontFamily: 'Inter, sans-serif' }}
    >
      {/* Soft blue light and the dot grid of the landing page */}
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-blue-100/80 blur-3xl" />
      <div className="absolute -bottom-48 right-0 h-[36rem] w-[40rem] rounded-full bg-blue-100/70 blur-3xl" />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(rgb(24 24 27 / 0.12) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative z-10 flex h-full flex-1 flex-col justify-center pl-[72px] pr-4">
        <div className="mb-9 flex items-center gap-3">
          <BrandMark className="h-14 w-14" />
          <span className="font-display text-[36px] font-extrabold tracking-tight">
            Bazar<span className="text-primary">Pro</span>
          </span>
        </div>
        <h1
          className="whitespace-nowrap font-display font-extrabold leading-[1.08] tracking-[-0.02em]"
          style={{ fontSize: github ? 58 : 54 }}
        >
          Second-Hand-Basare
          <br />
          <span className="relative text-primary">
            ohne
            <span className="absolute -bottom-1 left-0 h-[5px] w-full rounded-full bg-tag" />
          </span>{' '}
          Zettelwirtschaft
        </h1>
        <p className="mt-6 max-w-[34rem] text-[24px] leading-snug text-zinc-600">
          Für Kinderbasare, Flohmärkte und Fahrradbörsen.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-4 py-2 text-[19px] font-medium shadow-sm"
            >
              <Icon className="h-5 w-5 text-primary" />
              {text}
            </span>
          ))}
        </div>
        <p className="mt-9 flex items-center gap-2 text-[19px] font-medium text-zinc-500">
          {github ? (
            <>
              <Code2 className="h-5 w-5" /> Open Source · selbst hosten oder auf bazarpro.de
            </>
          ) : (
            'bazarpro.de'
          )}
        </p>
      </div>

      {/* The scene of the landing page, standing still: raincoat and bike sold together */}
      <div className="relative z-10 shrink-0 pr-12" style={{ width: github ? 600 : 540 }}>
        <HeroSaleScene still className="max-w-none" />
      </div>
    </div>
  );
}

await i18n.changeLanguage('de');
createRoot(document.getElementById('root')!).render(
  <div className="flex flex-col items-start gap-8">
    <Scene width={1200} height={630} github={false} />
    <Scene width={1280} height={640} github />
  </div>
);

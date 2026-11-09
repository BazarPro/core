import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  HandHeart,
  ImageIcon,
  Loader2,
  RectangleHorizontal,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  Square,
  Tag,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import { useMutation, useQuery } from '../../../../lib/api/react';
import type { Id } from '../../../../lib/api/types';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { PageSkeleton } from '../../../../components/ui/loading';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/text-area';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Label } from '../../../../components/ui/label';
import { cn } from '../../../../lib/utils';
import { getSiteUrl } from '../../../../lib/seo';
import { coverUrl, DEFAULT_COVER } from '../../../../lib/eventCovers';
import {
  defaultBlock,
  defaultPromoContent,
  PROMO_AUDIENCES,
  PROMO_BLOCKS,
  switchAudience,
  type PromoAudience,
  type PromoBlock,
  type PromoBlockId,
  type PromoContent,
  type PromoEvent,
} from '../../../../lib/promo/promoContent';
import {
  hasBack,
  loadPromoFonts,
  PROMO_COLORS,
  PROMO_DESIGNS,
  PROMO_FORMATS,
  promoAspect,
  renderPromo,
  showsBlocks,
  type PromoFormatId,
  type PromoSide,
  type PromoSpec,
} from '../../../../lib/promo/renderPromo';
import { downloadPromo, promoFile, type PosterPaper } from '../../../../lib/promo/exportPromo';
import { restorePromoSettings, type PromoSettings } from '../../../../lib/promo/promoSettings';
import { PromoShare } from './components/PromoShare';

/**
 * Flyers, posters, banners and social media pictures of a bazaar: pick what, for whom and
 * how it looks; the texts come filled in from the bazaar and can be changed. The choices
 * are saved with the bazaar (promos.savePromo) for the whole team; an own picture stays on
 * this device.
 */

const FORMAT_ICONS: Record<PromoFormatId, LucideIcon> = {
  poster: FileText,
  flyer: Tag,
  post: Square,
  story: Smartphone,
  banner: RectangleHorizontal,
};

const AUDIENCE_ICONS: Record<PromoAudience, LucideIcon> = {
  visitors: ShoppingBag,
  sellers: Tag,
  helpers: HandHeart,
};

/** Wait this long after the last change before saving */
const SAVE_DELAY_MS = 800;

function useImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImage(null);
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setImage(img);
    img.onerror = () => !cancelled && setImage(null);
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return image;
}

/** Draws the spec into a canvas that fills its box; reports when the texts do not fit */
function PromoCanvas({
  spec,
  width,
  className,
  onOverflow,
  label,
}: {
  spec: PromoSpec;
  width: number;
  className?: string;
  onOverflow?: (overflow: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round((width * ratio) / promoAspect(spec.format));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { overflow } = renderPromo(ctx, spec, canvas.width);
      onOverflow?.(overflow);
    });
    return () => cancelAnimationFrame(frame);
  }, [spec, width, onOverflow]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={cn('block w-full h-auto', className)}
      style={{ aspectRatio: String(promoAspect(spec.format)) }}
    />
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <h2 className="flex items-center gap-3 text-base font-semibold mb-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-lg border-2 p-3 text-left transition-colors cursor-pointer hover:border-primary/50',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
        className
      )}
    >
      {children}
    </button>
  );
}

/** Two or three options in a row, e.g. A4 | A3 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  small,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-3 cursor-pointer transition-colors',
            small ? 'py-0.5 text-xs' : 'py-1.5 text-sm font-medium',
            value === option.value
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PromoPage() {
  const { t } = useTranslation('organizer');
  const navigate = useNavigate();
  const eventId = useParams().eventId as Id<'events'>;
  const { isLoading, canManage } = useEventAccess(eventId);
  const event = useQuery(api.events.getEvent, { id: eventId });
  const saved = useQuery(api.promos.getPromo, canManage ? { eventId } : 'skip');

  useEffect(() => {
    if (!isLoading && !canManage) navigate('/', { replace: true });
  }, [isLoading, canManage, navigate]);

  if (isLoading || !canManage || event === undefined || saved === undefined) {
    return <PageSkeleton />;
  }
  if (event === null) return <p>{t('dashboard.notFound')}</p>;
  return <PromoEditor eventId={eventId} event={event} saved={saved?.promo ?? null} />;
}

type LoadedEvent = PromoEvent & { coverImageUrl: string | null; _id: string };

type SaveState = 'saved' | 'saving' | 'failed';

/** "Alle Infos auf BazarPro.de": the site of this installation */
function siteLabel(): string {
  const host = new URL(getSiteUrl()).host;
  return host === 'bazarpro.de' ? 'BazarPro.de' : host;
}

function PromoEditor({
  eventId,
  event,
  saved,
}: {
  eventId: Id<'events'>;
  event: LoadedEvent;
  saved: unknown;
}) {
  const { t } = useTranslation('organizer');
  // The stored settings once, when the page opens; from then on this page leads
  const [settings, setSettings] = useState<PromoSettings>(() => restorePromoSettings(saved, event));
  const { format, design, color, imageFocus, content } = settings;
  const update = useCallback(
    (change: Partial<PromoSettings>) => setSettings((s) => ({ ...s, ...change })),
    []
  );
  const setContent = useCallback(
    (change: (content: PromoContent) => PromoContent) =>
      setSettings((s) => ({ ...s, content: change(s.content) })),
    []
  );

  const [ownImage, setOwnImage] = useState<string | null>(null);
  const [paper, setPaper] = useState<PosterPaper>('a4');
  const [side, setSide] = useState<PromoSide>('front');
  const [overflow, setOverflow] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadPromoFonts().then(() => setFontsReady(true));
  }, []);

  // Save a moment after the last change
  const savePromo = useMutation(api.promos.savePromo);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('saving');
    const timer = setTimeout(() => {
      savePromo({ eventId, promo: { ...settings } })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [settings, eventId, savePromo]);

  const image = useImage(ownImage ?? event.coverImageUrl ?? coverUrl(DEFAULT_COVER));
  const publicUrl = `${getSiteUrl()}/public-events/${event._id}`;
  const footer = t('promo.footer', { site: siteLabel() });

  const spec = useMemo<PromoSpec>(
    () => ({ format, design, color, content, qrUrl: publicUrl, footer, image, imageFocus }),
    // fontsReady: draw again once the fonts are there
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [format, design, color, content, publicUrl, footer, image, imageFocus, fontsReady]
  );
  const back = hasBack(spec);
  const shownSide: PromoSide = back ? side : 'front';
  const previewSpec = useMemo(() => ({ ...spec, side: shownSide }), [spec, shownSide]);
  const onOverflow = useCallback((value: boolean) => setOverflow(value), []);

  const updateBlock = (id: PromoBlockId, change: Partial<PromoBlock>) =>
    setContent((c) => ({ ...c, blocks: { ...c.blocks, [id]: { ...c.blocks[id], ...change } } }));

  const download = async () => {
    setBusy(true);
    try {
      await downloadPromo(spec, event.title, paper);
    } catch (error) {
      console.error(error);
      toast.error(t('promo.downloadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const downloadButton = (className?: string) => (
    <Button className={cn('w-full', className)} size="lg" onClick={download} disabled={busy}>
      {busy ? (
        <Loader2 className="size-4 mr-2 animate-spin" />
      ) : (
        <Download className="size-4 mr-2" />
      )}
      {t(`promo.download.${format}`)}
    </Button>
  );

  return (
    <div className="container mx-auto">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-4xl">{t('promo.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('promo.subtitle')}</p>
        </div>
        <p
          className={cn(
            'text-xs flex items-center gap-1',
            saveState === 'failed' ? 'text-destructive' : 'text-muted-foreground'
          )}
          aria-live="polite"
        >
          {saveState === 'saving' && <Loader2 className="size-3 animate-spin" />}
          {saveState === 'saved' && <Check className="size-3" />}
          {t(`promo.saveState.${saveState}`)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="space-y-4 order-2 lg:order-1">
          <Section step={1} title={t('promo.step.format')}>
            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5 gap-2">
              {(Object.keys(PROMO_FORMATS) as PromoFormatId[]).map((id) => {
                const Icon = FORMAT_ICONS[id];
                return (
                  <Choice key={id} selected={format === id} onClick={() => update({ format: id })}>
                    <Icon className="size-5 mb-2 text-primary" />
                    <div className="font-medium text-sm">{t(`promo.format.${id}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`promo.format.${id}Hint`)}
                    </div>
                  </Choice>
                );
              })}
            </div>
          </Section>

          <Section step={2} title={t('promo.step.audience')}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PROMO_AUDIENCES.map((id) => {
                const Icon = AUDIENCE_ICONS[id];
                return (
                  <Choice
                    key={id}
                    selected={content.audience === id}
                    onClick={() => setContent((c) => switchAudience(c, event, id))}
                    className="flex items-start gap-3"
                  >
                    <Icon className="size-5 shrink-0 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium text-sm">{t(`promo.audience.${id}`)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(`promo.audience.${id}Hint`)}
                      </div>
                    </div>
                  </Choice>
                );
              })}
            </div>
          </Section>

          <Section step={3} title={t('promo.step.design')}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PROMO_DESIGNS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={design === id}
                  onClick={() => update({ design: id })}
                  className={cn(
                    'rounded-lg border-2 p-1.5 cursor-pointer transition-colors hover:border-primary/50 flex flex-col',
                    design === id ? 'border-primary bg-primary/5' : 'border-border'
                  )}
                >
                  <div className="flex-1 flex items-center">
                    <PromoCanvas
                      spec={{ ...spec, design: id }}
                      width={format === 'banner' ? 200 : 140}
                      className="rounded shadow-sm"
                      label={t(`promo.design.${id}`)}
                    />
                  </div>
                  <div className="text-sm font-medium mt-1.5">{t(`promo.design.${id}`)}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground mr-1">{t('promo.color')}</span>
              {PROMO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => update({ color: c })}
                  className={cn(
                    'size-8 rounded-full cursor-pointer ring-offset-2 ring-offset-background transition',
                    color === c ? 'ring-2 ring-foreground' : 'hover:scale-110'
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Section>

          <Section step={4} title={t('promo.step.image')}>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <div
                className="h-24 w-36 shrink-0 rounded-md bg-muted bg-cover"
                style={{
                  backgroundImage: image ? `url(${image.src})` : undefined,
                  backgroundPosition: `50% ${imageFocus}%`,
                }}
              />
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      <Upload className="size-4 mr-1" />
                      {t('promo.ownImage')}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setOwnImage(URL.createObjectURL(file));
                        }}
                      />
                    </label>
                  </Button>
                  {ownImage && (
                    <Button variant="ghost" size="sm" onClick={() => setOwnImage(null)}>
                      <ImageIcon className="size-4 mr-1" />
                      {t('promo.eventImage')}
                    </Button>
                  )}
                </div>
                {ownImage && (
                  <p className="text-xs text-muted-foreground">{t('promo.ownImageHint')}</p>
                )}
                <div>
                  <Label htmlFor="promo-focus" className="text-sm text-muted-foreground">
                    {t('promo.imageFocus')}
                  </Label>
                  <input
                    id="promo-focus"
                    type="range"
                    min={0}
                    max={100}
                    value={imageFocus}
                    onChange={(e) => update({ imageFocus: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          </Section>

          <Section step={5} title={t('promo.step.texts')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="kicker"
                label={t('promo.field.kicker')}
                value={content.kicker}
                onChange={(kicker) => setContent((c) => ({ ...c, kicker }))}
              />
              <TextField
                id="title"
                label={t('promo.field.title')}
                value={content.title}
                onChange={(title) => setContent((c) => ({ ...c, title }))}
              />
              <TextField
                id="date"
                label={t('promo.field.date')}
                value={content.dateLine}
                onChange={(dateLine) => setContent((c) => ({ ...c, dateLine }))}
              />
              <TextField
                id="place"
                label={t('promo.field.place')}
                value={content.placeLine}
                onChange={(placeLine) => setContent((c) => ({ ...c, placeLine }))}
              />
            </div>

            <h3 className="text-sm font-semibold mt-6 mb-1">{t('promo.blocksTitle')}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              {showsBlocks(format)
                ? format === 'flyer'
                  ? t('promo.blocksHintFlyer')
                  : t('promo.blocksHint')
                : t('promo.blocksHintBanner')}
            </p>
            <div className="divide-y rounded-md border">
              {PROMO_BLOCKS.map((id) => {
                const block = content.blocks[id];
                return (
                  <div key={id} className="p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox
                        id={`promo-block-${id}`}
                        checked={block.enabled}
                        onCheckedChange={(checked) =>
                          updateBlock(id, { enabled: checked === true })
                        }
                      />
                      <Label htmlFor={`promo-block-${id}`} className="flex-1 cursor-pointer">
                        <span className="font-medium">{t(`promo.block.${id}`)}</span>
                        <span className="block text-xs text-muted-foreground font-normal">
                          {t(`promo.block.${id}Hint`)}
                        </span>
                      </Label>
                      {block.enabled && format === 'flyer' && (
                        <Segmented
                          small
                          label={t('promo.side.label')}
                          value={block.back ? 'back' : 'front'}
                          options={[
                            { value: 'front', label: t('promo.side.front') },
                            { value: 'back', label: t('promo.side.back') },
                          ]}
                          onChange={(value) => {
                            updateBlock(id, { back: value === 'back' });
                            setSide(value);
                          }}
                        />
                      )}
                      {block.enabled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title={t('promo.reset')}
                          onClick={() => updateBlock(id, defaultBlock(event, id))}
                        >
                          <RotateCcw className="size-4" />
                          <span className="sr-only">{t('promo.reset')}</span>
                        </Button>
                      )}
                    </div>
                    {block.enabled && (
                      <div className="mt-3 space-y-2 pl-7">
                        <Input
                          aria-label={t('promo.blockHeading')}
                          value={block.title}
                          onChange={(e) => updateBlock(id, { title: e.target.value })}
                        />
                        <Textarea
                          aria-label={t('promo.blockText')}
                          value={block.text}
                          onChange={(e) => updateBlock(id, { text: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="promo-qr"
                    checked={content.qr.enabled}
                    onCheckedChange={(checked) =>
                      setContent((c) => ({ ...c, qr: { ...c.qr, enabled: checked === true } }))
                    }
                  />
                  <Label htmlFor="promo-qr" className="flex-1 cursor-pointer">
                    <span className="font-medium">{t('promo.block.qr')}</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      {t('promo.block.qrHint')}
                    </span>
                  </Label>
                </div>
                {content.qr.enabled && (
                  <div className="mt-3 pl-7">
                    <Input
                      aria-label={t('promo.qrCaption')}
                      value={content.qr.caption}
                      onChange={(e) =>
                        setContent((c) => ({ ...c, qr: { ...c.qr, caption: e.target.value } }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="link"
              size="sm"
              className="px-0 mt-2"
              onClick={() => setContent(() => defaultPromoContent(event, content.audience))}
            >
              <RotateCcw className="size-4 mr-1" />
              {t('promo.resetAll')}
            </Button>
          </Section>

          {/* On phones the preview is far up: download again at the end */}
          {downloadButton('lg:hidden')}
        </div>

        <aside className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4 space-y-3">
            {back && (
              <div className="flex justify-center">
                <Segmented
                  label={t('promo.side.label')}
                  value={shownSide}
                  options={[
                    { value: 'front', label: t('promo.side.frontLong') },
                    { value: 'back', label: t('promo.side.backLong') },
                  ]}
                  onChange={setSide}
                />
              </div>
            )}
            <div className="rounded-lg border bg-muted/40 p-3 sm:p-4 flex justify-center">
              <div
                className={cn(
                  'w-full shadow-lg',
                  format === 'story' && 'max-w-[300px]',
                  format === 'post' && 'max-w-[400px]'
                )}
              >
                <PromoCanvas
                  spec={previewSpec}
                  width={format === 'story' ? 300 : 440}
                  onOverflow={onOverflow}
                  label={t('promo.preview')}
                />
              </div>
            </div>
            {overflow && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {t('promo.overflow')}
              </p>
            )}
            {format === 'poster' && (
              <div className="flex justify-center">
                <Segmented
                  label={t('promo.paper')}
                  value={paper}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'a3', label: 'A3' },
                  ]}
                  onChange={setPaper}
                />
              </div>
            )}
            {downloadButton()}
            <p className="text-xs text-muted-foreground text-center">
              {format === 'flyer' && back
                ? t('promo.downloadHint.flyerBack')
                : t(`promo.downloadHint.${format}`)}
            </p>
            <PromoShare
              makeFile={() => promoFile(spec, event.title, paper)}
              url={publicUrl}
              text={t('promo.share.text', { title: content.title, date: content.dateLine })}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`promo-${id}`} className="text-sm">
        {label}
      </Label>
      <Input id={`promo-${id}`} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

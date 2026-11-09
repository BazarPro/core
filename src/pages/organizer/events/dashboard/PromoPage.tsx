import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Pencil,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import { useMutation, useQuery } from '../../../../lib/api/react';
import type { Id } from '../../../../lib/api/types';
import { useEventAccess } from '../../../../hooks/useEventAccess';
import { PageSkeleton } from '../../../../components/ui/loading';
import { PageHeader } from '../../../../components/ui/page-header';
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
 * Flyers, posters, banners and social media pictures of a bazaar. At first sight only the
 * preview and the few choices most need: format, audience, design. The texts come filled
 * in from the bazaar; changing them, the content blocks and the picture are folded away.
 * The choices are saved with the bazaar (promos.savePromo) for the whole team; an own
 * picture stays on this device.
 */

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

/** A row of two to five options, e.g. A4 | A3 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  small,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex rounded-lg bg-muted p-[3px]', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-md cursor-pointer whitespace-nowrap transition-colors',
            small ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-1.5 text-sm font-medium sm:px-3',
            value === option.value
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

/** A folded row of the "customize" card */
function Fold({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 py-4 text-left cursor-pointer"
      >
        <span className="font-medium">{title}</span>
        {summary && (
          <span className="flex-1 truncate text-sm text-muted-foreground">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && <div className="pb-5 space-y-4">{children}</div>}
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
  const [editing, setEditing] = useState<PromoBlockId | null>(null);

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
  const blocksOn = PROMO_BLOCKS.filter((id) => content.blocks[id].enabled).length;
  const print = PROMO_FORMATS[format].kind === 'print';

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

  return (
    <div className="container mx-auto space-y-6 pb-20">
      <PageHeader
        title={t('promo.title')}
        actions={
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
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Preview: sticks below the app header (69px) */}
        <div className="space-y-3 lg:sticky lg:top-24">
          <div className="rounded-xl border bg-muted/40 p-4 sm:p-8 flex flex-col items-center gap-4">
            {back && (
              <Segmented
                label={t('promo.side.label')}
                value={shownSide}
                options={[
                  { value: 'front', label: t('promo.side.front') },
                  { value: 'back', label: t('promo.side.back') },
                ]}
                onChange={setSide}
              />
            )}
            <div
              className={cn(
                'w-full shadow-lg',
                format === 'story' &&
                  'max-w-[240px] sm:max-w-[300px] lg:max-w-[min(300px,var(--fit))]',
                format === 'post' &&
                  'max-w-[300px] sm:max-w-[400px] lg:max-w-[min(400px,var(--fit))]',
                print && 'max-w-[300px] sm:max-w-[460px] lg:max-w-[min(460px,var(--fit))]'
              )}
              // Beside the settings the whole page fits the window: its height less the
              // header, the frame and the front/back switch
              style={
                {
                  '--fit': `calc((100dvh - ${back ? 15 : 12}rem) * ${promoAspect(format)})`,
                } as CSSProperties
              }
            >
              <PromoCanvas
                spec={previewSpec}
                width={format === 'banner' ? 720 : format === 'story' ? 300 : 460}
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
        </div>

        <div className="space-y-6">
          {/* The choices everybody needs */}
          <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6 space-y-5">
            <Field label={t('promo.label.format')}>
              <Segmented
                className="grid w-full grid-cols-5"
                label={t('promo.label.format')}
                value={format}
                options={(Object.keys(PROMO_FORMATS) as PromoFormatId[]).map((id) => ({
                  value: id,
                  label: t(`promo.format.${id}`),
                }))}
                onChange={(id) => update({ format: id })}
              />
            </Field>

            <Field label={t('promo.label.audience')}>
              <Segmented
                className="flex w-full"
                label={t('promo.label.audience')}
                value={content.audience}
                options={PROMO_AUDIENCES.map((id) => ({
                  value: id,
                  label: t(`promo.audience.${id}`),
                }))}
                onChange={(id) => setContent((c) => switchAudience(c, event, id))}
              />
            </Field>

            <Field label={t('promo.label.design')}>
              <div className="grid grid-cols-4 gap-2">
                {PROMO_DESIGNS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={design === id}
                    onClick={() => update({ design: id })}
                    className={cn(
                      'flex flex-col rounded-lg border-2 p-1 cursor-pointer transition-colors',
                      design === id ? 'border-primary' : 'border-transparent hover:border-border'
                    )}
                  >
                    <div className="flex flex-1 items-center">
                      <PromoCanvas
                        spec={{ ...spec, design: id }}
                        width={format === 'banner' ? 160 : 100}
                        className="rounded-sm shadow-xs"
                        label={t(`promo.design.${id}`)}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t(`promo.design.${id}`)}
                    </div>
                  </button>
                ))}
              </div>
              <div role="group" aria-label={t('promo.color')} className="flex flex-wrap gap-2 pt-1">
                {PROMO_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={color === c}
                    onClick={() => update({ color: c })}
                    className={cn(
                      'size-7 rounded-full cursor-pointer ring-offset-2 ring-offset-card transition',
                      color === c ? 'ring-2 ring-foreground' : 'hover:scale-110'
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Field>

            <div className="space-y-2 border-t pt-5">
              <div className="flex gap-2">
                <Button className="flex-1 gap-2" size="lg" onClick={download} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {t(print ? 'promo.download.pdf' : 'promo.download.png')}
                </Button>
                <PromoShare
                  makeFile={() => promoFile(spec, event.title, paper)}
                  url={publicUrl}
                  text={t('promo.share.text', { title: content.title, date: content.dateLine })}
                />
              </div>
              {format === 'poster' && (
                <Segmented
                  small
                  label={t('promo.paper')}
                  value={paper}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'a3', label: 'A3' },
                  ]}
                  onChange={setPaper}
                />
              )}
              {format === 'flyer' && (
                <p className="text-xs text-muted-foreground">
                  {t(back ? 'promo.downloadHint.flyerBack' : 'promo.downloadHint.flyer')}
                </p>
              )}
            </div>
          </section>

          {/* Everything else, folded away */}
          <section className="rounded-xl border bg-card px-5 shadow-xs sm:px-6 divide-y">
            <Fold title={t('promo.customize.texts')} summary={content.title}>
              <TextField
                id="title"
                label={t('promo.field.title')}
                value={content.title}
                onChange={(title) => setContent((c) => ({ ...c, title }))}
              />
              <TextField
                id="kicker"
                label={t('promo.field.kicker')}
                value={content.kicker}
                onChange={(kicker) => setContent((c) => ({ ...c, kicker }))}
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
              <Button
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => setContent(() => defaultPromoContent(event, content.audience))}
              >
                <RotateCcw className="size-4 mr-1" />
                {t('promo.resetAll')}
              </Button>
            </Fold>

            <Fold
              title={t('promo.customize.blocks')}
              summary={t('promo.blocksCount', { count: blocksOn })}
            >
              {!showsBlocks(format) && (
                <p className="text-sm text-muted-foreground">{t('promo.blocksBanner')}</p>
              )}
              <div className="space-y-1">
                {PROMO_BLOCKS.map((id) => {
                  const block = content.blocks[id];
                  const open = editing === id && block.enabled;
                  return (
                    <div key={id}>
                      <div className="flex items-center gap-3 py-1.5">
                        <Checkbox
                          id={`promo-block-${id}`}
                          checked={block.enabled}
                          onCheckedChange={(checked) =>
                            updateBlock(id, { enabled: checked === true })
                          }
                        />
                        <Label htmlFor={`promo-block-${id}`} className="flex-1 cursor-pointer">
                          {t(`promo.block.${id}`)}
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
                            size="icon"
                            className="size-8"
                            aria-expanded={open}
                            title={t('promo.edit')}
                            onClick={() => setEditing(open ? null : id)}
                          >
                            <Pencil className="size-4" />
                            <span className="sr-only">{t('promo.edit')}</span>
                          </Button>
                        )}
                      </div>
                      {open && (
                        <div className="space-y-2 pb-3 pl-7">
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
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {t('promo.blockSyntax')}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateBlock(id, defaultBlock(event, id))}
                            >
                              <RotateCcw className="size-4 mr-1" />
                              {t('promo.reset')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 py-1.5">
                  <Checkbox
                    id="promo-qr"
                    checked={content.qr.enabled}
                    onCheckedChange={(checked) =>
                      setContent((c) => ({ ...c, qr: { ...c.qr, enabled: checked === true } }))
                    }
                  />
                  <Label htmlFor="promo-qr" className="flex-1 cursor-pointer">
                    {t('promo.block.qr')}
                  </Label>
                </div>
                {content.qr.enabled && (
                  <div className="pl-7">
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
            </Fold>

            <Fold
              title={t('promo.customize.image')}
              summary={ownImage ? t('promo.ownImage') : t('promo.eventImage')}
            >
              <div className="flex gap-4 items-start">
                <div
                  className="h-20 w-28 shrink-0 rounded-md bg-muted bg-cover"
                  style={{
                    backgroundImage: image ? `url(${image.src})` : undefined,
                    backgroundPosition: `50% ${imageFocus}%`,
                  }}
                />
                <div className="flex-1 space-y-2">
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
                        <RotateCcw className="size-4 mr-1" />
                        {t('promo.eventImage')}
                      </Button>
                    )}
                  </div>
                  {ownImage && (
                    <p className="text-xs text-muted-foreground">{t('promo.ownImageHint')}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
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
            </Fold>
          </section>
        </div>
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

import { PageHeader } from '../../components/ui/page-header';
import { useEffect, useMemo, useState } from 'react';
import { useApiClient, useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { BarChart3, ImageIcon, Trash2, Upload } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { Button } from '../../components/ui/button';
import { StickyActionBar } from '../../components/ui/sticky-action-bar';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { InfoTip } from '../../components/ui/info-tip';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { normalizeImageForUpload } from '../../lib/imageProcessing';
import { resolvePlausible } from '../../lib/analyticsConfig';
import { selfHostUrl } from '../../lib/links';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { Trans, useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import {
  applyColorTheme,
  COLOR_THEME_SWATCH,
  COLOR_THEMES,
  type ColorTheme,
} from '../../lib/colorTheme';
import { FormSkeleton, Loading } from '../../components/ui/loading';

/** Name, contact address and logo of this instance. */
export function AdminSettingsPage() {
  const { t, i18n } = useTranslation('admin');
  const config = useQuery(api.instance.getConfig, {});
  const updateSettings = useMutation(api.instance.updateSettings);
  const client = useApiClient();
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startPage, setStartPage] = useState<'overview' | 'currentEvent'>('overview');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('blue');
  const [plausibleEnabled, setPlausibleEnabled] = useState(false);
  const [plausibleDomain, setPlausibleDomain] = useState('');
  const [plausibleApiHost, setPlausibleApiHost] = useState('');

  useEffect(() => {
    if (!config) return;
    setName(config.name ?? '');
    setContactEmail(config.contactEmail ?? '');
    setStartPage(config.startPage);
    setColorTheme(config.colorTheme ?? 'blue');
    // Off unless switched on here or configured on the web server
    setPlausibleEnabled(resolvePlausible(config.plausible) !== null);
    setPlausibleDomain(config.plausible.domain ?? '');
    setPlausibleApiHost(config.plausible.apiHost ?? '');
  }, [config]);

  const fileUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const previewUrl = fileUrl ?? (removeLogo ? null : (config?.logoUrl ?? null));

  const uploadLogo = async (file: File): Promise<Id<'_storage'>> => {
    const image = await normalizeImageForUpload(file, { maxWidth: 600, maxHeight: 600 });
    try {
      return await client.upload(await generateUploadUrl(), image);
    } catch {
      throw new Error(t('settings.logoUploadFailed'));
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const logo = logoFile ? await uploadLogo(logoFile) : removeLogo ? null : undefined;
      await updateSettings({
        name,
        contactEmail,
        logo,
        startPage,
        colorTheme,
        plausible: {
          enabled: plausibleEnabled,
          domain: plausibleDomain,
          apiHost: plausibleApiHost,
        },
      });
      setLogoFile(null);
      setRemoveLogo(false);
      toast.success(t('settings.saved'));
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (config === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('settings.title')} />
        <Loading className="max-w-4xl">
          <FormSkeleton fields={3} />
        </Loading>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} />

      <div className="max-w-4xl space-y-6 rounded-xl border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="instance-name">{t('settings.name')}</Label>
          <Input
            id="instance-name"
            value={name}
            maxLength={80}
            placeholder={t('settings.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('settings.nameHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instance-contact">{t('settings.contact')}</Label>
          <Input
            id="instance-contact"
            type="email"
            value={contactEmail}
            placeholder="basar@example.org"
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instance-logo">{t('settings.logo')}</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {previewUrl ? (
                <img src={previewUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="instance-logo"
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  setLogoFile(e.target.files?.[0] ?? null);
                  setRemoveLogo(false);
                }}
              />
              <Button type="button" variant="outline" size="sm" asChild>
                <label htmlFor="instance-logo" className="cursor-pointer">
                  <Upload /> {t('settings.chooseLogo')}
                </label>
              </Button>
              {previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setLogoFile(null);
                    setRemoveLogo(true);
                  }}
                >
                  <Trash2 /> {t('settings.removeLogo')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <ColorThemePicker
          value={colorTheme}
          saved={config.colorTheme ?? 'blue'}
          onChange={setColorTheme}
        />

        {config.mode === 'single' && (
          <div className="space-y-2">
            <Label>{t('settings.startPage')}</Label>
            <RadioGroup
              value={startPage}
              onValueChange={(value) => setStartPage(value as 'overview' | 'currentEvent')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="overview" id="start-overview" />
                <Label htmlFor="start-overview" className="font-normal">
                  {t('settings.startOverview')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="currentEvent" id="start-current" />
                <Label htmlFor="start-current" className="font-normal">
                  {t('settings.startCurrent')}
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">{t('settings.startHint')}</p>
          </div>
        )}

        <section className="space-y-4 border-t pt-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4" /> {t('settings.analytics')}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="settings.analyticsText"
              ns="admin"
              values={{ directive: '{{webanalyse}}' }}
              components={{
                docs: (
                  <a
                    href={selfHostUrl(i18n.resolvedLanguage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  />
                ),
                code: <code />,
              }}
            />
          </p>
          <div className="flex items-center gap-3">
            <Switch
              id="plausible-enabled"
              checked={plausibleEnabled}
              onCheckedChange={(checked) => setPlausibleEnabled(!!checked)}
            />
            <Label htmlFor="plausible-enabled">{t('settings.analyticsActive')}</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plausible-domain">{t('settings.domain')}</Label>
              <Input
                id="plausible-domain"
                value={plausibleDomain}
                placeholder={runtimeConfig.plausibleDomain || 'basar.example.org'}
                onChange={(e) => setPlausibleDomain(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plausible-host">{t('settings.server')}</Label>
              <Input
                id="plausible-host"
                value={plausibleApiHost}
                placeholder={runtimeConfig.plausibleApiHost || 'https://plausible.example.org'}
                onChange={(e) => setPlausibleApiHost(e.target.value)}
              />
            </div>
          </div>
          {/* The status in words; where empty fields come from is for whoever runs the server */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trans
              i18nKey="settings.analyticsStatus"
              ns="admin"
              values={{
                status: resolvePlausible({
                  enabled: plausibleEnabled,
                  domain: plausibleDomain,
                  apiHost: plausibleApiHost,
                })
                  ? t('settings.on')
                  : t('settings.off'),
              }}
              components={{ b: <b /> }}
            />
            <InfoTip>
              <Trans i18nKey="settings.envHint" ns="admin" components={{ code: <code /> }} />
            </InfoTip>
          </p>
        </section>

        <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <Trans
            i18nKey="settings.mode"
            ns="admin"
            values={{
              mode:
                config.mode === 'single' ? t('settings.modeSingle') : t('settings.modePlatform'),
            }}
            components={{ b: <b /> }}
          />
          <InfoTip>
            <Trans i18nKey="settings.modeHint" ns="admin" components={{ code: <code /> }} />
          </InfoTip>
        </div>
      </div>
      {/* Long form: saving stays in reach at the lower edge, like the other forms */}
      <StickyActionBar className="max-w-4xl md:mx-0 md:px-0 lg:mx-0 lg:px-0">
        <Button loading={isSaving} onClick={save} disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.save')}
        </Button>
      </StickyActionBar>
    </div>
  );
}

/**
 * The colour scheme: one swatch per scheme, the page shows the choice at once. Left
 * without saving, the saved scheme comes back.
 */
function ColorThemePicker({
  value,
  saved,
  onChange,
}: {
  value: ColorTheme;
  saved: ColorTheme;
  onChange: (theme: ColorTheme) => void;
}) {
  const { t } = useTranslation('admin');
  useEffect(() => {
    applyColorTheme(value);
  }, [value]);
  useEffect(() => () => applyColorTheme(saved), [saved]);
  return (
    <div className="space-y-2">
      <Label id="color-theme-label">{t('settings.colorTheme')}</Label>
      <div role="radiogroup" aria-labelledby="color-theme-label" className="flex flex-wrap gap-2">
        {COLOR_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={value === theme}
            onClick={() => onChange(theme)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === theme && 'border-foreground ring-1 ring-foreground'
            )}
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-full"
              style={{ backgroundColor: COLOR_THEME_SWATCH[theme] }}
            />
            {t(`settings.colorThemes.${theme}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.colorThemeHint')}</p>
    </div>
  );
}

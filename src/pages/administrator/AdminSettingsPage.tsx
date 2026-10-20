import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { BarChart3, ImageIcon, Trash2 } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { normalizeImageForUpload } from '../../lib/imageProcessing';
import { resolvePlausible } from '../../lib/analyticsConfig';
import { selfHostUrl } from '../../lib/links';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { AdminGuard, AdminPageHeader } from './components/AdminShared';
import { Trans, useTranslation } from 'react-i18next';

export function AdminSettingsPage() {
  return (
    <AdminGuard>
      <Settings />
    </AdminGuard>
  );
}

/** Name, contact address and logo of this instance. */
function Settings() {
  const { t, i18n } = useTranslation('admin');
  const config = useQuery(api.instance.getConfig, {});
  const updateSettings = useMutation(api.instance.updateSettings);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startPage, setStartPage] = useState<'overview' | 'currentEvent'>('overview');
  const [plausibleEnabled, setPlausibleEnabled] = useState(false);
  const [plausibleDomain, setPlausibleDomain] = useState('');
  const [plausibleApiHost, setPlausibleApiHost] = useState('');

  useEffect(() => {
    if (!config) return;
    setName(config.name ?? '');
    setContactEmail(config.contactEmail ?? '');
    setStartPage(config.startPage);
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
    const result = await fetch(await generateUploadUrl(), {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    });
    if (!result.ok) throw new Error(t('settings.logoUploadFailed'));
    return (await result.json()).storageId;
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
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <div className="max-w-xl space-y-6 rounded-xl border bg-card p-6">
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
            <div className="flex flex-col gap-2">
              <Input
                id="instance-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  setLogoFile(e.target.files?.[0] ?? null);
                  setRemoveLogo(false);
                }}
              />
              {previewUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1 text-muted-foreground"
                  onClick={() => {
                    setLogoFile(null);
                    setRemoveLogo(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('settings.removeLogo')}
                </Button>
              )}
            </div>
          </div>
        </div>

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
          <div className="flex items-center gap-2">
            <Checkbox
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
          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey="settings.envHint"
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
              components={{ code: <code />, b: <b /> }}
            />
          </p>
        </section>

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <Trans
            i18nKey="settings.mode"
            ns="admin"
            values={{
              mode:
                config.mode === 'single' ? t('settings.modeSingle') : t('settings.modePlatform'),
            }}
            components={{ code: <code />, b: <b /> }}
          />
        </div>

        <Button onClick={save} disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

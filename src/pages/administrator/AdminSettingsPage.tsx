import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { ImageIcon, Trash2 } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { normalizeImageForUpload } from '../../lib/imageProcessing';
import { AdminGuard, AdminPageHeader } from './components/AdminShared';

export function AdminSettingsPage() {
  return (
    <AdminGuard>
      <Settings />
    </AdminGuard>
  );
}

/** Name, contact address and logo of this instance. */
function Settings() {
  const config = useQuery(api.instance.getConfig, {});
  const updateSettings = useMutation(api.instance.updateSettings);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setName(config.name ?? '');
    setContactEmail(config.contactEmail ?? '');
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
    if (!result.ok) throw new Error('Das Logo konnte nicht hochgeladen werden.');
    return (await result.json()).storageId;
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const logo = logoFile ? await uploadLogo(logoFile) : removeLogo ? null : undefined;
      await updateSettings({ name, contactEmail, logo });
      setLogoFile(null);
      setRemoveLogo(false);
      toast.success('Einstellungen gespeichert');
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
      <AdminPageHeader
        title="Einstellungen"
        description="Name, Kontakt und Logo dieser BazarPro-Instanz."
      />

      <div className="max-w-xl space-y-6 rounded-xl border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="instance-name">Name</Label>
          <Input
            id="instance-name"
            value={name}
            maxLength={80}
            placeholder="z. B. Kinderkleiderbasar Musterstadt"
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Erscheint auf der Startseite. Leer lassen für „Basar“.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instance-contact">Kontakt-E-Mail</Label>
          <Input
            id="instance-contact"
            type="email"
            value={contactEmail}
            placeholder="basar@example.org"
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instance-logo">Logo</Label>
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
                  <Trash2 className="h-3.5 w-3.5" /> Logo entfernen
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          Modus: <b>{config.mode === 'single' ? 'Ein Verein (single)' : 'Plattform'}</b>. Er wird
          beim Einrichten über <code>BAZARPRO_MODE</code> festgelegt.
        </div>

        <Button onClick={save} disabled={isSaving}>
          {isSaving ? 'Wird gespeichert…' : 'Speichern'}
        </Button>
      </div>
    </div>
  );
}

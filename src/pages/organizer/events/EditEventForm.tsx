import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EditEventBasicInfo } from './components/EditEventBasicInfo';
import { EditEventCategories } from './components/EditEventCategories';
import { EditEventContact } from './components/EditEventContact';
import { EditEventAccess } from './components/EditEventAccess';
import { EditEventMapSection } from './components/EditEventMapSection';
import {
  EVENT_SERVICES,
  EVENT_VISIBILITY,
  type EventServices,
  type EventVisibility,
} from '../../../../convex/constants';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Copy } from 'lucide-react';

const eventSchema = z
  .object({
    title: z.string().min(3, 'Titel muss mindestens 3 Zeichen haben'),
    description: z.string().min(10, 'Beschreibung muss mindestens 10 Zeichen haben'),
    location: z.string().min(1, 'Ort ist erforderlich'),
    startDate: z
      .string()
      .refine((val) => new Date(val).toString() !== 'Invalid Date', 'Ungültiges Startdatum')
      .refine((val) => {
        const d = new Date(val);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return d >= tomorrow;
      }, 'Startdatum muss in der Zukunft liegen (frühestens Morgen)'),
    endDate: z
      .string()
      .refine((val) => new Date(val).toString() !== 'Invalid Date', 'Ungültiges Enddatum'),
    categories: z.array(z.string()).min(1, 'Mindestens eine Kategorie wählen'),
    services: z.array(z.enum(EVENT_SERVICES)),
    contactInfo: z.string().min(1, 'Kontaktinfo erforderlich'),
    commission: z.number().min(0).max(100),
    visibility: z.enum(EVENT_VISIBILITY),
    accessCode: z.string().optional(),
    vendorLimit: z.number().optional().or(z.nan()),
    coverImageFile: z.any().optional(),
    removeCoverImage: z.boolean().optional(),
    eventMapImageFile: z.any().optional(),
    removeEventMapImage: z.boolean().optional(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'Enddatum muss nach dem Startdatum liegen',
    path: ['endDate'],
  });

type EventFormData = z.infer<typeof eventSchema>;

export function EditEventForm() {
  const navigate = useNavigate();
  const createEvent = useMutation(api.events.createEvent);
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const { isEventCreationEnabled } = useFeatureFlags();

  const params = useParams();
  const eventId = params.eventId as Id<'events'> | undefined;
  const isEditing = !!eventId;

  const editEvent = useMutation(api.events.editEvent);
  const createLocationCategory = useMutation(api.eventLocationCategories.createCategory);
  const event = useQuery(api.events.getEvent, eventId ? { id: eventId! } : 'skip');
  const [pendingLocationCategories, setPendingLocationCategories] = useState<string[]>([]);

  const categories = useQuery(api.categories.getAllCategories);
  const pastEvents = useQuery(api.events.getMyEvents, !isEditing ? { includePast: true } : 'skip');

  function formatForDateTimeLocal(timestamp: number): string {
    // function to render time from database to local string for preview in form
    const d = new Date(timestamp);
    const offset = d.getTimezoneOffset();
    const localtime = new Date(timestamp - offset * 60 * 1000);
    return localtime.toISOString().slice(0, 16); // local time as string for field datetime-local
  }

  const methods = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    mode: 'onTouched',
    defaultValues: {
      title: event ? event.title : '',
      description: event ? event.description : '',
      location: event ? event.location : '',
      startDate: event ? formatForDateTimeLocal(event.startDate) : '',
      endDate: event ? formatForDateTimeLocal(event.endDate) : '',
      categories: event ? event.categories : [],
      services: event ? (event.services as EventServices[]) : [EVENT_SERVICES[0]],
      contactInfo: event ? event.contactInfo : '',
      commission: event ? event.commission : 15,
      visibility: event ? (event.visibility as EventVisibility) : EVENT_VISIBILITY[0],
      accessCode: event ? event.accessCode : '',
      vendorLimit: event ? event.vendorLimit : undefined,
      coverImageFile: undefined,
      removeCoverImage: false,
      eventMapImageFile: undefined,
      removeEventMapImage: false,
    },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (!event || !isEditing) return;

    reset({
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: formatForDateTimeLocal(event.startDate),
      endDate: formatForDateTimeLocal(event.endDate),
      categories: event.categories,
      services: event.services as EventServices[],
      contactInfo: event.contactInfo,
      commission: event.commission,
      visibility: event.visibility as EventVisibility,
      accessCode: event.accessCode || '',
      vendorLimit: event.vendorLimit,
      coverImageFile: undefined,
      removeCoverImage: false,
      eventMapImageFile: undefined,
      removeEventMapImage: false,
    });
  }, [event, isEditing, reset]);

  const handleTemplateSelect = (templateId: string) => {
    const template = pastEvents?.find((e) => e._id === templateId);
    if (template) {
      reset({
        title: template.title,
        description: template.description,
        location: template.location,
        startDate: '',
        endDate: '',
        categories: template.categories,
        services: template.services as EventServices[],
        contactInfo: template.contactInfo,
        commission: template.commission,
        visibility: template.visibility as EventVisibility,
        accessCode: template.accessCode || '',
        vendorLimit: template.vendorLimit,
        coverImageFile: undefined,
        removeCoverImage: false,
      });
      toast.info('Daten von Vorlage übernommen. Bitte Daten anpassen.');
    }
  };

  const onSubmit = async (data: EventFormData) => {
    if (!isEventCreationEnabled && !isEditing) return;

    try {
      let coverImage: Id<'_storage'> | undefined = undefined;
      if (data.coverImageFile instanceof File) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': data.coverImageFile.type },
          body: data.coverImageFile,
        });
        const { storageId } = await result.json();
        coverImage = storageId;
      }

      let eventMapImage: Id<'_storage'> | undefined = undefined;
      if (data.eventMapImageFile instanceof File) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': data.eventMapImageFile.type },
          body: data.eventMapImageFile,
        });
        const { storageId } = await result.json();
        eventMapImage = storageId;
      }

      if (isEditing && eventId) {
        const editPayload: {
          id: Id<'events'>;
          title: string;
          description: string;
          location: string;
          startDate: number;
          endDate: number;
          contactInfo: string;
          commission: number;
          visibility: EventVisibility;
          categories: Id<'categories'>[];
          services: EventServices[];
          accessCode?: string;
          vendorLimit?: number;
          coverImage?: Id<'_storage'>;
          eventMapImage?: Id<'_storage'>;
          clearCoverImage?: boolean;
          clearEventMapImage?: boolean;
        } = {
          id: eventId,
          title: data.title,
          description: data.description,
          location: data.location,
          startDate: new Date(data.startDate).getTime(),
          endDate: new Date(data.endDate).getTime(),
          contactInfo: data.contactInfo,
          commission: data.commission,
          visibility: data.visibility,
          categories: data.categories as Id<'categories'>[],
          services: data.services,
          accessCode: data.accessCode || undefined,
          vendorLimit:
            typeof data.vendorLimit === 'number' && !isNaN(data.vendorLimit)
              ? data.vendorLimit
              : undefined,
        };

        if (coverImage) {
          editPayload.coverImage = coverImage;
        }
        if (!coverImage && data.removeCoverImage) {
          editPayload.clearCoverImage = true;
        }
        if (eventMapImage) {
          editPayload.eventMapImage = eventMapImage;
        }
        if (!eventMapImage && data.removeEventMapImage) {
          editPayload.clearEventMapImage = true;
        }

        await editEvent(editPayload);
        toast.success('Veranstaltung erfolgreich aktualisiert');

        navigate('/events/view/' + eventId);
      } else {
        const newEventId = await createEvent({
          title: data.title,
          description: data.description,
          location: data.location,
          startDate: new Date(data.startDate).getTime(),
          endDate: new Date(data.endDate).getTime(),
          contactInfo: data.contactInfo,
          commission: data.commission,
          visibility: data.visibility,
          categories: data.categories as Id<'categories'>[],
          services: data.services,
          accessCode: data.accessCode || undefined,
          vendorLimit:
            typeof data.vendorLimit === 'number' && !isNaN(data.vendorLimit)
              ? data.vendorLimit
              : undefined,
          coverImage,
          eventMapImage,
        });
        for (const label of pendingLocationCategories) {
          const trimmed = label.trim();
          if (trimmed) {
            await createLocationCategory({ eventId: newEventId, label: trimmed });
          }
        }
        setPendingLocationCategories([]);
        toast.success('Veranstaltung erfolgreich erstellt');
        navigate('/my-events');
      }
    } catch (error) {
      console.error('Failed to create/edit event:', error);
      toast.error('Veranstaltung konnte nicht gespeichert werden', {
        description: getUserFacingErrorMessage(error),
      });
    }
  };

  if (isEditing && event === undefined) {
    return <div>Laden...</div>;
  }
  if (!categories) {
    return <div>Laden...</div>;
  }
  if (isEditing && event === null) {
    return <div>Event nicht gefunden</div>;
  }

  return (
    <div>
      <div className="container mx-auto">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl mb-2">
              {isEditing ? 'Veranstaltung bearbeiten' : 'Neue Veranstaltung erstellen'}
            </h1>
          </div>

          {!isEditing && pastEvents && pastEvents.length > 0 && (
            <div className="mb-8 p-4 bg-muted/30 rounded-lg border border-dashed flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">Daten übernehmen</div>
                  <div className="text-xs text-muted-foreground">
                    Nutze eine deiner vergangenen Veranstaltungen als Vorlage.
                  </div>
                </div>
              </div>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger className="w-full sm:w-[250px] bg-background">
                  <SelectValue placeholder="Vorlage wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {pastEvents.map((e) => (
                    <SelectItem key={e._id} value={e._id}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isEventCreationEnabled && !isEditing && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>
                Die Erstellung neuer Veranstaltungen ist derzeit deaktiviert.
              </AlertDescription>
            </Alert>
          )}

          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <fieldset disabled={!isEventCreationEnabled && !isEditing} className="space-y-8">
                <EditEventBasicInfo initialCoverImageUrl={event?.coverImageUrl} />
                <EditEventMapSection
                  eventId={isEditing ? eventId : undefined}
                  initialEventMapUrl={event?.eventMapImageUrl}
                  pendingLocationCategories={pendingLocationCategories}
                  onPendingLocationCategoriesChange={setPendingLocationCategories}
                />
                <EditEventCategories categoryList={categories} />
                <EditEventContact />
                <EditEventAccess />
              </fieldset>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={isSubmitting || (!isEventCreationEnabled && !isEditing)}
                >
                  {isSubmitting
                    ? 'Wird erstellt...'
                    : isEditing
                      ? 'Speichern'
                      : 'Veranstaltung erstellen'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => navigate(isEditing ? '/events/view/' + eventId : '/my-events')}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </Button>
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </div>
  );
}

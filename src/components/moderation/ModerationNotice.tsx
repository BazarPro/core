import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { formatDateDEShort } from '../../lib/utils';

interface ModerationNoticeProps {
  moderation: { hiddenAt: number; reason: string } | undefined;
  /** "Artikel" or "Veranstaltung" */
  subject: string;
  /** "ausgeblendet" or "gesperrt" */
  verb?: string;
}

/** Tells the owner and the event team why content is hidden from everybody else. */
export function ModerationNotice({
  moderation,
  subject,
  verb = 'ausgeblendet',
}: ModerationNoticeProps) {
  if (!moderation) return null;
  return (
    <Alert variant="destructive" data-testid="moderation-notice">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>
        {subject} von der Moderation {verb}
      </AlertTitle>
      <AlertDescription>
        <p>
          Seit {formatDateDEShort(moderation.hiddenAt)} nur noch für dich, dein Team und die
          Administratoren sichtbar. Begründung: {moderation.reason}
        </p>
        <p>Wenn du die Entscheidung für falsch hältst, schreib uns über das Kontaktformular.</p>
      </AlertDescription>
    </Alert>
  );
}

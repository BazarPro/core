import { Button } from '../ui/button';

interface OnboardingStopPanelProps {
  onCancel: () => void;
  onConfirm: () => void;
  radius?: 'lg' | 'xl';
}

export function OnboardingStopPanel({
  onCancel,
  onConfirm,
  radius = 'lg',
}: OnboardingStopPanelProps) {
  const radiusClass = radius === 'xl' ? 'rounded-xl' : 'rounded-lg';
  const widthClass =
    radius === 'xl'
      ? 'min-w-[320px] max-w-lg'
      : 'min-w-[280px] max-w-sm';

  return (
    <div
      className={`${radiusClass} ${widthClass} bg-background border border-border/70 shadow-xl dark:shadow-black/50 flex flex-col justify-between p-4 sm:p-6 w-full`}
    >
      <div>
        <h3 className="font-semibold mb-1">Willst du das Onboarding wirklich beenden?</h3>
        <p className="text-sm text-muted-foreground">
          Es dauert nur 1–2 Minuten und hilft dir, schnell loszulegen.
        </p>
        <p className="text-sm text-muted-foreground">
          Du kannst das Onboarding jederzeit über den Button unten rechts erneut starten, wenn du
          später Hilfe brauchst.
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Zurück zum Onboarding
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm}>
          Beenden
        </Button>
      </div>
    </div>
  );
}

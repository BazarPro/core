import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { switchServer } from './settings';

/**
 * Instead of a white screen: the app could not start with the saved server (it failed,
 * or the server is gone or too old). Try again, or choose another server.
 */
export function StartProblem({
  server,
  reason,
}: {
  server: string;
  reason: 'failed' | 'outdated';
}) {
  const { t } = useTranslation('common');
  const host = hostOf(server);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 pt-[env(safe-area-inset-top)]">
      <div
        role="alert"
        className="w-full max-w-md space-y-4 rounded-lg border bg-card p-8 text-center"
      >
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">{t('app.start.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(`app.start.${reason}`, { server: host })}
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => window.location.reload()}>{t('app.start.retry')}</Button>
          <Button variant="outline" onClick={switchServer}>
            {t('app.server.switch')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function hostOf(server: string) {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

/**
 * Around the whole app: an error no page catches (e.g. a query of the header) shows
 * StartProblem instead of unmounting everything.
 */
export class AppErrorBoundary extends Component<
  { server: string; children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('App failed:', error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <StartProblem server={this.props.server} reason="failed" />;
  }
}

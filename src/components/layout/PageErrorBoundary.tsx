import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '../../lib/api/client';
import { useApiClient } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { RetryButton } from '../ui/loading';

function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const client = useApiClient();
  // Texts of backend errors are meant for users, those of crashes are not
  const detail = error instanceof ApiError ? getUserFacingErrorMessage(error) : null;

  return (
    <div className="container mx-auto flex min-h-[40vh] items-center justify-center px-4">
      <div role="alert" className="max-w-md space-y-4 rounded-lg border bg-card p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">{t('loadState.failed')}</h1>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        <RetryButton
          onRetry={() => {
            client.retryFailed();
            onRetry();
          }}
        />
      </div>
    </div>
  );
}

/**
 * Shows an error with "Try again" instead of a blank app when a page fails, e.g. a query
 * that keeps failing after its retries. Another page (`resetKey`) starts fresh.
 */
export class PageErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { error: unknown; resetKey: string }
> {
  state = { error: null as unknown, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error: unknown; resetKey: string }
  ) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Page failed:', error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <PageError error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

/** The error boundary for the routes: going to another page clears the error. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
}

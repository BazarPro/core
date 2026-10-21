import { useState } from 'react';
import { useMutation, useQuery } from '../../lib/api/react';
import { Mail } from 'lucide-react';
import { api } from '../../lib/api/functions';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../lib/moderation';
import { AdminGuard, AdminPageHeader, EmptyState, FilterTabs } from './components/AdminShared';
import { useTranslation } from 'react-i18next';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';

export function AdminMessagesPage() {
  return (
    <AdminGuard>
      <Messages />
    </AdminGuard>
  );
}

function Messages() {
  const { t } = useTranslation('admin');
  const { brand } = useInstanceConfig();
  const [tab, setTab] = useState<'open' | 'handled'>('open');
  const messages = useQuery(api.moderation.listMessages, { handled: tab === 'handled' });
  const counts = useQuery(api.moderation.getMenuCounts, {});
  const setHandled = useMutation(api.moderation.setMessageHandled);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('messages.title')} description={t('messages.subtitle')} />

      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: t('messages.open'), count: counts?.unhandledMessages },
          { value: 'handled', label: t('messages.handled') },
        ]}
      />

      {messages === undefined ? (
        <EmptyState>{t('messages.loading')}</EmptyState>
      ) : messages.length === 0 ? (
        <EmptyState>{t('messages.none')}</EmptyState>
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => (
            <li key={message._id} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{message.name}</p>
                  <a
                    href={`mailto:${message.email}`}
                    className="text-sm text-muted-foreground underline"
                  >
                    {message.email}
                  </a>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{message.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`mailto:${message.email}?subject=${encodeURIComponent(t('messages.replySubject', { brand }))}`}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {t('messages.reply')}
                  </a>
                </Button>
                <Button
                  variant={message.handledAt ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={() =>
                    setHandled({ messageId: message._id, handled: !message.handledAt })
                  }
                >
                  {message.handledAt ? t('messages.reopen') : t('messages.markDone')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

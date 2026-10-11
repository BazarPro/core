import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Mail } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../lib/moderation';
import { AdminGuard, AdminPageHeader, EmptyState, FilterTabs } from './components/AdminShared';

export function AdminMessagesPage() {
  return (
    <AdminGuard>
      <Messages />
    </AdminGuard>
  );
}

function Messages() {
  const [tab, setTab] = useState<'open' | 'handled'>('open');
  const messages = useQuery(api.moderation.listMessages, { handled: tab === 'handled' });
  const counts = useQuery(api.moderation.getMenuCounts, {});
  const setHandled = useMutation(api.moderation.setMessageHandled);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Kontaktanfragen"
        description="Nachrichten aus dem Kontaktformular, auch Widersprüche gegen Moderationsentscheidungen."
      />

      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'open', label: 'Offen', count: counts?.unhandledMessages },
          { value: 'handled', label: 'Erledigt' },
        ]}
      />

      {messages === undefined ? (
        <EmptyState>Lade Nachrichten…</EmptyState>
      ) : messages.length === 0 ? (
        <EmptyState>Keine Nachrichten.</EmptyState>
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
                    href={`mailto:${message.email}?subject=${encodeURIComponent('Deine Anfrage an BazarPro')}`}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Antworten
                  </a>
                </Button>
                <Button
                  variant={message.handledAt ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={() =>
                    setHandled({ messageId: message._id, handled: !message.handledAt })
                  }
                >
                  {message.handledAt ? 'Wieder öffnen' : 'Als erledigt markieren'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

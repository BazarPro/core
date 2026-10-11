import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { MessageCircleQuestion, Trash2 } from 'lucide-react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '../../../../components/ui/button';
import { Textarea } from '../../../../components/ui/text-area';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { ReportButton } from '../../../../components/moderation/ReportDialog';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../../../components/moderation/ModerationActionDialog';

interface PublicProductQuestionsProps {
  productId: Id<'products'>;
  /** The event of the item's current listing allows new questions. */
  canAsk: boolean;
  isLoggedIn: boolean;
  isOwner: boolean;
}

function AnswerForm({
  questionId,
  initial,
  onDone,
}: {
  questionId: Id<'productQuestions'>;
  initial?: string;
  onDone: () => void;
}) {
  const answer = useMutation(api.productQuestions.answer);
  const [text, setText] = useState(initial ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setIsSaving(true);
    try {
      await answer({ questionId, answer: text });
      toast.success('Antwort gespeichert');
      onDone();
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        rows={2}
        maxLength={1000}
        placeholder="Deine Antwort (für alle sichtbar)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button size="sm" onClick={submit} disabled={isSaving || !text.trim()}>
        {initial ? 'Antwort ändern' : 'Antworten'}
      </Button>
    </div>
  );
}

/** Public questions and answers about an item. */
export function PublicProductQuestions({
  productId,
  canAsk,
  isLoggedIn,
  isOwner,
}: PublicProductQuestionsProps) {
  const questions = useQuery(api.productQuestions.listForProduct, { productId });
  const ask = useMutation(api.productQuestions.ask);
  const remove = useMutation(api.productQuestions.remove);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<Id<'productQuestions'> | null>(null);
  const isAdmin = useQuery(api.moderation.isViewerAdmin, {});
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  if (questions === undefined) return null;
  if (!canAsk && questions.length === 0) return null;

  const submit = async () => {
    setIsSaving(true);
    try {
      await ask({ productId, question: text });
      setText('');
      toast.success('Deine Frage wurde an den Verkäufer geschickt.');
    } catch (error) {
      toast.error('Frage konnte nicht gesendet werden', {
        description: getUserFacingErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (questionId: Id<'productQuestions'>) => {
    try {
      await remove({ questionId });
    } catch (error) {
      toast.error('Fehler', { description: getUserFacingErrorMessage(error) });
    }
  };

  return (
    <div className="bg-card border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Fragen zum Artikel</h3>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Fragen.</p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <li key={q._id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{q.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.askerName}, {new Date(q.createdAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {!q.isMine && !q.canAnswer && !isAdmin && (
                    <ReportButton targetType="question" targetId={q._id} label="" />
                  )}
                  {isAdmin && !q.isMine && !q.canAnswer ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Frage moderieren"
                      onClick={() =>
                        setRequest({ kind: 'deleteQuestion', id: q._id, label: q.question })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    (q.isMine || q.canAnswer) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Frage löschen"
                        onClick={() => handleRemove(q._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )
                  )}
                </div>
              </div>
              {q.answer && editing !== q._id && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <span className="font-medium">Antwort: </span>
                  <span className="whitespace-pre-wrap">{q.answer}</span>
                  {q.canAnswer && (
                    <button
                      className="ml-2 text-xs text-primary underline"
                      onClick={() => setEditing(q._id)}
                    >
                      ändern
                    </button>
                  )}
                </div>
              )}
              {q.canAnswer && (!q.answer || editing === q._id) && (
                <AnswerForm questionId={q._id} initial={q.answer} onDone={() => setEditing(null)} />
              )}
              {!q.answer && !q.canAnswer && (
                <p className="text-xs text-muted-foreground italic">Noch nicht beantwortet</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAsk && !isOwner && (
        <div className="space-y-2 pt-2">
          {isLoggedIn ? (
            <>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Deine Frage an den Verkäufer (für alle sichtbar)"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button onClick={submit} disabled={isSaving || text.trim().length < 3}>
                {isSaving ? 'Wird gesendet...' : 'Frage stellen'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link to="/login" className="text-primary underline">
                Melde dich an
              </Link>
              , um eine Frage zu stellen.
            </p>
          )}
        </div>
      )}

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}

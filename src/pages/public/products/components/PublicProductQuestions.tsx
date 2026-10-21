import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '../../../../lib/api/react';
import { toast } from 'sonner';
import { MessageCircleQuestion, Trash2 } from 'lucide-react';
import { api } from '../../../../lib/api/functions';
import type { Id } from '../../../../lib/api/types';
import { Button } from '../../../../components/ui/button';
import { Textarea } from '../../../../components/ui/text-area';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { ReportButton } from '../../../../components/moderation/ReportDialog';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../../../components/moderation/ModerationActionDialog';
import { loginPath } from '../../../../lib/loginRedirect';
import { Trans, useTranslation } from 'react-i18next';
import { dateLocale } from '../../../../i18n/format';

interface PublicProductQuestionsProps {
  productId: Id<'products'>;
  /** The event of the item's current listing allows new questions. */
  canAsk: boolean;
  /** Questions are allowed, but only once the event runs: the time they open. */
  opensAt?: number;
  isLoggedIn: boolean;
  /** Seller or organizer view: answer and delete questions. */
  canManage: boolean;
  /** Administrator view: remove questions as moderation. */
  canModerate: boolean;
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
  const { t } = useTranslation('product');
  const answer = useMutation(api.productQuestions.answer);
  const [text, setText] = useState(initial ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setIsSaving(true);
    try {
      await answer({ questionId, answer: text });
      toast.success(t('questions.answerSaved'));
      onDone();
    } catch (error) {
      toast.error(t('questions.error'), { description: getUserFacingErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        rows={2}
        maxLength={1000}
        placeholder={t('questions.answerPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button size="sm" onClick={submit} disabled={isSaving || !text.trim()}>
        {initial ? t('questions.changeAnswer') : t('questions.answer')}
      </Button>
    </div>
  );
}

/** Public questions and answers about an item. */
export function PublicProductQuestions({
  productId,
  canAsk,
  opensAt,
  isLoggedIn,
  canManage,
  canModerate,
}: PublicProductQuestionsProps) {
  const { t } = useTranslation('product');
  const location = useLocation();
  const questions = useQuery(api.productQuestions.listForProduct, { productId });
  const ask = useMutation(api.productQuestions.ask);
  const remove = useMutation(api.productQuestions.remove);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<Id<'productQuestions'> | null>(null);
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  if (questions === undefined) return null;
  if (!canAsk && opensAt === undefined && questions.length === 0) return null;

  const submit = async () => {
    setIsSaving(true);
    try {
      await ask({ productId, question: text });
      setText('');
      toast.success(t('questions.sent'));
    } catch (error) {
      toast.error(t('questions.sendFailed'), {
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
      toast.error(t('questions.error'), { description: getUserFacingErrorMessage(error) });
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">{t('questions.title')}</h2>
        {questions.length > 0 && (
          <span className="text-sm text-muted-foreground">({questions.length})</span>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('questions.none')}</p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => {
            const canAnswer = q.canAnswer && canManage;
            return (
              <li key={q._id} className="space-y-2 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{q.question}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.askerName}, {new Date(q.createdAt).toLocaleDateString(dateLocale())}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    {!q.isMine && !q.canAnswer && !canManage && !canModerate && (
                      <ReportButton targetType="question" targetId={q._id} label="" />
                    )}
                    {canModerate && !q.isMine ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('questions.moderate')}
                        onClick={() =>
                          setRequest({ kind: 'deleteQuestion', id: q._id, label: q.question })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      (q.isMine || canAnswer) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('questions.delete')}
                          onClick={() => handleRemove(q._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
                {q.answer && editing !== q._id && (
                  <div className="rounded-lg border-l-2 border-primary bg-muted/60 p-3 text-sm">
                    <span className="font-medium">{t('questions.answerLabel')}</span>
                    <span className="whitespace-pre-wrap">{q.answer}</span>
                    {canAnswer && (
                      <button
                        className="ml-2 text-xs text-primary underline"
                        onClick={() => setEditing(q._id)}
                      >
                        {t('questions.edit')}
                      </button>
                    )}
                  </div>
                )}
                {canAnswer && (!q.answer || editing === q._id) && (
                  <AnswerForm
                    questionId={q._id}
                    initial={q.answer}
                    onDone={() => setEditing(null)}
                  />
                )}
                {!q.answer && !canAnswer && (
                  <p className="text-xs text-muted-foreground italic">
                    {t('questions.unanswered')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!canAsk && opensAt !== undefined && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t('questions.opensAt', {
            date: new Date(opensAt).toLocaleString(dateLocale(), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}

      {canAsk && (
        <div className="space-y-2 rounded-xl border border-dashed p-4">
          {isLoggedIn ? (
            <>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder={t('questions.askPlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button onClick={submit} disabled={isSaving || text.trim().length < 3}>
                {isSaving ? t('questions.sending') : t('questions.ask')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans
                i18nKey="questions.loginToAsk"
                ns="product"
                components={{
                  login: (
                    <Link
                      to={loginPath(location.pathname + location.search)}
                      className="text-primary underline"
                    />
                  ),
                }}
              />
            </p>
          )}
        </div>
      )}

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </section>
  );
}

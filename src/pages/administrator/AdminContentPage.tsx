import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { Package, Search, X } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/moderation';
import { AdminGuard, AdminPageHeader, EmptyState, FilterTabs } from './components/AdminShared';
import { useTranslation } from 'react-i18next';

type Tab = 'products' | 'questions';

export function AdminContentPage() {
  return (
    <AdminGuard>
      <Content />
    </AdminGuard>
  );
}

function Content() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'questions' ? 'questions' : 'products';
  const userId = (params.get('user') ?? undefined) as Id<'users'> | undefined;
  const onlyHidden = params.get('hidden') === '1';
  const [search, setSearch] = useState('');
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const user = useQuery(api.moderation.getUserSummary, userId ? { userId } : 'skip');

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('content.title')} description={t('content.subtitle')} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          value={tab}
          onChange={(value) => setParam('tab', value === 'products' ? undefined : value)}
          options={[
            { value: 'products', label: t('content.products') },
            { value: 'questions', label: t('content.questions') },
          ]}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'products' ? t('content.searchProducts') : t('content.searchText')}
            className="pl-9"
            aria-label={t('content.searchLabel')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {userId && (
          <Badge variant="secondary" className="gap-1 py-1">
            {t('content.userFilter', { name: user?.name ?? user?.email ?? '…' })}
            <button
              type="button"
              onClick={() => setParam('user', undefined)}
              aria-label={t('content.removeUserFilter')}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {tab === 'products' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyHidden}
              onChange={(e) => setParam('hidden', e.target.checked ? '1' : undefined)}
            />
            {t('content.onlyHidden')}
          </label>
        )}
      </div>

      {tab === 'products' ? (
        <ProductList
          search={search}
          vendorId={userId}
          onlyHidden={onlyHidden}
          onRequest={setRequest}
        />
      ) : (
        <QuestionList search={search} askerId={userId} onRequest={setRequest} />
      )}

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}

function ProductList({
  search,
  vendorId,
  onlyHidden,
  onRequest,
}: {
  search: string;
  vendorId?: Id<'users'>;
  onlyHidden: boolean;
  onRequest: (request: ModerationRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const products = useQuery(api.moderation.listProducts, { search, vendorId, onlyHidden });
  const restoreProduct = useMutation(api.moderation.restoreProduct);

  if (products === undefined) return <EmptyState>{t('content.loadingProducts')}</EmptyState>;
  if (products.length === 0) return <EmptyState>{t('content.noProducts')}</EmptyState>;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {products.map((product) => (
        <li
          key={product._id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
          data-testid="admin-content-product"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Package className="h-6 w-6 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0">
              <Link to={`/products/view/${product._id}`} className="font-semibold hover:underline">
                {product.title}
              </Link>
              <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
              <p className="text-xs text-muted-foreground">
                {product.price.toFixed(2).replace('.', ',')} € ·{' '}
                <Link to={`/admin/users?user=${product.vendorId}`} className="underline">
                  {product.vendorName}
                </Link>{' '}
                · {formatDateTime(product._creationTime)}
              </p>
              {product.moderation && (
                <p className="mt-1 text-xs text-destructive">
                  {t('content.hidden', { reason: product.moderation.reason })}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {product.sold && <Badge variant="secondary">{t('content.sold')}</Badge>}
            {product.moderation ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await restoreProduct({ productId: product._id });
                    toast.success(t('content.visibleAgain'));
                  } catch (error) {
                    toast.error(t('content.error'), {
                      description: getUserFacingErrorMessage(error),
                    });
                  }
                }}
              >
                {t('content.showAgain')}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  onRequest({ kind: 'hideProduct', id: product._id, label: product.title })
                }
              >
                {t('content.hide')}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuestionList({
  search,
  askerId,
  onRequest,
}: {
  search: string;
  askerId?: Id<'users'>;
  onRequest: (request: ModerationRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const questions = useQuery(api.moderation.listQuestions, { search, askerId });

  if (questions === undefined) return <EmptyState>{t('content.loadingQuestions')}</EmptyState>;
  if (questions.length === 0) return <EmptyState>{t('content.noQuestions')}</EmptyState>;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {questions.map((question) => (
        <li
          key={question._id}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
          data-testid="admin-content-question"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">
              <Link to={`/products/view/${question.productId}`} className="underline">
                {question.productTitle}
              </Link>{' '}
              ·{' '}
              <Link to={`/admin/users?user=${question.askerId}`} className="underline">
                {question.askerName}
              </Link>{' '}
              · {formatDateTime(question.createdAt)}
            </p>
            <p className="font-medium">{question.question}</p>
            {question.answer && (
              <p className="border-l-2 pl-3 text-sm text-muted-foreground">{question.answer}</p>
            )}
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() =>
              onRequest({ kind: 'deleteQuestion', id: question._id, label: question.question })
            }
          >
            {t('content.delete')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

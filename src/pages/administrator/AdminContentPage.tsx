import { SearchInput } from '../../components/ui/search-input';
import { PageHeader } from '../../components/ui/page-header';
import { EmptyState } from '../../components/ui/empty-state';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '../../lib/api/react';
import { toast } from 'sonner';
import { Package, X } from 'lucide-react';
import { api } from '../../lib/api/functions';
import type { Id } from '../../lib/api/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  ModerationActionDialog,
  type ModerationRequest,
} from '../../components/moderation/ModerationActionDialog';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/moderation';
import { FilterTabs } from './components/AdminShared';
import { useTranslation } from 'react-i18next';
import { ListSkeleton, Loading } from '../../components/ui/loading';
import { Pagination } from '../../components/ui/pagination';

const LIST_TOP = 'admin-content-top';

type Tab = 'products' | 'questions';

export function AdminContentPage() {
  const { t } = useTranslation('admin');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'questions' ? 'questions' : 'products';
  const userId = (params.get('user') ?? undefined) as Id<'users'> | undefined;
  const onlyHidden = params.get('hidden') === '1';
  // In the address, so going back from an item returns to the same page
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState('');
  const [request, setRequest] = useState<ModerationRequest | null>(null);

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Another filter is another list: it starts on its first page
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const setPage = (value: number) => setParam('page', value > 1 ? String(value) : undefined);

  const user = useQuery(api.moderation.getUserSummary, userId ? { userId } : 'skip');

  return (
    <div className="space-y-6">
      <PageHeader title={t('content.title')} />

      <div
        id={LIST_TOP}
        className="flex scroll-mt-20 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <FilterTabs
          value={tab}
          onChange={(value) => setParam('tab', value === 'products' ? undefined : value)}
          options={[
            { value: 'products', label: t('content.products') },
            { value: 'questions', label: t('content.questions') },
          ]}
        />
        <SearchInput
          className="w-full lg:max-w-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setParam('page', undefined);
          }}
          placeholder={tab === 'products' ? t('content.searchProducts') : t('content.searchText')}
          aria-label={t('content.searchLabel')}
        />
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
            <Checkbox
              checked={onlyHidden}
              onCheckedChange={(checked) => setParam('hidden', checked ? '1' : undefined)}
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
          page={page}
          onPageChange={setPage}
          onRequest={setRequest}
        />
      ) : (
        <QuestionList
          search={search}
          askerId={userId}
          page={page}
          onPageChange={setPage}
          onRequest={setRequest}
        />
      )}

      <ModerationActionDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}

function ProductList({
  search,
  vendorId,
  onlyHidden,
  page,
  onPageChange,
  onRequest,
}: {
  search: string;
  vendorId?: Id<'users'>;
  onlyHidden: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onRequest: (request: ModerationRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const result = useQuery(api.moderation.listProducts, { search, vendorId, onlyHidden, page });
  const restoreProduct = useMutation(api.moderation.restoreProduct);

  if (result === undefined) return <ListLoading />;
  if (result.items.length === 0) return <EmptyState title={t('content.noProducts')} />;

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border bg-card">
        {result.items.map((product) => (
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
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-6 w-6 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to={`/products/view/${product._id}`}
                  className="break-words font-semibold hover:underline"
                >
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
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
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
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        onPageChange={onPageChange}
        scrollRefId={LIST_TOP}
      />
    </div>
  );
}

function QuestionList({
  search,
  askerId,
  page,
  onPageChange,
  onRequest,
}: {
  search: string;
  askerId?: Id<'users'>;
  page: number;
  onPageChange: (page: number) => void;
  onRequest: (request: ModerationRequest) => void;
}) {
  const { t } = useTranslation('admin');
  const result = useQuery(api.moderation.listQuestions, { search, askerId, page });

  if (result === undefined) return <ListLoading />;
  if (result.items.length === 0) return <EmptyState title={t('content.noQuestions')} />;

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border bg-card">
        {result.items.map((question) => (
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
              <p className="break-words font-medium">{question.question}</p>
              {question.answer && (
                <p className="border-l-2 pl-3 text-sm text-muted-foreground">{question.answer}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={() =>
                onRequest({ kind: 'deleteQuestion', id: question._id, label: question.question })
              }
            >
              {t('content.delete')}
            </Button>
          </li>
        ))}
      </ul>
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        onPageChange={onPageChange}
        scrollRefId={LIST_TOP}
      />
    </div>
  );
}

function ListLoading() {
  return (
    <Loading>
      <ListSkeleton rows={4} />
    </Loading>
  );
}

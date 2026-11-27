import { ArrowRight, Home, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { BrandMark } from '../../../components/layout/BrandMark';

/** An address that leads nowhere: says so, and offers the two ways on instead of the start page. */
export function NotFoundPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="page-narrow flex flex-col items-center py-16 text-center">
      <BrandMark className="size-14" />
      <p className="mt-6 font-display text-sm font-bold uppercase tracking-wider text-primary">
        404
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{t('notFound.title')}</h1>
      <p className="mt-3 max-w-md text-pretty text-muted-foreground">
        {t('notFound.text', { path: pathname })}
      </p>
      <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg">
          <Link to="/bazaars">
            <Search className="h-4 w-4" />
            {t('notFound.find')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/">
            <Home className="h-4 w-4" />
            {t('notFound.home')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

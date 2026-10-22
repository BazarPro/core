import { Navigate, useParams } from 'react-router-dom';
import { shortProductLinkTarget } from '../../../shared/productLinks';

/** Short link of a printed label; the web server forwards it before the app loads. */
export function ShortProductLink() {
  const { productId = '' } = useParams();
  return <Navigate to={shortProductLinkTarget(`/p/${productId}`) ?? '/'} replace />;
}

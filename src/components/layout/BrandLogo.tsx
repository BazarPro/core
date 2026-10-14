import { ShoppingBag } from 'lucide-react';
import { useInstanceConfig } from '../../hooks/useInstanceConfig';

/** Logo and name: BazarPro, or the association on a self-hosted instance. */
export function BrandLogo() {
  const { isSingle, brand, logoUrl } = useInstanceConfig();
  if (isSingle && logoUrl) {
    return (
      <>
        <img src={logoUrl} alt="" className="h-7 w-auto max-w-[3rem] object-contain" />
        <span className="text-xl truncate">{brand}</span>
      </>
    );
  }
  return (
    <>
      <ShoppingBag className="h-6 w-6 text-primary" />
      <span className="text-xl truncate">{brand}</span>
    </>
  );
}

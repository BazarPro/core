import { useInstanceConfig } from '../../hooks/useInstanceConfig';
import { BrandMark } from './BrandMark';

/** Logo and name: BazarPro, or the association on a self-hosted instance. */
export function BrandLogo() {
  const { isSingle, brand, logoUrl } = useInstanceConfig();
  if (isSingle && logoUrl) {
    return (
      <>
        <img src={logoUrl} alt="" className="h-7 w-auto max-w-[3rem] object-contain" />
        <span className="font-display text-xl font-bold tracking-tight truncate">{brand}</span>
      </>
    );
  }
  // "BazarPro" gets its two-tone word mark; another brand name is set in one colour
  const pro = brand.endsWith('Pro') ? brand.length - 3 : -1;
  return (
    <>
      <BrandMark />
      {/* A little smaller on the narrowest phones, so it keeps clear of "Anmelden" */}
      <span className="font-display text-lg font-extrabold tracking-tight truncate min-[360px]:text-[1.375rem]">
        {pro > 0 ? (
          <>
            {brand.slice(0, pro)}
            <span className="text-primary dark:text-tag">Pro</span>
          </>
        ) : (
          brand
        )}
      </span>
    </>
  );
}

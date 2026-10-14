import { describe, expect, it } from 'vitest';
import { loginPath, safeRedirectPath } from './loginRedirect';

describe('loginRedirect', () => {
  it('keeps same-site paths with query', () => {
    expect(safeRedirectPath('/products/view/abc?x=1')).toBe('/products/view/abc?x=1');
    expect(loginPath('/products/view/abc')).toBe('/login?redirect=%2Fproducts%2Fview%2Fabc');
  });

  it('rejects other sites and auth pages', () => {
    expect(safeRedirectPath('https://evil.example')).toBeNull();
    expect(safeRedirectPath('//evil.example')).toBeNull();
    expect(safeRedirectPath('/\\evil.example')).toBeNull();
    expect(safeRedirectPath('/login?redirect=/x')).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('/register')).toBe('/login');
  });
});

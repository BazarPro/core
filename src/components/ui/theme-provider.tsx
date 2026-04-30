import { useEffect, useState, type ReactNode } from 'react';
import { type Theme, type ResolvedTheme, ThemeContext } from './theme-context';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('bazarpro-theme');
    return (saved as Theme) || 'light';
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (next: ResolvedTheme) => {
      root.classList.remove('light', 'dark');
      root.classList.add(next);
      setResolvedTheme(next);
    };

    const handleSystemChange = () => {
      if (theme !== 'system') return;
      applyTheme(media.matches ? 'dark' : 'light');
    };

    if (theme === 'system') {
      applyTheme(media.matches ? 'dark' : 'light');
      if (media.addEventListener) {
        media.addEventListener('change', handleSystemChange);
      } else {
        media.addListener(handleSystemChange);
      }
    } else {
      applyTheme(theme);
    }

    localStorage.setItem('bazarpro-theme', theme);

    return () => {
      if (theme !== 'system') return;
      if (media.removeEventListener) {
        media.removeEventListener('change', handleSystemChange);
      } else {
        media.removeListener(handleSystemChange);
      }
    };
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

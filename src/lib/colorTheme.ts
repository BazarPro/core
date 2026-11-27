/**
 * Colour schemes an admin can choose for the installation (Admin → Einstellungen). Each
 * swaps the action colour only (src/styles/index.css, `[data-brand]`); blue is the default.
 */
export const COLOR_THEMES = ['blue', 'petrol', 'green', 'violet', 'orange', 'red'] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

/** The action colour of each scheme in the light theme, for the swatches of the setting */
export const COLOR_THEME_SWATCH: Record<ColorTheme, string> = {
  blue: '#1d4ed8',
  petrol: '#0e5e63',
  green: '#15803d',
  violet: '#6d28d9',
  orange: '#c2410c',
  red: '#be123c',
};

const STORAGE_KEY = 'bazarpro.colorTheme';

/** Sets the scheme on the page and remembers it, so the next visit starts in it. */
export function applyColorTheme(theme: ColorTheme | undefined) {
  const root = document.documentElement;
  if (!theme || theme === 'blue') delete root.dataset.brand;
  else root.dataset.brand = theme;
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the scheme comes with the config on every visit
  }
}

/** The scheme of the last visit, before the config has loaded. */
export function rememberedColorTheme(): ColorTheme | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return COLOR_THEMES.find((theme) => theme === stored);
  } catch {
    return undefined;
  }
}

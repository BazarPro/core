import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../convex/constants';
import { resources } from './resources';

type Tree = Record<string, unknown>;

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keys(value as Tree, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}|<(\w+)>/g)].map((m) => m[1] ?? m[2]).sort();
}

function lookup(tree: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);
}

describe('translations', () => {
  const source = resources.de;

  it.each(LOCALES.filter((locale) => locale !== 'de'))(
    '%s has every text of German, with the same placeholders',
    (locale) => {
      const target = resources[locale];
      expect(Object.keys(target ?? {}).sort()).toEqual(Object.keys(source).sort());
      for (const [namespace, texts] of Object.entries(source)) {
        const translated = target[namespace] as Tree;
        expect(keys(translated).sort(), `${locale}/${namespace}`).toEqual(
          keys(texts as Tree).sort()
        );
        for (const key of keys(texts as Tree)) {
          const original = String(lookup(texts as Tree, key));
          const text = String(lookup(translated, key));
          expect(text.trim(), `${locale}/${namespace}:${key} is empty`).not.toBe('');
          expect(placeholders(text), `${locale}/${namespace}:${key}`).toEqual(
            placeholders(original)
          );
        }
      }
    }
  );
});

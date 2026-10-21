import type deErrors from '../locales/de/errors.json';

/** Codes of the errors users see; the texts are in src/locales/<language>/errors.json. */

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type ErrorCode = Leaves<typeof deErrors>;

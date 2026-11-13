import { de } from './de';
import { en } from './en';
import { it } from './it';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const LOCALES = ['de', 'en', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export const catalogs: Record<Locale, Messages> = { de, en, it };

/** Keys present in some language but missing in another, as `<locale>: <key>`. */
export function missingKeys(
  all: Record<string, Record<string, string>>,
): string[] {
  const keys = new Set(Object.values(all).flatMap((m) => Object.keys(m)));
  return Object.entries(all).flatMap(([locale, messages]) =>
    [...keys].filter((k) => !(k in messages)).map((k) => `${locale}: ${k}`),
  );
}

import ar from "./messages/ar.json";
import en from "./messages/en.json";
import type { Locale } from "./config";

export type Dictionary = typeof ar;

// الإنجليزي لازم يكون فيه نفس مفاتيح العربي بالظبط (TypeScript بيتأكد)
const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

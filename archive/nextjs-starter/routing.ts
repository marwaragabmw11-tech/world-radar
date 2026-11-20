import {defineRouting} from "next-intl/routing";

export const locales = ["ar", "en", "he", "fr", "es", "de", "pt", "ja", "zh"] as const;
export type Locale = (typeof locales)[number];

export const rtlLocales: Locale[] = ["ar", "he"];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always"
});

export function getDirection(locale: string): "rtl" | "ltr" {
  return rtlLocales.includes(locale as Locale) ? "rtl" : "ltr";
}

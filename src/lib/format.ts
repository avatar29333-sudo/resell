import type { Locale } from "@/i18n/config";

type Num = number | string | { toString(): string } | null | undefined;

/** نص بلغتين: L("عربي", "English") */
export function tr(locale: Locale) {
  return (ar: string, en: string) => (locale === "ar" ? ar : en);
}

export function toNum(v: Num): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

const intl = (locale: Locale) => (locale === "ar" ? "ar-EG" : "en-US");

export function num(v: Num, locale: Locale, digits = 0) {
  return new Intl.NumberFormat(intl(locale), { maximumFractionDigits: digits }).format(toNum(v));
}

export function money(v: Num, currency: string | null | undefined, locale: Locale) {
  const cur = currency ?? "EGP";
  const n = num(v, locale, cur === "USD" ? 2 : 0);
  if (cur === "USD") return locale === "ar" ? `${n} دولار` : `$${n}`;
  return locale === "ar" ? `${n} ج.م` : `EGP ${n}`;
}

export function date(d: Date | string | null | undefined, locale: Locale) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(intl(locale), { year: "numeric", month: "short", day: "numeric", timeZone: TZ }).format(new Date(d));
}

/** كل التواريخ بتوقيت القاهرة مهما كان السيرفر فين */
const TZ = "Africa/Cairo";

/**
 * UX-05: أي وقت (ساعة) بيتعرض بتوقيت القاهرة ومكتوب جنبه صراحة «بتوقيت القاهرة» —
 * عشان العميل اللي في الخليج أو أوروبا ما يتلخبطش.
 */
export function dateTime(d: Date | string | null | undefined, locale: Locale) {
  if (!d) return "—";
  const s = new Intl.DateTimeFormat(intl(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(d));
  return `${s} ${locale === "ar" ? "بتوقيت القاهرة" : "Cairo time"}`;
}

/** الساعة بس (لنفس اليوم) — برضه بتوقيت القاهرة ومكتوب */
export function timeOnly(d: Date | string | null | undefined, locale: Locale) {
  if (!d) return "—";
  const s = new Intl.DateTimeFormat(intl(locale), { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
  return `${s} ${locale === "ar" ? "بتوقيت القاهرة" : "Cairo time"}`;
}

export function daysUntil(d: Date | string | null | undefined) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

/** +201001234567 → +20 100 ••• 4567 */
export function maskPhone(phone: string) {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, phone.length - 7)} ••• ${phone.slice(-4)}`;
}

/** يشيل المسافات والشرط ويحوّل الأرقام العربية، ويضيف + */
export function normalizePhone(input: string) {
  const western = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let p = western.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  if (p.startsWith("01") && p.length === 11) p = `+20${p.slice(1)}`; // رقم مصري محلي
  if (!p.startsWith("+")) p = `+${p}`;
  return p;
}

export function isValidPhone(p: string) {
  return /^\+[1-9]\d{8,14}$/.test(p);
}

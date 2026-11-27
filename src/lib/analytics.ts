/** MKT-11 — أسماء الأحداث الموحّدة + الموافقة (مشترك بين السيرفر والمتصفح) */
export const EVENTS = ["lead_rescue_submitted", "valuation_requested", "listing_submitted", "interest_registered", "commission_signed", "deal_closed", "referral_signup"] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];
export const CONSENT_COOKIE = "rs_consent";

export const isEvent = (e: string | null | undefined): e is AnalyticsEvent => !!e && (EVENTS as readonly string[]).includes(e);

/** IDs التتبع من متغيرات البيئة — لو مش موجودة ما بيتحمّلش أي حاجة */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

/** الدومينات اللي الـ CSP بيفتحها بس لو الـ IDs متظبطة */
export function analyticsCsp() {
  return {
    connect: [GA_ID && "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com", META_PIXEL_ID && "https://www.facebook.com https://connect.facebook.net"].filter(Boolean).join(" "),
    img: [GA_ID && "https://*.google-analytics.com https://www.googletagmanager.com", META_PIXEL_ID && "https://www.facebook.com"].filter(Boolean).join(" "),
  };
}

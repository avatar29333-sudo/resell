/**
 * MKT-10 — تتبع المصدر (منطق نقي، متغطي باختبار).
 * أول لمسة (first-touch) بتتحفظ مرة واحدة، وآخر لمسة (last-touch) بتتحدّث مع كل زيارة جاية من حملة أو موقع تاني.
 */
export type Touch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  ref?: string;
  landing?: string;
  at: string;
};

export const FT_COOKIE = "rs_ft";
export const LT_COOKIE = "rs_lt";
export const REF_COOKIE = "rs_ref";
export const TOUCH_MAX_AGE = 90 * 86400;
export const REF_MAX_AGE = 60 * 86400;

const clip = (s: string | null | undefined, n = 80) => (s ? s.replace(/[^\p{L}\p{N}_.\-/ ]/gu, "").slice(0, n) : undefined);

/** لمسة من الرابط والـ referrer — null لو الزيارة داخلية ومفيهاش utm ولا كود إحالة */
export function touchFrom(url: URL, referrer: string | null, ownHost: string, now = new Date()): Touch | null {
  const p = url.searchParams;
  const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((k) => [k, clip(p.get(k))]).filter(([, v]) => v));
  let refHost: string | undefined;
  try {
    refHost = referrer ? new URL(referrer).hostname : undefined;
  } catch {
    refHost = undefined;
  }
  const external = refHost && refHost !== ownHost ? refHost : undefined;
  const ref = clip(p.get("ref"), 24)?.toUpperCase();
  if (!Object.keys(utm).length && !external && !ref) return null;
  return { ...utm, ...(external ? { referrer: external } : {}), ...(ref ? { ref } : {}), landing: clip(url.pathname, 120), at: now.toISOString() };
}

export const encodeTouch = (t: Touch) => encodeURIComponent(JSON.stringify(t));
export function decodeTouch(v: string | undefined): Touch | null {
  if (!v) return null;
  try {
    const t = JSON.parse(decodeURIComponent(v));
    return t && typeof t === "object" && typeof t.at === "string" ? (t as Touch) : null;
  } catch {
    return null;
  }
}

/** المصدر اللي بيتخزن مع المستخدم / الطلب / الصفقة */
export function sourceOf(first: Touch | null, last: Touch | null) {
  return first || last ? { first: first ?? last, last: last ?? first } : null;
}

/** اسم المصدر للتقارير (MKT-12): utm_source، وإلا الموقع اللي جه منه، وإلا «إحالة»، وإلا «مباشر» */
export function channelOf(src: { first?: Touch | null } | null | undefined) {
  const t = src?.first;
  if (!t) return "direct";
  if (t.utm_source) return `${t.utm_source}${t.utm_campaign ? ` / ${t.utm_campaign}` : ""}`;
  if (t.ref) return "referral";
  if (t.referrer) return t.referrer;
  return "direct";
}

"use client";

import { useEffect, useState } from "react";
import { CONSENT_COOKIE, GA_ID, META_PIXEL_ID, isEvent, type AnalyticsEvent } from "@/lib/analytics";

type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: ((...a: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean } };

const readConsent = () => document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1] ?? null;
const setConsent = (v: "granted" | "denied") => {
  document.cookie = `${CONSENT_COOKIE}=${v}; path=/; max-age=${180 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
};

function loadTags() {
  const w = window as W;
  if (GA_ID && !w.gtag) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
    w.dataLayer = w.dataLayer || [];
    w.gtag = (...a: unknown[]) => w.dataLayer!.push(a);
    w.gtag("js", new Date());
    w.gtag("config", GA_ID, { anonymize_ip: true });
  }
  if (META_PIXEL_ID && !w.fbq) {
    const q: unknown[] = [];
    const fbq = ((...a: unknown[]) => q.push(a)) as W["fbq"] & object;
    fbq.queue = q;
    w.fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    w.fbq!("init", META_PIXEL_ID);
    w.fbq!("track", "PageView");
  }
}

/** بيبعت الحدث بس لو فيه موافقة */
export function track(name: AnalyticsEvent, params: Record<string, string | number> = {}) {
  if (typeof window === "undefined" || readConsent() !== "granted") return;
  const w = window as W;
  w.gtag?.("event", name, params);
  w.fbq?.("trackCustom", name, params);
}

/**
 * MKT-11: بانر الموافقة على الكوكيز (عربي/إنجليزي). من غير موافقة: مفيش Google tag ولا Meta Pixel.
 * لو مفيش IDs متظبطة أصلاً، البانر ما بيظهرش (مفيش كوكيز تتبع).
 */
export function ConsentBanner({ ar }: { ar: boolean }) {
  const [state, setState] = useState<"unknown" | "granted" | "denied">("unknown");
  const enabled = !!(GA_ID || META_PIXEL_ID);
  useEffect(() => {
    const c = readConsent();
    setState(c === "granted" || c === "denied" ? c : "unknown");
    if (c === "granted") loadTags();
  }, []);
  if (!enabled || state !== "unknown") return null;
  return (
    <div role="dialog" aria-label={ar ? "الموافقة على الكوكيز" : "Cookie consent"} className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white p-4 shadow-[0_-8px_30px_rgba(10,25,68,0.12)] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6">
          {ar
            ? "بنستخدم كوكيز قياس (Google و Meta) عشان نعرف الإعلانات اللي بتوصلنا لعملاء. مش هنشغّلها غير بموافقتك."
            : "We use measurement cookies (Google and Meta) to learn which ads bring us clients. We only turn them on with your consent."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConsent("denied");
              setState("denied");
            }}
            className="inline-flex min-h-11 items-center border border-line px-4 font-semibold"
          >
            {ar ? "لا شكراً" : "No thanks"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConsent("granted");
              setState("granted");
              loadTags();
            }}
            className="inline-flex min-h-11 items-center bg-brand px-4 font-semibold text-white"
          >
            {ar ? "موافق" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** بيبعت حدث مرة واحدة لما الصفحة تتعرض بعد فعل نجح (?ev=...) */
export function TrackEvent({ name }: { name: string | null | undefined }) {
  useEffect(() => {
    if (isEvent(name)) track(name);
  }, [name]);
  return null;
}

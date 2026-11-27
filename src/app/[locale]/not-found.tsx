"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/** UX-11: صفحة 404 بنفس التصميم، بالعربي والإنجليزي */
export default function NotFound() {
  const p = useParams<{ locale?: string }>();
  const ar = p?.locale !== "en";
  const base = ar ? "/ar" : "/en";
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-5 px-5 py-20 md:px-8">
      <span className="text-sm font-semibold text-muted">404</span>
      <h1 className="text-3xl font-bold text-navy md:text-4xl">{ar ? "الصفحة دي مش موجودة" : "This page doesn't exist"}</h1>
      <p className="leading-8 text-muted">
        {ar ? "ممكن الرابط اتكتب غلط، أو العرض اتسحب أو مش متاح لحسابك." : "The link may be mistyped, or the listing was withdrawn or isn't available to your account."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={`${base}/listings`} className="inline-flex min-h-11 items-center bg-brand px-5 font-semibold text-white">
          {ar ? "سجل العروض" : "Listings register"}
        </Link>
        <Link href={base} className="inline-flex min-h-11 items-center border border-line px-5 font-semibold">
          {ar ? "الصفحة الرئيسية" : "Home"}
        </Link>
      </div>
    </section>
  );
}

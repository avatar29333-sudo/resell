"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

/** UX-11: صفحة الخطأ بنفس التصميم، بالعربي والإنجليزي — من غير تفاصيل تقنية للمستخدم */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const p = useParams<{ locale?: string }>();
  const ar = p?.locale !== "en";
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-start gap-5 px-5 py-20 md:px-8">
      <span className="text-sm font-semibold text-muted">{ar ? "حصل خطأ" : "Something went wrong"}</span>
      <h1 className="text-3xl font-bold text-navy md:text-4xl">{ar ? "معلش، حصلت مشكلة عندنا" : "Sorry, something went wrong on our side"}</h1>
      <p className="leading-8 text-muted">
        {ar ? "جرّب تاني بعد لحظة. لو المشكلة فضلت، كلّمنا وقول لنا الرقم ده:" : "Please try again in a moment. If it keeps happening, contact us with this reference:"}{" "}
        {error.digest && (
          <code dir="ltr" className="bg-paper px-1.5">
            {error.digest}
          </code>
        )}
      </p>
      <div className="flex flex-wrap gap-3">
        <button onClick={reset} className="inline-flex min-h-11 items-center bg-brand px-5 font-semibold text-white">
          {ar ? "جرّب تاني" : "Try again"}
        </button>
        <Link href={ar ? "/ar" : "/en"} className="inline-flex min-h-11 items-center border border-line px-5 font-semibold">
          {ar ? "الصفحة الرئيسية" : "Home"}
        </Link>
      </div>
    </section>
  );
}

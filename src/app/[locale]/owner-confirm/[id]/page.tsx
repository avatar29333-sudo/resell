import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { publishedFor, userVars } from "@/lib/contract-vars";
import { renderTemplate } from "@/lib/templates";
import { money, num, tr } from "@/lib/format";
import { CITY } from "@/lib/labels";
import { toNum } from "@/lib/format";
import { Card, Container, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { pageMeta } from "@/lib/meta";
import { confirmOwner } from "./actions";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ ok?: string; err?: string }> };
export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "تأكيد عرض قطعتك", "Confirm your listing", { noindex: true });

/** PUB-03 — المالك بيأكّد بالكود (من غير دخول) إنه فوّض الشريك/الوسيط يعرض قطعته */
export default async function OwnerConfirm({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const l = await db.listing.findUnique({ where: { id }, include: { plot: true, seller: true, submittedBy: true } });
  if (!l || !l.submittedById || l.submittedById === l.sellerId) notFound();
  const tv = await publishedFor({ key: "listing_authorization" });
  const text = tv ? renderTemplate(tv.bodyMarkdown, await userVars(l.seller, tv.version, { plot_city: (CITY[l.plot.city] ?? [l.plot.city])[0], plot_district: l.plot.district, plot_round: "—", plot_code: l.plot.code, plot_area: String(toNum(l.plot.areaSqm)), listing_price: toNum(l.price).toLocaleString("en-US") })).text : "";
  const ERR: Record<string, string> = {
    code: L("الكود غلط.", "Wrong code."),
    agree: L("علّم على مربع الموافقة.", "Tick the consent box."),
    expired: L("الرابط ده انتهى أو اتأكد قبل كده.", "This link expired or was already confirmed."),
    locked: L("محاولات كتير غلط — الكود اتقفل. اطلب من اللي عرض القطعة يبعت كود جديد.", "Too many wrong attempts — the code is locked. Ask the lister to send a new one."),
  };
  return (
    <>
      <PageHeader title={L("تأكيد عرض قطعتك للبيع", "Confirm your plot listing")} />
      <Container className="flex max-w-2xl flex-col gap-4">
        {sp.ok ? (
          <Notice tone="green">{L("شكراً — اتأكد إنك موافق، والعرض اتبعت للمراجعة القانونية قبل النشر.", "Thank you — your consent is recorded and the listing went to legal review before publishing.")}</Notice>
        ) : l.ownerConfirmedAt ? (
          <Notice tone="green">{L("العرض ده اتأكد قبل كده.", "This listing was already confirmed.")}</Notice>
        ) : (
          <Card title={L(`${l.submittedBy?.name} عايز يعرض قطعتك نيابة عنك`, `${l.submittedBy?.name} wants to list your plot on your behalf`)}>
            <p>
              {(CITY[l.plot.city] ?? [l.plot.city])[locale === "ar" ? 0 : 1]} — {l.plot.district} — <span dir="ltr">{l.plot.code}</span> — {num(l.plot.areaSqm, locale)} {L("م²", "m²")} — {money(l.price, "EGP", locale)}
            </p>
            {sp.err && ERR[sp.err] && <Notice tone="red">{ERR[sp.err]}</Notice>}
            <div tabIndex={0} dir="rtl" className="max-h-72 overflow-auto border border-line bg-paper p-3 text-sm leading-7 whitespace-pre-wrap">
              {text}
            </div>
            <form action={confirmOwner.bind(null, locale, id)} className="flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm leading-6">
                <input type="checkbox" name="agree" required className="mt-1 size-5 shrink-0" />
                {L(`قرأت نموذج «تفويض عرض القطعة» (نسخة v${tv?.version ?? 1}) وأوافق عليه، وأقرّ بصحة البيانات، وأعلم أن هذه الموافقة مع الكود تُعد توقيعاً مني.`, `I have read the listing authorization (version v${tv?.version ?? 1}), agree to it, confirm the data, and understand this consent with the code counts as my signature.`)}
              </label>
              <label className={labelCls}>
                {L("الكود اللي وصلك في الرسالة", "The code from the message")}
                <input name="code" required inputMode="numeric" maxLength={6} dir="ltr" autoComplete="one-time-code" className={`${field} w-40 text-lg tracking-widest`} />
              </label>
              <button className={`${btn.primary} self-start`}>{L("أوافق على عرض قطعتي", "I agree to list my plot")}</button>
            </form>
            <p className="text-sm text-muted">{L("لو مش إنت اللي فوّضته، ما تعملش حاجة — العرض مش هيتنشر من غير تأكيدك.", "If you didn't authorize this, do nothing — the listing won't be published without your confirmation.")}</p>
          </Card>
        )}
      </Container>
    </>
  );
}

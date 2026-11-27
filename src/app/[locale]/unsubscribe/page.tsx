import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, Notice, PageHeader } from "@/components/ui";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "إيقاف التنبيهات", "Stop alerts", { noindex: true });

/** MKT-04 + MKT-13: رابط الإيقاف اللي في كل رسالة — ضغطة واحدة من غير دخول */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const { t } = await searchParams;
  let done = false;
  if (t && /^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    const r = await db.deadlineReminder.updateMany({ where: { unsubToken: t, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
    const b = await db.buyRequest.updateMany({ where: { unsubToken: t, alertConsentAt: { not: null } }, data: { alertConsentAt: null } });
    done = r.count + b.count > 0 || (await db.deadlineReminder.count({ where: { unsubToken: t } })) + (await db.buyRequest.count({ where: { unsubToken: t } })) > 0;
    if (r.count + b.count > 0) await audit(null, "alerts.unsubscribe", "Token", t.slice(0, 6), { reminders: r.count, buyRequests: b.count });
  }
  return (
    <>
      <PageHeader title={L("إيقاف التنبيهات", "Stop alerts")} />
      <Container className="flex max-w-2xl flex-col gap-4">
        {done ? (
          <Notice tone="green">{L("اتوقفت — مش هنبعت لك تنبيهات تاني على الرقم ده.", "Stopped — you won't get these alerts again.")}</Notice>
        ) : (
          <Notice tone="amber">{L("الرابط ده مش صحيح أو قديم.", "This link is invalid or expired.")}</Notice>
        )}
        <Link href={`/${locale}`} className="text-brand">
          {L("الرجوع للصفحة الرئيسية", "Back to the home page")}
        </Link>
      </Container>
    </>
  );
}

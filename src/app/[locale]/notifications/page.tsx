import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateTime, tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, Empty, PageHeader, btn } from "@/components/ui";

async function markAllRead(locale: string) {
  "use server";
  const l = isLocale(locale) ? locale : "ar";
  const me = await requireUser(l, `/${l}/notifications`);
  await db.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath(`/${l}`, "layout");
}

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "الإشعارات", "Notifications", { noindex: true });

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/notifications`);
  const items = await db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title={L("الإشعارات", "Notifications")}
        subtitle={L(
          "كل خطوة مهمة في صفقاتك وعروضك. لما واتساب والإيميل يتربطوا، هتوصلك هناك كمان.",
          "Every important step in your deals and listings. Once WhatsApp and email are connected, you'll get them there too.",
        )}
        actions={
          unread > 0 && (
            <form action={markAllRead.bind(null, locale)}>
              <button className="inline-flex min-h-11 items-center bg-white px-5 font-semibold text-navy hover:bg-paper">
                {L("علّم الكل كمقروء", "Mark all as read")}
              </button>
            </form>
          )
        }
      />
      <Container className="max-w-3xl">
        {items.length === 0 ? (
          <Empty>{L("مفيش إشعارات لسه.", "No notifications yet.")}</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line border border-line bg-white">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 p-4 ${n.readAt ? "" : "bg-[#F3F6FD]"}`}>
                <span aria-hidden="true" className={`mt-2 size-2 shrink-0 ${n.readAt ? "bg-transparent" : "bg-brand"}`} />
                <div className="flex flex-1 flex-col gap-0.5">
                  {n.link ? (
                    // روابط الـ API (تنزيل لمرة واحدة) <a> عادي — من غير prefetch يستهلك الرابط
                    n.link.startsWith("/api/") ? (
                      <a href={n.link} className="font-semibold text-navy hover:text-brand">
                        {n.title}
                      </a>
                    ) : (
                      <Link href={n.link} className="font-semibold text-navy hover:text-brand">
                        {n.title}
                      </Link>
                    )
                  ) : (
                    <span className="font-semibold">{n.title}</span>
                  )}
                  {n.body && <span className="text-sm text-muted">{n.body}</span>}
                  <span className="text-[13px] text-muted">
                    {dateTime(n.createdAt, locale)}
                    {n.sentVia && ` · ${n.sentVia === "whatsapp" ? L("اتبعت واتساب", "sent on WhatsApp") : L("اتبعت إيميل", "sent by email")}`}
                  </span>
                </div>
                {n.link && (
                  <a href={n.link} className={`${btn.small} border border-line`}>
                    {L("افتح", "Open")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}

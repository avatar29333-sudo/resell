import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateTime, num, tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { CITY, CITY_KEYS, label } from "@/lib/labels";
import { Badge, Card, Container, Empty, Notice, PageHeader, Table, btn, field, labelCls } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { broadcastRelief, reviewStory } from "./actions";
import { bothConsented, dealDays, storyText } from "@/lib/stories";
import { Funnel } from "./Funnel";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "التسويق", "Marketing", { noindex: true });

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ ok?: string; err?: string; n?: string; from?: string; to?: string }> };

/** MKT-04 + MKT-12: لوحة التسويق للأدمن */
export default async function MarketingPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const sp = await searchParams;
  const L = tr(locale);
  await requireUser(locale, `/${locale}/marketing`, ["ADMIN"]);
  const stories = await db.dealStory.findMany({ where: { status: { not: "REJECTED" } }, include: { deal: { include: { listing: { include: { plot: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 });
  const [subsByCity, outbox] = await Promise.all([
    db.deadlineReminder.groupBy({ by: ["city"], where: { unsubscribedAt: null }, _count: true }),
    db.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  return (
    <>
      <PageHeader title={L("التسويق", "Marketing")} subtitle={L("المصادر والحملات، وتنبيهات المشتركين، والرسايل الخارجة.", "Sources and campaigns, subscriber alerts and outgoing messages.")} />
      <Container className="flex flex-col gap-6">
        {sp.ok === "broadcast" && <Notice tone="green">{L(`اتجهزت ${num(Number(sp.n ?? 0), locale)} رسالة للمشتركين.`, `${sp.n ?? 0} messages queued for subscribers.`)}</Notice>}
        {sp.ok === "spend" && <Notice tone="green">{L("المصروف اتسجل.", "Spend saved.")}</Notice>}
        {sp.err === "broadcast" && <Notice tone="red">{L("اختار المدينة واكتب الرسالة (20 حرف على الأقل).", "Choose the city and write the message (20+ characters).")}</Notice>}
        {sp.err === "story" && <Notice tone="red">{L("القصة ما بتتنشرش غير بموافقة الطرفين.", "A story can only be published with both parties' consent.")}</Notice>}
        {sp.ok === "story" && <Notice tone="green">{L("اتحفظ.", "Saved.")}</Notice>}
        {sp.err === "spend" && <Notice tone="red">{L("اكتب اسم الحملة والشهر والمبلغ.", "Enter the campaign, month and amount.")}</Notice>}

        <Funnel locale={locale} from={sp.from} to={sp.to} />

        {/* MKT-14: قصص الصفقات */}
        <Card title={L("قصص الصفقات (بموافقة الطرفين)", "Deal stories (with both parties' consent)")}>
          {stories.length === 0 ? (
            <Empty>{L("مفيش قصص مستنية مراجعة.", "No stories awaiting review.")}</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {stories.map((s) => {
                const ready = bothConsented(s);
                const city = s.deal.listing.plot.city;
                const days = dealDays(s.deal.createdAt, s.deal.closedAt);
                const code = s.showPlotCode ? s.deal.listing.plot.code : null;
                return (
                  <li key={s.id} className="flex flex-col gap-2 border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong>#{s.dealId.slice(-6).toUpperCase()}</strong>
                      <Badge tone={s.buyerConsentAt ? "green" : "gray"}>{L("المشتري", "Buyer")} {s.buyerConsentAt ? "✓" : "…"}</Badge>
                      <Badge tone={s.sellerConsentAt ? "green" : "gray"}>{L("البائع", "Seller")} {s.sellerConsentAt ? "✓" : "…"}</Badge>
                      <Badge tone={s.status === "PUBLISHED" ? "green" : s.status === "REJECTED" ? "red" : "amber"}>{s.status}</Badge>
                    </div>
                    <form action={reviewStory.bind(null, locale, s.id)} className="flex flex-col gap-2">
                      <textarea name="textAr" defaultValue={s.textAr ?? storyText("ar", CITY[city][0], days, code)} rows={2} aria-label={L("النص بالعربي", "Arabic text")} className={`${field} py-2`} />
                      <textarea name="textEn" defaultValue={s.textEn ?? storyText("en", CITY[city][1], days, code)} rows={2} dir="ltr" aria-label={L("النص بالإنجليزي", "English text")} className={`${field} py-2`} />
                      <div className="flex gap-2">
                        <button name="decision" value="publish" disabled={!ready} className={`${btn.small} bg-ok text-white disabled:opacity-40`} title={ready ? "" : L("مستني موافقة الطرفين", "Waiting for both parties")}>
                          {L("انشر", "Publish")}
                        </button>
                        <button name="decision" value="reject" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>
                          {L("ما تنشرش", "Don't publish")}
                        </button>
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={L("«فكّرني بمهلتي» — قرار تسهيلات جديد", "Deadline reminders — new relief decision")}>
            <div className="flex flex-wrap gap-1.5">
              {CITY_KEYS.map((c) => (
                <Badge key={c} tone="blue">
                  {label(CITY, c, locale)}: {num(subsByCity.find((s) => s.city === c)?._count ?? 0, locale)}
                </Badge>
              ))}
            </div>
            <form action={broadcastRelief.bind(null, locale)} className="flex flex-col gap-2">
              <label className={labelCls}>
                {L("المدينة", "City")}
                <select name="city" className={field}>
                  {CITY_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {label(CITY, c, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                {L("الرسالة بالعربي", "Message in Arabic")}
                <textarea name="textAr" required minLength={20} rows={3} className={`${field} py-2`} />
              </label>
              <label className={labelCls}>
                {L("الرسالة بالإنجليزي (اختياري)", "Message in English (optional)")}
                <textarea name="textEn" rows={2} className={`${field} py-2`} dir="ltr" />
              </label>
              <p className="text-xs text-muted">{L("رابط الإيقاف بيتضاف لوحده في آخر كل رسالة.", "The stop link is added automatically to every message.")}</p>
              <ConfirmButton message={L("تبعت الرسالة لكل المشتركين في المدينة دي؟", "Send this to every subscriber in this city?")} className={`${btn.primary} self-start`}>
                {L("ابعت للمشتركين", "Send to subscribers")}
              </ConfirmButton>
            </form>
          </Card>

          <Card title={L("الرسايل الخارجة (واتساب / إيميل)", "Outgoing messages (WhatsApp / email)")}>
            {!process.env.WHATSAPP_TOKEN && (
              <Notice tone="amber">{L("مزوّد واتساب لسه مش متظبط — الرسايل محفوظة هنا وهتتبعت أول ما يتربط.", "The WhatsApp provider isn't connected yet — messages are kept here and will go out once it is.")}</Notice>
            )}
            {outbox.length === 0 ? (
              <Empty>{L("مفيش رسايل.", "No messages.")}</Empty>
            ) : (
              <Table head={[L("الوقت", "Time"), L("لمين", "To"), L("النوع", "Kind"), L("الحالة", "Status")]}>
                {outbox.map((m) => (
                  <tr key={m.id}>
                    <td className="text-xs">{dateTime(m.createdAt, locale)}</td>
                    <td dir="ltr" className="text-start text-xs">
                      {m.to.slice(0, 5)}•••{m.to.slice(-3)}
                    </td>
                    <td className="text-xs">
                      {m.kind}
                      <div className="max-w-xs truncate text-muted" title={m.body}>
                        {m.body}
                      </div>
                    </td>
                    <td>
                      <Badge tone={m.status === "SENT" ? "green" : m.status === "FAILED" ? "red" : "amber"}>{m.status}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      </Container>
    </>
  );
}

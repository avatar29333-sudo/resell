import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { updateDailyRate } from "@/lib/fx";
import { idsByRole, notify } from "@/lib/notifications";
import { CITY, DOC_TYPE } from "@/lib/labels";
import { getSetting } from "@/lib/settings";
import { validityState } from "@/lib/validity";
import { districtName } from "@/lib/district";
import { dueStage, reminderText } from "@/lib/reminders";
import { queueMessage, sentToday, unsubscribeUrl } from "@/lib/outbox";
import { digestText, groupDigest } from "@/lib/digest";
import { matches } from "@/lib/matching";
import { latestRate, totalEgp } from "@/lib/listing";
import { toNum } from "@/lib/format";
import { siteUrl } from "@/lib/meta";

// مهمة يومية (Vercel Cron الساعة 8 الصبح بتوقيت القاهرة — vercel.json):
// 1) سعر صرف النهارده  2) المستندات اللي انتهت  3) المستندات اللي هتنتهي خلال 30 يوم
// 4) القطع اللي مهلة بنائها هتخلص خلال 60 يوم
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86_400_000;

export async function GET(req: Request) {
  // Vercel بيبعت CRON_SECRET في الهيدر. من غيره الطلب مرفوض.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const brokers = await idsByRole("BROKER");
  const report: Record<string, unknown> = {};

  // 1) سعر الصرف
  const fx = await updateDailyRate();
  report.fx = fx.status === "unavailable" ? "unavailable" : `${fx.status}:${fx.rate.sell}`;
  if (fx.status === "unavailable") {
    await notify([...(await idsByRole("FINANCE")), ...(await idsByRole("ADMIN"))], {
      kind: "fx.unavailable",
      ar: ["ما قدرناش نسحب سعر الدولار النهارده", "سجّله يدوي من الإعدادات."],
      en: ["Couldn't fetch today's USD rate", "Enter it manually in settings."],
      link: "/settings?tab=fx",
    });
  }

  // 2) مستندات انتهت
  const expired = await db.document.findMany({ where: { status: "APPROVED", expiresAt: { lt: now } } });
  if (expired.length) {
    await db.document.updateMany({ where: { id: { in: expired.map((d) => d.id) } }, data: { status: "EXPIRED" } });
    for (const d of expired) {
      const t = DOC_TYPE[d.type];
      await notify([d.ownerId], {
        kind: "document.expired",
        ar: [`${t[0]} انتهى — ارفع نسخة حديثة`],
        en: [`Your ${t[1]} expired — please upload a recent one`],
        link: "/account",
      });
    }
  }
  report.expired = expired.length;

  // 3) مستندات هتنتهي خلال 30 يوم
  const soon = await db.document.count({ where: { status: "APPROVED", expiresAt: { gte: now, lte: new Date(now.getTime() + 30 * DAY) } } });
  if (soon || expired.length) {
    await notify(brokers, {
      kind: "documents.expiring",
      ar: [`مستندات محتاجة تجديد: ${soon} هتنتهي خلال 30 يوم، و${expired.length} انتهت النهارده`],
      en: [`Documents to renew: ${soon} expire within 30 days, ${expired.length} expired today`],
      link: "/reports",
    });
  }
  report.expiringSoon = soon;

  // 3ب) DATA-03: إفادة الجهاز للعروض المنشورة — انتهت → «محتاج تحديث»، وتنبيه قبلها بـ warnDays
  const validity = await getSetting("documents.validity");
  const live = await db.listing.findMany({
    where: { status: { in: ["VERIFIED", "PUBLISHED"] } },
    include: { plot: true, documents: { where: { type: "AUTHORITY_STATEMENT", status: { not: "SUPERSEDED" } }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  let needsUpdate = 0;
  let warned = 0;
  for (const l of live) {
    const st = l.documents[0];
    const state = st ? validityState(st.expiresAt, now, validity.warnDays) : "ok";
    const place = (i: 0 | 1) => `${CITY[l.plot.city][i]} — ${districtName(l.plot, i ? "en" : "ar")}`;
    if ((state === "expired" || st?.status === "EXPIRED") && !l.statementExpiredAt) {
      await db.listing.update({ where: { id: l.id }, data: { statementExpiredAt: now } });
      await audit(null, "listing.statement_expired", "Listing", l.id, { documentId: st?.id ?? null });
      await notify([l.sellerId, l.submittedById, l.assignedBrokerId], {
        kind: "listing.needs_update",
        ar: [`إفادة الجهاز لقطعتك انتهت: ${place(0)}`, "العرض بقى «محتاج تحديث» — ارفع إفادة حديثة من حسابك."],
        en: [`The authority statement for your plot expired: ${place(1)}`, "The listing now needs an update — upload a recent statement from your account."],
        link: `/listings/${l.id}`,
      });
      needsUpdate++;
    } else if (state === "warn" && st) {
      // تنبيه مرة واحدة بس لكل مستند
      const already = await db.auditLog.findFirst({ where: { action: "listing.statement_warned", entityId: st.id }, select: { id: true } });
      if (!already) {
        await audit(null, "listing.statement_warned", "Document", st.id, { listingId: l.id, expiresAt: st.expiresAt?.toISOString() ?? null });
        await notify([l.sellerId, l.submittedById, l.assignedBrokerId], {
          kind: "listing.statement_expiring",
          ar: [`إفادة الجهاز لقطعتك هتنتهي قريب: ${place(0)}`, "جهّز إفادة حديثة عشان العرض يفضل ظاهر."],
          en: [`The authority statement for your plot expires soon: ${place(1)}`, "Get a recent statement so the listing stays visible."],
          link: `/account`,
        });
        warned++;
      }
    }
  }
  report.needsUpdate = needsUpdate;
  report.statementWarned = warned;

  // 3ج) MKT-04: «فكّرني بمهلتي» — تنبيه قبل 90 / 30 / 7 أيام، مرة واحدة لكل مرحلة
  const reminders = await db.deadlineReminder.findMany({ where: { unsubscribedAt: null, deadline: { gte: now, lte: new Date(now.getTime() + 91 * DAY) } } });
  let remindersSent = 0;
  for (const r of reminders) {
    const stage = dueStage(r.deadline, now, r);
    if (!stage) continue;
    await queueMessage("whatsapp", r.phone, `reminder.${stage}`, reminderText(stage, r.locale, CITY[r.city][r.locale === "en" ? 1 : 0], unsubscribeUrl(r.locale, r.unsubToken)));
    await db.deadlineReminder.update({ where: { id: r.id }, data: stage === 90 ? { sent90At: now } : stage === 30 ? { sent30At: now } : { sent7At: now } });
    remindersSent++;
  }
  report.remindersSent = remindersSent;

  // 3د) MKT-13: عروض آخر 24 ساعة المطابقة لطلبات الشراء (بموافقة صريحة) — رسالة واحدة مجمّعة لكل مستخدم في اليوم
  const since = new Date(now.getTime() - DAY);
  const fresh = await db.listing.findMany({ where: { status: "PUBLISHED", publishedAt: { gte: since }, seller: { status: "ACTIVE" } }, include: { plot: true } });
  let digests = 0;
  if (fresh.length) {
    const rate = await latestRate();
    const usd = toNum(rate?.sell ?? 50);
    const reqs = await db.buyRequest.findMany({ where: { status: "ACTIVE", alertConsentAt: { not: null }, unsubToken: { not: null } }, include: { buyer: { select: { id: true, phone: true, email: true, locale: true, status: true } } } });
    const matchesList = reqs.flatMap((r) =>
      r.buyer.status !== "ACTIVE" || (r.lastAlertAt && r.lastAlertAt > since)
        ? []
        : fresh
            .filter((l) => l.sellerId !== r.buyerId)
            .filter((l) =>
              matches(
                { cities: r.cities, minAreaSqm: r.minAreaSqm ? toNum(r.minAreaSqm) : null, maxAreaSqm: r.maxAreaSqm ? toNum(r.maxAreaSqm) : null, budgetMax: r.budgetMax ? toNum(r.budgetMax) : null },
                { city: l.plot.city, areaSqm: toNum(l.plot.areaSqm), totalEgp: totalEgp(l, usd) },
              ),
            )
            .map((l) => ({ buyerId: r.buyerId, listingId: l.id, title: `${CITY[l.plot.city][r.buyer.locale === "en" ? 1 : 0]} — ${toNum(l.plot.areaSqm)} m²`, reqId: r.id, token: r.unsubToken! })),
    );
    for (const d of groupDigest(matchesList)) {
      const req = reqs.find((r) => r.buyerId === d.buyerId)!;
      const loc = req.buyer.locale === "en" ? "en" : "ar";
      if (await sentToday(req.buyer.phone, "buy_request.digest", now)) continue;
      const token = matchesList.find((m) => m.buyerId === d.buyerId)!.token;
      const text = digestText(loc, d.shown.map((m) => ({ title: m.title, url: `${siteUrl()}/${loc}/listings/${m.listingId}?utm_source=whatsapp&utm_medium=alert` })), d.more, unsubscribeUrl(loc, token));
      // واتساب أساساً، والإيميل احتياطي لو واتساب مش متاح والإيميل متاح
      const useEmail = !process.env.WHATSAPP_TOKEN && !!process.env.EMAIL_API_KEY && !!req.buyer.email;
      await queueMessage(useEmail ? "email" : "whatsapp", useEmail ? req.buyer.email! : req.buyer.phone, "buy_request.digest", text);
      await db.buyRequest.updateMany({ where: { buyerId: d.buyerId, alertConsentAt: { not: null } }, data: { lastAlertAt: now } });
      digests++;
    }
  }
  report.buyRequestDigests = digests;

  // 4) مهلة البناء خلال 60 يوم (للعروض الشغالة)
  const plots = await db.plot.findMany({
    where: {
      buildDeadline: { gte: now, lte: new Date(now.getTime() + 60 * DAY) },
      listings: { some: { status: { in: ["IN_REVIEW", "VERIFIED", "PUBLISHED", "IN_DEAL"] } } },
    },
    include: { listings: { where: { status: { in: ["IN_REVIEW", "VERIFIED", "PUBLISHED", "IN_DEAL"] } }, select: { sellerId: true } } },
  });
  for (const p of plots) {
    const days = Math.ceil((p.buildDeadline!.getTime() - now.getTime()) / DAY);
    await notify(p.listings.map((l) => l.sellerId), {
      kind: "plot.deadline",
      ar: [`مهلة بناء قطعتك في ${CITY[p.city][0]} فاضل عليها ${days} يوم`, "اعرف إزاي تستفيد من قرار مد المهلة."],
      en: [`The build deadline for your plot in ${CITY[p.city][1]} is in ${days} days`, "See how the deadline extension decision can help."],
      link: "/rescue",
    });
  }
  if (plots.length) {
    await notify(brokers, {
      kind: "plots.deadline",
      ar: [`${plots.length} قطعة معروضة مهلة بنائها هتخلص خلال 60 يوم`],
      en: [`${plots.length} listed plots have build deadlines within 60 days`],
      link: "/broker?tab=queue",
    });
  }
  report.deadlines = plots.length;

  await audit(null, "cron.daily", "System", now.toISOString().slice(0, 10), report as never);
  return Response.json({ ok: true, ...report });
}

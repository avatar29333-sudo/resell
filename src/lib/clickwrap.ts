import "server-only";
import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "./db";
import { publishedFor, userVars } from "./contract-vars";
import { markdownToBlocks, renderTemplate, sha256 } from "./templates";
import { issuePdf } from "./issue-pdf";
import { saveFile } from "./storage";
import { queueMessage } from "./outbox";
import { audit } from "./audit";
import { toNum } from "./format";
import { CITY } from "./labels";

/**
 * CON-03 — الموافقات الإلكترونية (Clickwrap + كود) على: شروط الاستخدام، نموذج 1، 2، 9، 10.
 * لو اتنشرت نسخة جديدة من الشروط أو اتفاقية الشريك، المطلوب منهم يشوفوا تنبيه ويوافقوا تاني.
 */
export type PendingConsent = { key: string; title: string; versionId: string; version: number; subjectId: string | null; subjectLabel?: string; text: string; ok: boolean };

async function rendered(key: string, user: User, extra: Record<string, string> = {}) {
  const v = await publishedFor({ key });
  if (!v) return null;
  const r = renderTemplate(v.bodyMarkdown, await userVars(user, v.version, extra));
  return { v, text: r.text, ok: r.ok };
}

async function consentedTo(userId: string, kind: string, opts: { versionId?: string; listingId?: string; subjectId?: string }) {
  return !!(await db.consentRecord.findFirst({
    where: { userId, kind, ...(opts.versionId ? { templateVersionId: opts.versionId } : {}), ...(opts.listingId ? { listingId: opts.listingId } : {}), ...(opts.subjectId ? { summary: { contains: opts.subjectId } } : {}) },
    select: { id: true },
  }));
}

export async function pendingConsents(user: User): Promise<PendingConsent[]> {
  const out: PendingConsent[] = [];
  // شروط الاستخدام — موافقة على النسخة المنشورة الحالية
  const terms = await rendered("terms_of_use", user);
  if (terms && !(await consentedTo(user.id, "terms_of_use", { versionId: terms.v.id }))) out.push({ key: "terms_of_use", title: terms.v.template.titleAr, versionId: terms.v.id, version: terms.v.version, subjectId: null, text: terms.text, ok: terms.ok });
  // نموذج 10 — السمسار الشريك
  if (user.role === "PARTNER_BROKER") {
    const p = await rendered("partner_agreement", user);
    if (p && !(await consentedTo(user.id, "partner_agreement", { versionId: p.v.id }))) out.push({ key: "partner_agreement", title: p.v.template.titleAr, versionId: p.v.id, version: p.v.version, subjectId: null, text: p.text, ok: p.ok });
  }
  // نموذج 1 — تفويض عرض لكل قطعة معروضة
  // عروضه هو بنفسه (عروض النيابة المالك بيأكّدها بالكود من رابط الرسالة)
  const listings = await db.listing.findMany({ where: { sellerId: user.id, status: { in: ["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"] }, authorizationConsentAt: null, OR: [{ submittedById: null }, { submittedById: user.id }] }, include: { plot: true } });
  for (const l of listings) {
    if (await consentedTo(user.id, "listing_authorization", { listingId: l.id })) continue;
    const r = await rendered("listing_authorization", user, {
      plot_city: (CITY[l.plot.city] ?? [l.plot.city])[0],
      plot_district: l.plot.district,
      plot_round: "—",
      plot_code: l.plot.code,
      plot_area: String(toNum(l.plot.areaSqm)),
      listing_price: toNum(l.price).toLocaleString("en-US"),
    });
    if (r) out.push({ key: "listing_authorization", title: r.v.template.titleAr, versionId: r.v.id, version: r.v.version, subjectId: l.id, subjectLabel: l.plot.code, text: r.text, ok: r.ok });
  }
  // نموذج 9 — خدمة إنقاذ المهلة
  const rescues = await db.serviceRequest.findMany({ where: { requesterId: user.id, type: "DEADLINE_RESCUE", status: { not: "CANCELLED" } }, select: { id: true } });
  for (const s of rescues) {
    if (await consentedTo(user.id, "rescue_service", { subjectId: s.id })) continue;
    const r = await rendered("rescue_service", user);
    if (r) out.push({ key: "rescue_service", title: r.v.template.titleAr, versionId: r.v.id, version: r.v.version, subjectId: s.id, text: r.text, ok: r.ok });
  }
  return out;
}

/** تسجيل الموافقة (append-only) + PDF في «مستنداتي» + إيميل */
export async function recordClickwrap(user: User, p: { kind: string; versionId: string; title: string; version: number; text: string; dealId?: string | null; listingId?: string | null; subjectId?: string | null }) {
  const h = await headers();
  const hash = sha256(p.text);
  const rec = await db.consentRecord.create({
    data: {
      userId: user.id,
      kind: p.kind,
      action: "consent.accept",
      templateVersionId: p.versionId,
      dealId: p.dealId ?? null,
      listingId: p.listingId ?? null,
      summary: `${p.title} v${p.version}${p.subjectId ? ` — ${p.subjectId}` : ""}`,
      renderedText: p.text,
      sha256: hash,
      channel: "otp",
      phoneLast4: user.phone.slice(-4),
      otpVerifiedAt: new Date(),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const pdf = await issuePdf(
    { title: `${p.title} — نسخة v${p.version}`, subtitle: `موافقة ${user.name} — ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" })} بتوقيت القاهرة`, codePrefix: `RS-CN-${p.kind.slice(0, 2).toUpperCase()}`, locale: "ar" },
    [...markdownToBlocks(p.text), { kind: "rule" }, { kind: "small", text: `بصمة النص (SHA-256): ${hash}` }, { kind: "small", text: "تمت الموافقة إلكترونياً مع كود تحقق على الموبايل، وتُعد توقيعاً." }],
    { kind: "CONSENT", dealId: p.dealId ?? null, issuedToId: user.id, templateVersion: `v${p.version}` },
  );
  const saved = await saveFile(pdf.bytes, "application/pdf", "consents");
  await db.document.create({
    data: {
      type: "CONTRACT_PDF",
      title: `موافقتك على ${p.title} (v${p.version})`,
      ownerId: user.id,
      uploadedById: user.id,
      dealId: p.dealId ?? null,
      storageKey: saved.key,
      sha256: saved.sha256,
      sizeBytes: saved.sizeBytes,
      fileName: `${pdf.code}.pdf`,
      mimeType: "application/pdf",
      status: "APPROVED",
      visibility: "PRIVATE",
    },
  });
  if (user.email) await queueMessage("email", user.email, "consent.copy", `نسخة من موافقتك على «${p.title}» (نسخة v${p.version}) موجودة في حسابك ← مستنداتي. كود المستند ${pdf.code}.`);
  await audit(user.id, "consent.accepted", "ConsentRecord", rec.id, { kind: p.kind, version: p.version, sha256: hash });
  return rec;
}

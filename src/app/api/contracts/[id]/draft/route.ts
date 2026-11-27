import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadDealFor } from "@/lib/access";
import { dealVars } from "@/lib/contract-vars";
import { markdownToBlocks, renderTemplate } from "@/lib/templates";
import { issuePdf } from "@/lib/issue-pdf";
import { readBytes, saveFile } from "@/lib/storage";
import { requiredSigners } from "@/lib/deal-machine";
import { dealRef } from "@/lib/action-otp-core";
import { SEED_TEMPLATES } from "@/lib/template-seed";
import type { Block } from "@/lib/pdf-ar";

const html = (status: number, title: string, body: string) =>
  new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:640px;margin:40px auto;line-height:1.8;padding:0 16px"><h1 style="font-size:20px">${title}</h1>${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * CON-06: «تنزيل للتوقيع (PDF)» — عربي RTL بخط مضمّن، رأس فيه اسم النموذج والنسخة ورقم الصفقة،
 * تذييل «صفحة X من Y» + كود المستند + QR للتحقق، خانة أحرف أولى في كل صفحة وخانات توقيع، علامة مائية، SHA-256.
 * ما بيتولدش لو فيه متغير ناقص. كل تنزيل بياخد رقم ويتسجل، والنسخ الأقدم بتتعلّم «ملغاة».
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const c = await db.contract.findUnique({ where: { id }, include: { templateVersionRef: { include: { template: true } } } });
  if (!c) return new Response("Not found", { status: 404 });
  const deal = await loadDealFor(user, c.dealId);
  if (!deal) return new Response("Not allowed", { status: 403 });
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  const staff = [deal.brokerId, deal.lawyerId].includes(user.id) || user.role === "ADMIN";
  // الأطراف ينزّلوا عقودهم بس؛ السمسار المسؤول والمحامي والأدمن
  if (!staff && !(side && requiredSigners(c.type).includes(side))) return new Response("Not allowed", { status: 403 });
  if (["VOID", "DRAFT", "PENDING_LAWYER"].includes(c.status)) return html(409, "العقد لسه ما اتعمدش", "<p>التنزيل للتوقيع بيتفتح بعد اعتماد المحامي.</p>");
  // CON-06: بعد ما التوقيع بدأ ما بتتولدش نسخة جديدة (عشان ما تلغيش نسخة الطرف التاني) — بنرجّع آخر نسخة
  if (["PARTIALLY_SIGNED", "SIGNED", "VERIFIED"].includes(c.status) && c.draftDocumentId) {
    const existing = await db.document.findUnique({ where: { id: c.draftDocumentId } });
    const bytes = existing ? await readBytes(existing.storageKey) : null;
    if (existing && bytes) {
      await audit(user.id, "contract.draft_redownloaded", "Contract", c.id, { code: c.draftCode });
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${c.draftCode}.pdf"`, "Cache-Control": "private, no-store" } });
    }
  }
  if (["PARTIALLY_SIGNED", "SIGNED", "VERIFIED"].includes(c.status)) return html(409, "التوقيع بدأ بالفعل", "<p>ما ينفعش نطلّع نسخة جديدة بعد ما التوقيع بدأ.</p>");
  const tv = c.templateVersionRef;
  if (!tv) return html(409, "النموذج مش مربوط بنسخة", "<p>كلّم الدعم — العقد ده محتاج يترتبط بنسخة نموذج.</p>");
  const r = renderTemplate(tv.bodyMarkdown, await dealVars(deal, tv.version, user.id));
  if (!r.ok) {
    return html(
      409,
      "فيه بيانات ناقصة — مش هيتولد العقد",
      `<p>كمّل البيانات دي الأول (من غرفة الصفقة):</p><ul>${r.missing.map((m) => `<li dir="ltr">${m}</li>`).join("")}</ul>`,
    );
  }
  const ref = dealRef(deal.id);
  const abbr = SEED_TEMPLATES.find((t) => t.key === tv.template.key)?.abbr ?? "CT";
  const signers = requiredSigners(c.type).map((s) => (s === "BUYER" ? `المشتري: ${deal.buyer.name}` : `البائع: ${deal.listing.seller.name}`));
  const blocks: Block[] = [...markdownToBlocks(r.text), { kind: "space", h: 12 }, { kind: "signatures", parties: signers }];
  // النسخ الأقدم من نفس العقد → ملغاة (الـ QR بتاعها هيقول كده)
  await db.issuedDocument.updateMany({ where: { contractId: c.id, kind: "CONTRACT_DRAFT", supersededAt: null }, data: { supersededAt: new Date() } });
  const pdf = await issuePdf(
    {
      title: `${tv.template.titleAr} — نسخة v${tv.version} — ${ref}`,
      subtitle: "نسخة للتوقيع — اطبعها كاملة ووقّع كل صفحة بالأحرف الأولى",
      codePrefix: `${ref}-${abbr}-v${tv.version}`,
      locale: "ar",
      watermark: "نسخة للتوقيع — لا تُعدّل",
      initials: true,
    },
    blocks,
    { kind: "CONTRACT_DRAFT", dealId: deal.id, contractId: c.id, templateVersion: `v${tv.version}`, issuedToId: user.id, copyFor: side ?? "STAFF" },
  );
  const saved = await saveFile(pdf.bytes, "application/pdf", "contracts");
  const doc = await db.document.create({
    data: {
      type: "CONTRACT_PDF",
      title: `نسخة للتوقيع — ${tv.template.titleAr} v${tv.version} (${pdf.code})`,
      ownerId: deal.listing.sellerId,
      uploadedById: user.id,
      dealId: deal.id,
      storageKey: saved.key,
      sha256: saved.sha256,
      sizeBytes: saved.sizeBytes,
      fileName: `${pdf.code}.pdf`,
      mimeType: "application/pdf",
      status: "APPROVED",
      visibility: "SHARED_WITH_COUNTERPARTY",
    },
  });
  await db.contract.update({ where: { id: c.id }, data: { draftCode: pdf.code, draftSha256: pdf.sha256, draftPages: pdf.pages, draftDocumentId: doc.id } });
  await audit(user.id, "contract.draft_downloaded", "Contract", c.id, { code: pdf.code, seq: pdf.seq, sha256: pdf.sha256, pages: pdf.pages });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.code}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

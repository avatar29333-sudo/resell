"use server";

import { redirect } from "next/navigation";
import type { City, DocumentType } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { fileFromForm, saveFile } from "@/lib/storage";
import { CITY_KEYS } from "@/lib/labels";
import { isLocale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";

export type ListState = { error?: string };

export async function createListing(locale: string, _prev: ListState, form: FormData): Promise<ListState> {
  const l = isLocale(locale) ? locale : "ar";
  const ar = l === "ar";
  const user = await requireUser(l, `/${l}/list-your-plot`);

  const city = String(form.get("city") ?? "");
  const district = String(form.get("district") ?? "").trim();
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const area = Number(form.get("area"));
  const price = Number(form.get("price"));
  const priceType = form.get("priceType") === "PAID_PLUS_PREMIUM" ? "PAID_PLUS_PREMIUM" : "ALL_INCLUSIVE";
  const paidUsd = Number(form.get("paidUsd")) || null;
  const construction = Math.min(100, Math.max(0, Number(form.get("construction")) || 0));
  const deadline = String(form.get("deadline") ?? "");

  if (!CITY_KEYS.includes(city as never) || !district || !code) return { error: ar ? "كمّل بيانات القطعة" : "Complete the plot details" };
  if (!(area > 0) || area > 5000) return { error: ar ? "المساحة مش منطقية" : "The area looks wrong" };
  if (!(price > 0)) return { error: ar ? "اكتب السعر" : "Enter the price" };
  if (priceType === "PAID_PLUS_PREMIUM" && !paidUsd) return { error: ar ? "اكتب المبلغ المدفوع بالدولار" : "Enter the amount paid in USD" };

  // الملفات: خطاب التخصيص إجباري
  const files: [string, DocumentType][] = [
    ["allocation", "ALLOCATION_LETTER"],
    ["receipts", "PAYMENT_RECEIPT"],
    ["statement", "AUTHORITY_STATEMENT"],
  ];
  const uploads = [];
  for (const [field, type] of files) {
    const r = await fileFromForm(form, field);
    if ("error" in r && r.error) return { error: ar ? "كل ملف لازم يكون PDF أو صورة وأقل من 4 ميجا" : "Each file must be a PDF or image under 4 MB" };
    if (r.file) uploads.push({ ...r.file, docType: type });
  }
  if (!uploads.some((u) => u.docType === "ALLOCATION_LETTER")) return { error: ar ? "خطاب التخصيص مطلوب" : "The allocation letter is required" };

  // كشف التكرار: نفس القطعة معروضة بالفعل؟
  const existingPlot = await db.plot.findUnique({ where: { city_district_code: { city: city as City, district, code } } });
  if (existingPlot) {
    const active = await db.listing.findFirst({
      where: { plotId: existingPlot.id, status: { in: ["IN_REVIEW", "VERIFIED", "PUBLISHED", "IN_DEAL"] } },
    });
    if (active) {
      await audit(user.id, "listing.duplicate_blocked", "Plot", existingPlot.id);
      return { error: ar ? "القطعة دي معروضة بالفعل على المنصة. لو دي قطعتك كلّمنا." : "This plot is already listed. If it's yours, contact us." };
    }
  }

  const plot =
    existingPlot ??
    (await db.plot.create({
      data: {
        city: city as City,
        district,
        code,
        areaSqm: area,
        paymentStatus: form.get("paymentStatus") === "FULLY_PAID" ? "FULLY_PAID" : "INSTALLMENTS",
        constructionPercent: construction,
        buildDeadline: deadline ? new Date(deadline) : null,
        createdById: user.id,
      },
    }));

  const listing = await db.listing.create({
    data: {
      plotId: plot.id,
      sellerId: user.id,
      priceType,
      price,
      currency: "EGP",
      paidAmountUsd: priceType === "PAID_PLUS_PREMIUM" ? paidUsd : null,
      status: "IN_REVIEW",
    },
  });

  for (const u of uploads) {
    const s = await saveFile(u.data, u.type);
    await db.document.create({
      data: {
        type: u.docType,
        ownerId: user.id,
        uploadedById: user.id,
        plotId: plot.id,
        listingId: listing.id,
        storageKey: s.key,
        sha256: s.sha256,
        sizeBytes: s.sizeBytes,
        fileName: u.name,
        mimeType: u.type,
      },
    });
  }
  await audit(user.id, "listing.create", "Listing", listing.id, { plotId: plot.id, files: uploads.length });
  await notify(await idsByRole("BROKER"), {
    kind: "listing.new",
    ar: [`عرض جديد مستني المراجعة من ${user.name}`, `${area} م² — ${district}`],
    en: [`New listing to review from ${user.name}`, `${area} m² — ${district}`],
    link: `/broker?tab=queue`,
  });
  redirect(`/${l}/account?listed=1`);
}

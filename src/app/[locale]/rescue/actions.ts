"use server";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { fileFromForm, saveFile } from "@/lib/storage";
import { isValidPhone, normalizePhone } from "@/lib/format";
import { CITY_KEYS } from "@/lib/labels";
import type { City } from "@prisma/client";
import { idsByRole, notify } from "@/lib/notifications";

export type RescueState = { ok?: boolean; error?: string; ref?: string; fieldErrors?: Partial<Record<"name" | "phone" | "file", string>> };

export async function submitRescue(locale: string, _prev: RescueState, form: FormData): Promise<RescueState> {
  const ar = locale === "ar";
  const name = String(form.get("name") ?? "").trim();
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const cityRaw = String(form.get("city") ?? "");
  const city = CITY_KEYS.includes(cityRaw as never) ? (cityRaw as City) : null;
  const area = String(form.get("area") ?? "");
  const plotCode = String(form.get("plotCode") ?? "").trim() || null;
  const type = form.get("type") === "SITE_INSPECTION" ? "SITE_INSPECTION" : "DEADLINE_RESCUE";

  // UX-01: الخطأ بيرجع لكل حقل لوحده عشان يظهر جنبه
  const fieldErrors: RescueState["fieldErrors"] = {};
  if (name.length < 3) fieldErrors.name = ar ? "اكتب اسمك بالكامل" : "Enter your full name";
  if (!isValidPhone(phone)) fieldErrors.phone = ar ? "رقم الواتساب مش صحيح — اكتبه بكود الدولة" : "Invalid WhatsApp number — include the country code";
  const upload = await fileFromForm(form, "file");
  if ("error" in upload && upload.error) fieldErrors.file = ar ? "الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا" : "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB";
  if (Object.keys(fieldErrors).length) return { error: ar ? "راجع الخانات المعلّمة" : "Please check the highlighted fields", fieldErrors };

  const user = await getCurrentUser();
  const req = await db.serviceRequest.create({
    data: {
      type,
      contactName: name,
      contactPhone: phone,
      requesterId: user?.id,
      city,
      plotCode,
      // MKT-01: القيم من الحاسبة (الشريحة والسعر والمبلغ بالدولار) بتوصل للوسيط مع الطلب
      message:
        [
          area && `${ar ? "المساحة" : "Area"}: ${area} ${ar ? "م²" : "m²"}`,
          form.get("tier") && `${ar ? "الشريحة" : "Tier"}: ${{ a: ">70%", b: "35–70%", c: "<35%" }[String(form.get("tier"))] ?? ""}`,
          Number(form.get("price")) > 0 && `${ar ? "السعر الحالي" : "Current price"}: ${Number(form.get("price")).toLocaleString("en-US")} EGP`,
          Number(form.get("feeUsd")) > 0 && `${ar ? "المبلغ التقديري" : "Estimated fee"}: $${Number(form.get("feeUsd")).toLocaleString("en-US")}`,
          String(form.get("message") ?? "").trim(),
        ]
          .filter(Boolean)
          .join(" — ") || null,
    },
  });

  // الملف بيتحفظ كمستند باسم صاحب الطلب لو داخل، أو باسم الوسيط المسؤول لحد ما العميل يسجّل
  if (upload.file) {
    const owner = user ?? (await db.user.findFirst({ where: { role: "BROKER" } }));
    if (owner) {
      const saved = await saveFile(upload.file.data, upload.file.type);
      await db.document.create({
        data: {
          type: "ALLOCATION_LETTER",
          ownerId: owner.id,
          uploadedById: owner.id,
          serviceRequestId: req.id,
          storageKey: saved.key,
          sha256: saved.sha256,
          sizeBytes: saved.sizeBytes,
          fileName: upload.file.name,
          mimeType: upload.file.type,
        },
      });
    }
  }
  await audit(user?.id ?? null, "service_request.create", "ServiceRequest", req.id, { type });
  await notify(await idsByRole("BROKER"), {
    kind: "service_request.new",
    ar: [`طلب ${type === "SITE_INSPECTION" ? "معاينة" : "إنقاذ مهلة"} جديد من ${name}`],
    en: [`New ${type === "SITE_INSPECTION" ? "inspection" : "deadline rescue"} request from ${name}`],
    link: `/broker?tab=services`,
  });
  return { ok: true, ref: req.id.slice(-6).toUpperCase() };
}

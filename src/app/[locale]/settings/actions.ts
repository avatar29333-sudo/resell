"use server";

import { allCities, invalidateCities, isCity } from "@/lib/cities";
import { cityIdFromSlug, isLatinName, slugFromName, validPattern, validPrefix } from "@/lib/geo-rules";
import { revalidatePath } from "next/cache";
import type { Prisma, Role } from "@prisma/client";
type City = string;
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRecentAuth, requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authz";
import { getSetting } from "@/lib/settings";
import { updateDailyRate } from "@/lib/fx";
import { checkManualRate } from "@/lib/fx-rules";
import { moveBlobsToS3 } from "@/lib/storage";
import { idsByRole, notify } from "@/lib/notifications";
import { CITY_KEYS, ROLE } from "@/lib/labels";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

const ROLES: Role[] = ["CLIENT", "PARTNER_BROKER", "BROKER", "BROKER_LEAD", "LAWYER", "AGENT", "FINANCE", "ADMIN"];
const loc = (l: string) => (isLocale(l) ? l : "ar");
const back = (l: string, tab: string) => `/${loc(l)}/settings?tab=${tab}`;
const signedIn = (locale: string, roles: Role[] = ["ADMIN"]) => requireUser(loc(locale), `/${loc(locale)}/settings`, roles);
const refresh = (locale: string) => revalidatePath(`/${loc(locale)}/settings`);

async function saveSetting(userId: string, key: string, value: Prisma.InputJsonValue) {
  const before = await db.appSetting.findUnique({ where: { key } });
  await db.appSetting.upsert({ where: { key }, create: { key, value, updatedById: userId }, update: { value, updatedById: userId } });
  await audit(userId, "setting.update", "AppSetting", key, { before: (before?.value ?? null) as Prisma.InputJsonValue, after: value });
}

const isLastAdmin = async (userId: string) => {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u?.role !== "ADMIN") return false;
  return (await db.user.count({ where: { role: "ADMIN", status: "ACTIVE", anonymizedAt: null } })) <= 1;
};

/**
 * SEC-07 + PERM-05: تغيير الدور — بتأكيد فيه القديم والجديد، وآخر أدمن محمي،
 * والترقية لأدمن محتاجة إعادة تحقق وبتبعت إشعار لباقي الأدمنز. الجلسات القديمة بتقع.
 */
export async function setUserRole(locale: string, userId: string, form: FormData) {
  const l = loc(locale);
  const b = back(l, "users");
  const me = await signedIn(l);
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role) || userId === me.id) return; // الأدمن ما يغيرش دوره بنفسه
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.role === role) return;
  if (form.get("confirmed") !== `${target.role}>${role}`) redirect(`${b}&err=confirm`);
  await authorize(me, "user.set_role", { target: { id: userId, role: target.role }, newRole: role, lastAdmin: await isLastAdmin(userId) }, { back: b });
  if (role === "ADMIN") await requireRecentAuth(me, l, b);
  const regNo = String(form.get("brokerRegNo") ?? "").trim();
  if (role === "PARTNER_BROKER" && !regNo && !target.brokerRegNo) redirect(`${b}&err=reg_no`);

  await db.user.update({
    where: { id: userId },
    data: {
      role,
      twoFactorEnabled: role !== "CLIENT" && role !== "PARTNER_BROKER",
      sessionVersion: { increment: 1 },
      ...(role === "PARTNER_BROKER" ? { brokerRegNo: regNo || target.brokerRegNo, partnerApprovedAt: new Date() } : {}),
    },
  });
  await audit(me.id, "user.role", "User", userId, { before: target.role, after: role, ...(regNo ? { brokerRegNo: regNo } : {}) });
  await notify([userId], {
    kind: "user.role_changed",
    ar: [`دورك على المنصة اتغيّر إلى: ${ROLE[role]?.[0] ?? role}`, "ادخل تاني عشان تشوف شاشاتك الجديدة."],
    en: [`Your role was changed to: ${ROLE[role]?.[1] ?? role}`, "Sign in again to see your new screens."],
  });
  if (role === "ADMIN") {
    await notify((await idsByRole("ADMIN")).filter((id) => id !== me.id && id !== userId), {
      kind: "user.admin_promoted",
      ar: [`${me.name} رقّى ${target.name} لأدمن`],
      en: [`${me.name} promoted ${target.name} to admin`],
      link: `/settings?tab=users`,
    });
  }
  refresh(l);
  redirect(`${b}&ok=role`);
}

/** PERM-07: إيقاف حساب — الجلسات بتقع، الصفقات الشغالة بتتعلّق، وعروضه بتختفي من السجل العام */
export async function suspendUser(locale: string, userId: string, form: FormData) {
  const l = loc(locale);
  const b = back(l, "users");
  const me = await signedIn(l);
  if (userId === me.id) return;
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.status === "SUSPENDED") return;
  await authorize(me, "user.suspend", { target: { id: userId, role: target.role }, lastAdmin: await isLastAdmin(userId) }, { back: b });
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 10) redirect(`${b}&err=note_required`);

  await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedAt: new Date(), suspendReason: reason, sessionVersion: { increment: 1 } } });
  const deals = await db.deal.findMany({ where: { status: "ACTIVE", OR: [{ buyerId: userId }, { listing: { sellerId: userId } }] }, select: { id: true, stage: true, brokerId: true } });
  for (const d of deals) {
    await db.deal.update({ where: { id: d.id }, data: { status: "ON_HOLD", events: { create: { type: "NOTE", actorId: me.id, data: { status: "ON_HOLD", reason: "party_suspended" } } } } });
  }
  await audit(me.id, "user.suspend", "User", userId, { reason, dealsOnHold: deals.map((d) => d.id) });
  await notify(
    deals.map((d) => d.brokerId),
    {
      kind: "deal.on_hold",
      ar: ["صفقة مسندة ليك اتعلّقت", "حساب أحد الأطراف اتوقف مؤقتاً."],
      en: ["A deal assigned to you was put on hold", "One of the parties' accounts was suspended."],
      link: `/broker?tab=deals&status=ON_HOLD`,
    },
  );
  refresh(l);
  redirect(`${b}&ok=suspended`);
}

export async function unsuspendUser(locale: string, userId: string) {
  const l = loc(locale);
  const b = back(l, "users");
  const me = await signedIn(l);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.status !== "SUSPENDED") return;
  await authorize(me, "user.suspend", { target: { id: userId, role: target.role } }, { back: b });
  await db.user.update({ where: { id: userId }, data: { status: "ACTIVE", suspendedAt: null, suspendReason: null } });
  await audit(me.id, "user.unsuspend", "User", userId, { before: "SUSPENDED", after: "ACTIVE" });
  await notify([userId], { kind: "user.unsuspended", ar: ["حسابك اتفعّل تاني"], en: ["Your account is active again"] });
  refresh(l);
  redirect(`${b}&ok=unsuspended`);
}

/** سعر يدوي (طوارئ): إعادة تحقق + البيع ≥ الشراء + ما يبعدش أكتر من الحد عن آخر سعر آلي إلا بتأكيد (OPS-04) */
export async function addManualRate(locale: string, form: FormData) {
  const l = loc(locale);
  const b = back(l, "fx");
  const me = await signedIn(l, ["ADMIN", "FINANCE"]);
  await authorize(me, "fx.manual", {}, { back: b });
  await requireRecentAuth(me, l, b);
  const buy = Number(form.get("buy"));
  const sell = Number(form.get("sell"));
  const [lastAuto, cfg] = await Promise.all([db.exchangeRate.findFirst({ where: { source: { not: "MANUAL" } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }), getSetting("fx.manual")]);
  const problem = checkManualRate({ buy, sell, lastAutoSell: lastAuto ? Number(lastAuto.sell) : null, maxDeviationPct: cfg.maxDeviationPct, confirmed: form.get("confirmDeviation") === "on" });
  if (problem) redirect(`${b}&err=${problem}&buy=${buy}&sell=${sell}`);
  const r = await db.exchangeRate.create({
    // تاريخ النهارده بتوقيت القاهرة
    data: { date: new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date())), buy, sell, source: "MANUAL", enteredById: me.id },
  });
  await audit(me.id, "fx.manual", "ExchangeRate", r.id, { buy, sell, lastAutoSell: lastAuto ? Number(lastAuto.sell) : null, deviationConfirmed: form.get("confirmDeviation") === "on" });
  refresh(l);
  redirect(`${b}&fx=manual`);
}

/** سحب سعر النهارده دلوقتي (نفس اللي المهمة اليومية بتعمله) */
export async function fetchRateNow(locale: string) {
  const l = loc(locale);
  const me = await signedIn(l, ["ADMIN", "FINANCE"]);
  await authorize(me, "fx.manual", {}, { back: back(l, "fx") });
  const r = await updateDailyRate();
  await audit(me.id, "fx.fetch_now", "ExchangeRate", r.status === "unavailable" ? "-" : r.rate.id, { status: r.status });
  refresh(l);
  redirect(`${back(l, "fx")}&fx=${r.status}`);
}

/** نقل دفعة من الملفات القديمة لـ S3 */
export async function moveFilesToS3(locale: string) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "storage.manage", {}, { back: back(l, "storage") });
  const r = await moveBlobsToS3();
  await audit(me.id, "storage.move_to_s3", "FileBlob", "batch", { moved: r.moved, failed: r.failed, remaining: r.remaining });
  refresh(l);
  redirect(`${back(l, "storage")}&moved=${r.moved}&failed=${r.failed}${r.error ? `&err=${r.error}` : ""}`);
}

export async function saveCommission(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "commission.rates", {}, { back: back(l, "commission") });
  const sellerPct = Number(form.get("sellerPct"));
  const buyerPct = Number(form.get("buyerPct"));
  if (!(sellerPct >= 0 && sellerPct <= 10 && buyerPct >= 0 && buyerPct <= 10)) return;
  await saveSetting(me.id, "commission.rates", { sellerPct, buyerPct });
  refresh(l);
}

export async function saveFees(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "commission") });
  const pct = String(form.get("authorityTransferPct") ?? "").trim();
  await saveSetting(me.id, "service.fees", {
    deadlineRescueEgp: Number(form.get("deadlineRescueEgp")) || 0,
    siteInspectionEgp: Number(form.get("siteInspectionEgp")) || 0,
    authorityTransferPct: pct === "" ? null : Math.min(20, Math.max(0, Number(pct) || 0)),
    buyerLawyerFeeEgp: Math.max(0, Number(form.get("buyerLawyerFeeEgp")) || 0),
  });
  refresh(l);
}

/** إعدادات التشغيل: حد الأربع عيون، حد السعر اليدوي، رؤية الوسطاء غير المسندين */
export async function saveOps(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "commission") });
  const limit = Math.max(0, Number(form.get("fourEyesLimit")) || 0);
  const dev = Math.min(50, Math.max(0.5, Number(form.get("maxDeviationPct")) || 5));
  const access = form.get("unassignedBrokers") === "read" ? "read" : "none";
  await saveSetting(me.id, "payments.fourEyes", { limitEgp: limit });
  await saveSetting(me.id, "deal.fees", { transferFeeEgp: Math.max(0, Number(form.get("transferFeeEgp")) || 0), notaryFeeEgp: Math.max(0, Number(form.get("notaryFeeEgp")) || 0) });
  await saveSetting(me.id, "fx.manual", { maxDeviationPct: dev });
  await saveSetting(me.id, "deals.unassignedBrokers", { access });
  await saveSetting(me.id, "documents.validity", {
    authorityStatementMonths: Math.min(24, Math.max(1, Number(form.get("statementMonths")) || 3)),
    warnDays: Math.min(120, Math.max(1, Number(form.get("warnDays")) || 30)),
    expiredListing: form.get("expiredListing") === "hide" ? "hide" : "badge",
  });
  refresh(l);
}

/** MKT-07: نصيب السمسار الشريك من العمولة (%) */
export async function setPartnerShare(locale: string, userId: string, form: FormData) {
  const l = loc(locale);
  const b = back(l, "users");
  const me = await signedIn(l);
  await authorize(me, "commission.rates", {}, { back: b });
  const pct = Number(form.get("share"));
  if (!(pct >= 0 && pct <= 100)) redirect(`${b}&err=forbidden`);
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, partnerSharePct: true } });
  if (u?.role !== "PARTNER_BROKER") return;
  await db.user.update({ where: { id: userId }, data: { partnerSharePct: pct } });
  await audit(me.id, "partner.share", "User", userId, { before: u.partnerSharePct ? Number(u.partnerSharePct) : null, after: pct });
  refresh(l);
}

/** MKT-01 + MKT-15: قرار إنقاذ المهلة (التواريخ والنسبة) + رقم القيد في سجل الوسطاء */
export async function saveMarketing(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "commission") });
  const d = (k: string, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(String(form.get(k))) ? String(form.get(k)) : fallback);
  const cur = await getSetting("rescue");
  await saveSetting(me.id, "rescue", {
    decisionDate: d("decisionDate", cur.decisionDate),
    deadline: d("deadline", cur.deadline),
    feePct: Math.min(50, Math.max(0, Number(form.get("feePct")) || cur.feePct)),
  });
  await saveSetting(me.id, "brokerRegistrationNumber", { value: String(form.get("brokerRegistrationNumber") ?? "").trim().slice(0, 60) });
  // MKT-06: مكافأة الإحالة
  await saveSetting(me.id, "referral.reward", {
    type: form.get("rewardType") === "fixed" ? "fixed" : "pct",
    value: Math.max(0, Math.min(form.get("rewardType") === "fixed" ? 1_000_000 : 100, Number(form.get("rewardValue")) || 0)),
  });
  refresh(l);
}

/** DATA-07: إضافة حي/مرحلة للقايمة، أو إيقافه (ما بيتمسحش عشان القطع القديمة) */
export async function addDistrict(locale: string, form: FormData) {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "districts") });
  const city = String(form.get("city") ?? "");
  const nameAr = String(form.get("nameAr") ?? "").trim().replace(/\s+/g, " ");
  const nameEn = String(form.get("nameEn") ?? "").trim().replace(/\s+/g, " ");
  // GEO-03: الاسم الإنجليزي لاتيني بس
  if (!CITY_KEYS.includes(city as never) || nameAr.length < 2 || !isLatinName(nameEn)) redirect(`${back(l, "districts")}&err=district&city=${city}`);
  const d = await db.district.upsert({
    where: { city_nameAr: { city: city as City, nameAr } },
    create: { city: city as City, nameAr, nameEn, sort: 50 },
    update: { nameEn, active: true },
  });
  await audit(me.id, "district.save", "District", d.id, { city, nameAr, nameEn });
  refresh(l);
  redirect(`${back(l, "districts")}&city=${city}`);
}

export async function toggleDistrict(locale: string, id: string) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "districts") });
  const d = await db.district.findUnique({ where: { id } });
  if (!d) return;
  await db.district.update({ where: { id }, data: { active: !d.active } });
  await audit(me.id, "district.toggle", "District", id, { before: d.active, after: !d.active });
  refresh(l);
}

/** نسخة جديدة من نموذج عقد — العقود القديمة بتفضل على نسختها */
export async function bumpTemplate(locale: string, type: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "template.edit", {}, { back: back(l, "templates") });
  const list = await getSetting("contract.templates");
  const note = String(form.get("note") ?? "").trim();
  const next = list.map((t) =>
    t.type === type ? { ...t, version: `v${Number(t.version.replace("v", "")) + 1}`, updatedAt: new Date().toISOString().slice(0, 10), note } : t,
  );
  await saveSetting(me.id, "contract.templates", next);
  refresh(l);
}

/** GEO-01: إضافة/تعديل مدينة — من غير deploy. ممنوع الحذف (إيقاف بس) */
export async function saveCity(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "cities") });
  const s = (k: string) => String(form.get(k) ?? "").trim().replace(/\s+/g, " ");
  const id = s("id");
  const nameAr = s("nameAr");
  const nameEn = s("nameEn");
  const codePrefix = s("codePrefix").toUpperCase();
  const plotCodePattern = s("plotCodePattern") || "{prefix}-{block}-{number}";
  const sortOrder = Math.max(0, Math.min(999, Number(s("sortOrder")) || 50));
  if (nameAr.length < 2 || !isLatinName(nameEn) || !validPrefix(codePrefix) || !validPattern(plotCodePattern)) redirect(`${back(l, "cities")}&err=city`);
  const clash = await db.city.findFirst({ where: { codePrefix, NOT: id ? { id } : undefined } });
  if (clash) redirect(`${back(l, "cities")}&err=city_prefix`);
  if (id) {
    const before = await db.city.findUnique({ where: { id } });
    if (!before) redirect(back(l, "cities"));
    // أكواد القطع القديمة بتفضل زي ما هي؛ البادئة الجديدة بتسري على الإضافات الجديدة
    await db.city.update({ where: { id }, data: { nameAr, nameEn, codePrefix, plotCodePattern, sortOrder } });
    await audit(me.id, "city.update", "City", id, {
      before: { nameAr: before!.nameAr, nameEn: before!.nameEn, codePrefix: before!.codePrefix, plotCodePattern: before!.plotCodePattern },
      after: { nameAr, nameEn, codePrefix, plotCodePattern },
    });
  } else {
    const slug = slugFromName(nameEn);
    const newId = cityIdFromSlug(slug);
    if (!slug || (await db.city.findFirst({ where: { OR: [{ id: newId }, { slug }] } }))) redirect(`${back(l, "cities")}&err=city_exists`);
    await db.city.create({ data: { id: newId, nameAr, nameEn, slug, codePrefix, plotCodePattern, sortOrder } });
    await audit(me.id, "city.create", "City", newId, { nameAr, nameEn, codePrefix, plotCodePattern });
  }
  invalidateCities();
  await allCities(true);
  refresh(l);
  redirect(`${back(l, "cities")}&ok=city`);
}

/** GEO-01: إيقاف/تشغيل مدينة — الموقوفة ما تظهرش في الإضافة الجديدة لكن تفضل على القديم */
export async function toggleCity(locale: string, id: string) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "cities") });
  const c = await db.city.findUnique({ where: { id } });
  if (!c) return;
  await db.city.update({ where: { id }, data: { isActive: !c.isActive } });
  await audit(me.id, "city.toggle", "City", id, { before: c.isActive, after: !c.isActive });
  invalidateCities();
  await allCities(true);
  refresh(l);
}

/** GEO-02: الطرح (مرحلة بيت الوطن) — منفصل عن الحي */
export async function saveRound(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "districts") });
  const s = (k: string) => String(form.get(k) ?? "").trim().replace(/\s+/g, " ");
  const cityId = s("cityId");
  const nameAr = s("nameAr");
  const nameEn = s("nameEn");
  const number = Number(s("number"));
  const year = s("year") ? Number(s("year")) : null;
  const months = s("defaultBuildDeadlineMonths") ? Number(s("defaultBuildDeadlineMonths")) : null;
  const currency = s("installmentCurrency") === "EGP" ? "EGP" : "USD";
  if (!(await isCity(cityId)) || nameAr.length < 2 || !isLatinName(nameEn) || !Number.isInteger(number) || number < 1 || number > 99)
    redirect(`${back(l, "districts")}&err=round&city=${cityId}`);
  const r = await db.offeringRound.create({
    data: {
      cityId,
      nameAr,
      nameEn,
      number,
      year: year && year > 2000 && year < 2100 ? year : null,
      defaultBuildDeadlineMonths: months && months > 0 && months < 240 ? months : null,
      installmentCurrency: currency,
      terms: s("terms").slice(0, 1000) || null,
    },
  });
  await audit(me.id, "round.create", "OfferingRound", r.id, { cityId, nameAr, nameEn, number });
  refresh(l);
  redirect(`${back(l, "districts")}&city=${cityId}`);
}

export async function toggleRound(locale: string, id: string) {
  const l = loc(locale);
  const me = await signedIn(l);
  await authorize(me, "settings.fees", {}, { back: back(l, "districts") });
  const r = await db.offeringRound.findUnique({ where: { id } });
  if (!r) return;
  await db.offeringRound.update({ where: { id }, data: { isActive: !r.isActive } });
  await audit(me.id, "round.toggle", "OfferingRound", id, { before: r.isActive, after: !r.isActive });
  refresh(l);
}

/** PRIV-01: تسجيل طلب جهة رسمية — الجهة ورقم الطلب واللي اتسلّم، وتنبيه المستخدم إلا لو ممنوع قانوناً */
export async function recordOfficialRequest(locale: string, form: FormData) {
  const l = loc(locale);
  const me = await signedIn(l);
  if (me.role !== "ADMIN") redirect(back(l, "official"));
  const s = (k: string) => String(form.get(k) ?? "").trim().slice(0, 1000);
  const authority = s("authority");
  const referenceNo = s("referenceNo");
  const delivered = s("delivered");
  if (authority.length < 3 || referenceNo.length < 2 || delivered.length < 5) redirect(`${back(l, "official")}&err=official`);
  const phone = s("phone");
  const target = phone ? await db.user.findFirst({ where: { phone }, select: { id: true } }) : null;
  const gagged = form.get("gagged") === "on";
  const r = await db.officialRequest.create({
    data: { authority, referenceNo, delivered, gagged, userId: target?.id ?? null, dealId: s("dealId") || null, createdById: me.id, notifiedAt: target && !gagged ? new Date() : null },
  });
  await audit(me.id, "privacy.official_request", "OfficialRequest", r.id, { authority, referenceNo, userId: target?.id, gagged });
  if (target && !gagged) {
    const { notify } = await import("@/lib/notifications");
    await notify([target.id], {
      kind: "privacy.official_request",
      ar: ["جهة رسمية طلبت بيانات تخصّك", `${authority} — طلب رقم ${referenceNo}. اللي اتسلّم: ${delivered}`],
      en: ["An authority requested data about you", `${authority} — request no. ${referenceNo}. Delivered: ${delivered}`],
      link: `/account/security#privacy`,
    });
  }
  refresh(l);
  redirect(`${back(l, "official")}&ok=official`);
}

/** REL-03: تفعيل/إيقاف «يتعامل كعميل» لموظف (يبيع/يشتري لنفسه) */
export async function toggleClientEnabled(locale: string, userId: string) {
  const l = loc(locale);
  const me = await signedIn(l);
  if (me.role !== "ADMIN") redirect(back(l, "users"));
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, clientEnabled: true } });
  if (!u || u.role === "CLIENT") redirect(`/${l}/settings/users/${userId}`);
  await db.user.update({ where: { id: userId }, data: { clientEnabled: !u!.clientEnabled } });
  await audit(me.id, "user.client_enabled", "User", userId, { before: u!.clientEnabled, after: !u!.clientEnabled });
  redirect(`/${l}/settings/users/${userId}`);
}

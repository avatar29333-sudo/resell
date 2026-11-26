"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { updateDailyRate } from "@/lib/fx";
import { moveBlobsToS3 } from "@/lib/storage";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

const ROLES: Role[] = ["CLIENT", "BROKER", "LAWYER", "AGENT", "FINANCE", "ADMIN"];
const admin = (locale: string, roles: Role[] = ["ADMIN"]) => {
  const l = isLocale(locale) ? locale : "ar";
  return requireUser(l, `/${l}/settings`, roles);
};
const refresh = (locale: string) => revalidatePath(`/${isLocale(locale) ? locale : "ar"}/settings`);

async function saveSetting(userId: string, key: string, value: Prisma.InputJsonValue) {
  const before = await db.appSetting.findUnique({ where: { key } });
  await db.appSetting.upsert({ where: { key }, create: { key, value, updatedById: userId }, update: { value, updatedById: userId } });
  await audit(userId, "setting.update", "AppSetting", key, { before: (before?.value ?? null) as Prisma.InputJsonValue, after: value });
}

export async function setUserRole(locale: string, userId: string, form: FormData) {
  const me = await admin(locale);
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role) || userId === me.id) return; // الأدمن ما يغيرش دوره بنفسه
  await db.user.update({ where: { id: userId }, data: { role, twoFactorEnabled: role !== "CLIENT" } });
  await audit(me.id, "user.role", "User", userId, { role });
  refresh(locale);
}

export async function addManualRate(locale: string, form: FormData) {
  const me = await admin(locale, ["ADMIN", "FINANCE"]);
  const buy = Number(form.get("buy"));
  const sell = Number(form.get("sell"));
  if (!(buy > 0 && sell >= buy)) return;
  const r = await db.exchangeRate.create({
    // تاريخ النهارده بتوقيت القاهرة
    data: { date: new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date())), buy, sell, source: "MANUAL", enteredById: me.id },
  });
  await audit(me.id, "fx.manual", "ExchangeRate", r.id, { buy, sell });
  refresh(locale);
}

/** سحب سعر النهارده دلوقتي (نفس اللي المهمة اليومية بتعمله) */
export async function fetchRateNow(locale: string) {
  const me = await admin(locale, ["ADMIN", "FINANCE"]);
  const r = await updateDailyRate();
  await audit(me.id, "fx.fetch_now", "ExchangeRate", r.status === "unavailable" ? "-" : r.rate.id, { status: r.status });
  refresh(locale);
  redirect(`/${isLocale(locale) ? locale : "ar"}/settings?tab=fx&fx=${r.status}`);
}

/** نقل دفعة من الملفات القديمة لـ S3 */
export async function moveFilesToS3(locale: string) {
  const me = await admin(locale);
  const r = await moveBlobsToS3();
  await audit(me.id, "storage.move_to_s3", "FileBlob", "batch", { moved: r.moved, failed: r.failed, remaining: r.remaining });
  refresh(locale);
  redirect(`/${isLocale(locale) ? locale : "ar"}/settings?tab=storage&moved=${r.moved}&failed=${r.failed}${r.error ? `&err=${r.error}` : ""}`);
}

export async function saveCommission(locale: string, form: FormData) {
  const me = await admin(locale);
  const sellerPct = Number(form.get("sellerPct"));
  const buyerPct = Number(form.get("buyerPct"));
  if (!(sellerPct >= 0 && sellerPct <= 10 && buyerPct >= 0 && buyerPct <= 10)) return;
  await saveSetting(me.id, "commission.rates", { sellerPct, buyerPct });
  refresh(locale);
}

export async function saveFees(locale: string, form: FormData) {
  const me = await admin(locale);
  const pct = String(form.get("authorityTransferPct") ?? "").trim();
  await saveSetting(me.id, "service.fees", {
    deadlineRescueEgp: Number(form.get("deadlineRescueEgp")) || 0,
    siteInspectionEgp: Number(form.get("siteInspectionEgp")) || 0,
    authorityTransferPct: pct === "" ? null : Math.min(20, Math.max(0, Number(pct) || 0)),
    buyerLawyerFeeEgp: Math.max(0, Number(form.get("buyerLawyerFeeEgp")) || 0),
  });
  refresh(locale);
}

/** نسخة جديدة من نموذج عقد — العقود القديمة بتفضل على نسختها */
export async function bumpTemplate(locale: string, type: string, form: FormData) {
  const me = await admin(locale);
  const list = await getSetting("contract.templates");
  const note = String(form.get("note") ?? "").trim();
  const next = list.map((t) =>
    t.type === type ? { ...t, version: `v${Number(t.version.replace("v", "")) + 1}`, updatedAt: new Date().toISOString().slice(0, 10), note } : t,
  );
  await saveSetting(me.id, "contract.templates", next);
  refresh(locale);
}

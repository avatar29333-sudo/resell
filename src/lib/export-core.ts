import { createHash } from "node:crypto";

/**
 * ADM-EXP — أجزاء التصدير النقية (متغطية باختبار): البيان (manifest) بالبصمات، CSV، أسماء ملفات آمنة، وكلمة السر.
 */
export type Entry = { path: string; data: Uint8Array };

export const sha256 = (d: Uint8Array) => createHash("sha256").update(d).digest("hex");

/** اسم ملف آمن للـ ZIP (عربي مسموح، من غير فواصل مسارات أو رموز ممنوعة على ويندوز) */
export const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";

/** أسماء مكررة في نفس المجلد بتاخد رقم: «ملف.pdf» ← «ملف (2).pdf» */
export function uniquePaths(entries: Entry[]) {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const n = (seen.get(e.path) ?? 0) + 1;
    seen.set(e.path, n);
    if (n === 1) return e;
    const dot = e.path.lastIndexOf(".");
    const p = dot > e.path.lastIndexOf("/") ? `${e.path.slice(0, dot)} (${n})${e.path.slice(dot)}` : `${e.path} (${n})`;
    return { ...e, path: p };
  });
}

/** البيان: كل ملف + بصمته + وقت التصدير + مين صدّره — بيثبت إن الملفات ما اتعدلتش بعد التصدير */
export function buildManifest(entries: Entry[], meta: { exportedAt: string; exportedBy: string; reason: string; subject: string }) {
  return {
    ...meta,
    algorithm: "SHA-256",
    files: entries.map((e) => ({ path: e.path, bytes: e.data.length, sha256: sha256(e.data) })),
  };
}

export function verifyManifest(entries: Entry[], manifest: ReturnType<typeof buildManifest>) {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return manifest.files.every((f) => byPath.has(f.path) && sha256(byPath.get(f.path)!.data) === f.sha256);
}

/** CSV بـ BOM عشان العربي يتفتح سليم في Excel */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // منع تنفيذ معادلات في Excel (CSV injection) — الأرقام السالبة بتفضل زي ما هي
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new TextEncoder().encode("﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"));
}

/** كلمة سر قوية للـ ZIP (بتتبعت للأدمن في رسالة منفصلة) */
export function zipPassword(random: Uint8Array) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(random.slice(0, 20), (b) => alphabet[b % alphabet.length]).join("");
}

export const EXPORT_REASONS = ["dispute", "official_request", "archive", "user_request", "other"] as const;
export const REASON_AR: Record<string, string> = { dispute: "نزاع", official_request: "طلب جهة رسمية", archive: "أرشفة", user_request: "طلب المستخدم", other: "أخرى" };

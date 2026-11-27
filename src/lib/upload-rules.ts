/** DOC-01 — قواعد الرفع المتعدد (منطق نقي، متغطي باختبار) */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB للملف
export const CHUNK_BYTES = 3 * 1024 * 1024; // أقل من حد الطلب الواحد في Vercel (4.5MB)
export const MAX_SESSIONS_PER_HOUR = 60;
/** المسموح بعد التحويل: HEIC بيتحول JPG في المتصفح قبل الرفع */
export const UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const isHeic = (name: string, type: string) => /image\/hei[cf]/i.test(type) || /\.(heic|heif)$/i.test(name);

export type InitCheck = { ok: true; chunkCount: number } | { ok: false; error: "type" | "size" | "heic" | "name" };

export function checkInit(f: { fileName: string; mimeType: string; size: number }): InitCheck {
  if (!f.fileName || f.fileName.length > 200) return { ok: false, error: "name" };
  if (isHeic(f.fileName, f.mimeType)) return { ok: false, error: "heic" }; // لازم يتحول JPG الأول
  if (!(UPLOAD_TYPES as readonly string[]).includes(f.mimeType)) return { ok: false, error: "type" };
  if (!Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_UPLOAD_BYTES) return { ok: false, error: "size" };
  return { ok: true, chunkCount: Math.ceil(f.size / CHUNK_BYTES) };
}

/** كل جزء لازم يكون بالحجم الصح (الأخير ممكن أصغر) */
export function chunkOk(i: number, len: number, total: number, chunkCount: number) {
  if (!Number.isInteger(i) || i < 0 || i >= chunkCount) return false;
  const expected = i < chunkCount - 1 ? CHUNK_BYTES : total - CHUNK_BYTES * (chunkCount - 1);
  return len === expected;
}

/** عنوان «مستند آخر»: إجباري، من 3 لـ 120 حرف */
export const cleanTitle = (t: unknown) => {
  const s = String(t ?? "").trim().replace(/\s+/g, " ");
  return s.length >= 3 && s.length <= 120 ? s : null;
};

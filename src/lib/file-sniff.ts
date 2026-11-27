/**
 * SEC-09 — نوع الملف الحقيقي من أول بايتات (magic bytes)، مش من الامتداد ولا من اللي المتصفح بيقوله.
 * المسموح: PDF و JPEG و PNG و WebP بس (مفيش SVG — ممكن يشغّل سكريبت).
 */
export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
export type SafeMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export function sniffMime(b: Uint8Array): SafeMime | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

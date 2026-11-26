import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";

// خزنة الملفات. لحد ما S3 يتظبط، الملفات بتتخزن في جدول FileBlob.
// الواجهة دي هي اللي هتتغير بس لما نضيف S3 — باقي الكود ما يتغيرش.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // حد Vercel للطلب الواحد 4.5MB
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/svg+xml"];

export async function saveFile(data: Buffer, mimeType: string, prefix = "docs") {
  const key = `${prefix}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(data).digest("hex");
  await db.fileBlob.create({ data: { key, data: new Uint8Array(data), mimeType } });
  return { key, sha256, sizeBytes: data.length };
}

export async function readFile(key: string) {
  return db.fileBlob.findUnique({ where: { key } });
}

/** فورم فيه ملف: يرجّع الملف لو موجود ومسموح، أو رسالة الخطأ */
export async function fileFromForm(form: FormData, field: string) {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return { file: null };
  if (f.size > MAX_FILE_BYTES) return { error: "size" as const };
  if (!ALLOWED_MIME.includes(f.type)) return { error: "type" as const };
  return { file: { name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) } };
}

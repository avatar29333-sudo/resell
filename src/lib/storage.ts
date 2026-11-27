import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "./db";
import { sniffMime } from "./file-sniff";

// خزنة الملفات:
// - لو إعدادات S3 موجودة (S3_ENDPOINT + S3_BUCKET + المفاتيح): الملفات الجديدة بتروح S3،
//   والقراءة برابط مؤقت بيخلص بعد 5 دقايق — بعد فحص الصلاحية والتسجيل في سجل التدقيق.
// - من غيرها: الملفات بتتخزن في جدول FileBlob (التجربة).
// الملفات القديمة اللي في FileBlob بتفضل تتقري حتى بعد التحويل لـ S3.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // حد Vercel للطلب الواحد 4.5MB
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const LINK_SECONDS = 300;

let client: S3Client | null = null;
function s3() {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  client ??= new S3Client({
    endpoint: S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return { client, bucket: S3_BUCKET };
}

export const storageMode = () => (s3() ? "s3" : "database");

export async function saveFile(data: Buffer, mimeType: string, prefix = "docs") {
  const key = `${prefix}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(data).digest("hex");
  const store = s3();
  if (store) {
    await store.client.send(
      new PutObjectCommand({
        Bucket: store.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        // بعض المزوّدين (زي R2) بيشفّروا لوحدهم وبيرفضوا الهيدر ده — عشان كده اختياري
        ...(process.env.S3_SSE ? { ServerSideEncryption: process.env.S3_SSE as "AES256" } : {}),
      }),
    );
  } else {
    await db.fileBlob.create({ data: { key, data: new Uint8Array(data), mimeType } });
  }
  return { key, sha256, sizeBytes: data.length };
}

export type StoredFile = { kind: "bytes"; data: Uint8Array; mimeType: string } | { kind: "url"; url: string };

/** يرجّع الملف نفسه (لو في قاعدة البيانات) أو رابط مؤقت (لو في S3) */
export async function readFile(key: string, fileName: string, mimeType: string): Promise<StoredFile | null> {
  const blob = await db.fileBlob.findUnique({ where: { key } });
  if (blob) return { kind: "bytes", data: blob.data, mimeType: blob.mimeType };
  const store = s3();
  if (!store) return null;
  const url = await getSignedUrl(
    store.client,
    new GetObjectCommand({
      Bucket: store.bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: LINK_SECONDS },
  );
  return { kind: "url", url };
}

/**
 * نقل الملفات القديمة من قاعدة البيانات لـ S3 — دفعة واحدة كل مرة (عشان حد وقت Vercel).
 * كل ملف بيترفع بنفس المفتاح، وبنتأكد إن حجمه في S3 مطابق قبل ما نمسحه من القاعدة.
 */
export async function moveBlobsToS3(batch = 60) {
  const store = s3();
  if (!store) return { moved: 0, failed: 0, remaining: await db.fileBlob.count(), error: "s3_not_configured" as const };
  const rows = await db.fileBlob.findMany({ take: batch, orderBy: { createdAt: "asc" } });
  let moved = 0;
  let failed = 0;
  for (const b of rows) {
    try {
      await store.client.send(
        new PutObjectCommand({
          Bucket: store.bucket,
          Key: b.key,
          Body: Buffer.from(b.data),
          ContentType: b.mimeType,
          ...(process.env.S3_SSE ? { ServerSideEncryption: process.env.S3_SSE as "AES256" } : {}),
        }),
      );
      const head = await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: b.key }));
      if (head.ContentLength !== b.data.length) throw new Error("size mismatch");
      await db.fileBlob.delete({ where: { key: b.key } });
      moved++;
    } catch (e) {
      console.error("move to s3 failed", b.key, e);
      failed++;
    }
  }
  return { moved, failed, remaining: await db.fileBlob.count(), error: null };
}

/** OPS-02: كذا ملف في نفس الحقل (صور المعاينة) — كلهم لازم يعدّوا نفس الفحص */
export async function filesFromForm(form: FormData, field: string, max = 10) {
  const out: { name: string; type: string; data: Buffer }[] = [];
  for (const f of form.getAll(field).slice(0, max)) {
    if (typeof f === "string" || f.size === 0) continue;
    if (f.size > MAX_FILE_BYTES) return { error: "size" as const, files: [] };
    const data = Buffer.from(await f.arrayBuffer());
    const type = sniffMime(data);
    if (!type) return { error: "type" as const, files: [] };
    out.push({ name: f.name, type, data });
  }
  return { error: null, files: out };
}

/** فورم فيه ملف: يرجّع الملف لو موجود ومسموح، أو رسالة الخطأ */
export async function fileFromForm(form: FormData, field: string) {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return { file: null };
  if (f.size > MAX_FILE_BYTES) return { error: "size" as const };
  // SEC-09: النوع من محتوى الملف نفسه (مش الامتداد ولا كلام المتصفح) — ومفيش SVG
  const data = Buffer.from(await f.arrayBuffer());
  const type = sniffMime(data);
  if (!type) return { error: "type" as const };
  return { file: { name: f.name, type, data } };
}

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "./db";

// خزنة الملفات:
// - لو إعدادات S3 موجودة (S3_ENDPOINT + S3_BUCKET + المفاتيح): الملفات الجديدة بتروح S3،
//   والقراءة برابط مؤقت بيخلص بعد 5 دقايق — بعد فحص الصلاحية والتسجيل في سجل التدقيق.
// - من غيرها: الملفات بتتخزن في جدول FileBlob (التجربة).
// الملفات القديمة اللي في FileBlob بتفضل تتقري حتى بعد التحويل لـ S3.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // حد Vercel للطلب الواحد 4.5MB
export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/svg+xml"];
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

/** فورم فيه ملف: يرجّع الملف لو موجود ومسموح، أو رسالة الخطأ */
export async function fileFromForm(form: FormData, field: string) {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return { file: null };
  if (f.size > MAX_FILE_BYTES) return { error: "size" as const };
  if (!ALLOWED_MIME.includes(f.type)) return { error: "type" as const };
  return { file: { name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) } };
}

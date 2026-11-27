import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { saveFile } from "@/lib/storage";
import { sniffMime } from "@/lib/file-sniff";

/**
 * DOC-01: تجميع الأجزاء → فحص النوع الحقيقي (magic bytes) → تخزين (S3/R2 أو القاعدة) مع SHA-256.
 * الناتج «مسودة» مستند آخر (OTHER) ملك اللي رفعه، وبيترتبط بالصفقة أو العرض لما الفورم يتبعت.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });
  const s = await db.uploadSession.findUnique({ where: { id }, include: { chunks: { orderBy: { idx: "asc" } } } });
  if (!s || s.userId !== user.id) return Response.json({ error: "session" }, { status: 404 });
  if (s.documentId) return Response.json({ id: s.documentId, name: s.fileName });
  if (s.chunks.length !== s.chunkCount || s.chunks.some((c, i) => c.idx !== i)) return Response.json({ error: "incomplete" }, { status: 400 });
  const data = Buffer.concat(s.chunks.map((c) => Buffer.from(c.data)));
  if (data.length !== s.sizeBytes) return Response.json({ error: "size" }, { status: 400 });
  const real = sniffMime(data);
  if (!real) return Response.json({ error: "type" }, { status: 400 });
  const saved = await saveFile(data, real);
  const doc = await db.document.create({
    data: { type: "OTHER", ownerId: user.id, uploadedById: user.id, storageKey: saved.key, sha256: saved.sha256, sizeBytes: saved.sizeBytes, fileName: s.fileName, mimeType: real },
  });
  await db.$transaction([db.uploadChunk.deleteMany({ where: { sessionId: id } }), db.uploadSession.update({ where: { id }, data: { documentId: doc.id } })]);
  await audit(user.id, "document.draft_upload", "Document", doc.id, { type: "OTHER", sizeBytes: saved.sizeBytes, sha256: saved.sha256 });
  return Response.json({ id: doc.id, name: s.fileName });
}

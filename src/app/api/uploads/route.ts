import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHUNK_BYTES, MAX_SESSIONS_PER_HOUR, checkInit } from "@/lib/upload-rules";

/** DOC-01: بداية رفع ملف (لحد 20MB) — الملف بيتبعت أجزاء على /api/uploads/:id */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });
  let body: { fileName?: string; mimeType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad" }, { status: 400 });
  }
  const f = { fileName: String(body.fileName ?? "").slice(0, 200), mimeType: String(body.mimeType ?? ""), size: Number(body.size) };
  const c = checkInit(f);
  if (!c.ok) return Response.json({ error: c.error }, { status: 400 });
  const hourAgo = new Date(Date.now() - 3600_000);
  // تنضيف الجلسات المتسابة + حد معقول للطلبات
  await db.uploadSession.deleteMany({ where: { userId: user.id, documentId: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  if ((await db.uploadSession.count({ where: { userId: user.id, createdAt: { gt: hourAgo } } })) >= MAX_SESSIONS_PER_HOUR) return Response.json({ error: "rate" }, { status: 429 });
  const s = await db.uploadSession.create({ data: { userId: user.id, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.size, chunkCount: c.chunkCount } });
  return Response.json({ id: s.id, chunkBytes: CHUNK_BYTES, chunkCount: c.chunkCount });
}

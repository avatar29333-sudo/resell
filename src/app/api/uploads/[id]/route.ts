import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { chunkOk } from "@/lib/upload-rules";

/** DOC-01: جزء من الملف (?i=رقم الجزء) — الجسم بايتات خام */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });
  const s = await db.uploadSession.findUnique({ where: { id } });
  if (!s || s.userId !== user.id || s.documentId) return Response.json({ error: "session" }, { status: 404 });
  const i = Number(new URL(req.url).searchParams.get("i"));
  const data = new Uint8Array(await req.arrayBuffer());
  if (!chunkOk(i, data.length, s.sizeBytes, s.chunkCount)) return Response.json({ error: "chunk" }, { status: 400 });
  await db.uploadChunk.upsert({ where: { sessionId_idx: { sessionId: id, idx: i } }, create: { sessionId: id, idx: i, data }, update: { data } });
  return Response.json({ ok: true });
}

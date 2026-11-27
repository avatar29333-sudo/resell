import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { deleteExportFile, readBytes } from "@/lib/storage";

/** ADM-EXP-03: رابط التنزيل لمرة واحدة ولمدة ساعة، للي طلب التصدير بس — وبعدها الملف المؤقت بيتمسح */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const job = await db.exportJob.findUnique({ where: { id } });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!job || job.requestedById !== user.id || !job.tokenHash || createHash("sha256").update(token).digest("hex") !== job.tokenHash) {
    await audit(user.id, "authz.denied", "ExportJob", id, { action: "export.download" });
    return new Response("Not allowed", { status: 403 });
  }
  if (job.status !== "READY" || !job.storageKey || !job.expiresAt || job.expiresAt < new Date()) {
    if (job.status === "READY" && job.storageKey) {
      await deleteExportFile(job.storageKey);
      await db.exportJob.update({ where: { id }, data: { status: "EXPIRED" } });
    }
    return new Response("الرابط ده انتهى أو اتستخدم قبل كده — اطلب تصدير جديد.", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // مرة واحدة فعلاً: طلبين في نفس اللحظة → واحد بس ياخد الملف
  const claimed = await db.exportJob.updateMany({ where: { id, status: "READY" }, data: { status: "DOWNLOADED", downloadedAt: new Date() } });
  if (claimed.count !== 1) return new Response("الرابط اتستخدم قبل كده.", { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const data = await readBytes(job.storageKey);
  await deleteExportFile(job.storageKey);
  await audit(user.id, "export.downloaded", "ExportJob", id, { sha256: job.sha256, bytes: job.sizeBytes });
  if (!data) return new Response("File missing", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.fileName ?? "export.zip")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { getCurrentUser } from "@/lib/auth";
import { canViewDocument } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

// فتح مستند: الصلاحية بتتفحص هنا، وكل فتح بيتسجل باسم اللي فتحه
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const doc = await canViewDocument(user, id);
  if (!doc) return new Response(user ? "Not allowed" : "Sign in required", { status: user ? 403 : 401 });

  const file = await readFile(doc.storageKey, doc.fileName, doc.mimeType);
  if (!file) return new Response("File missing", { status: 404 });

  if (user) await audit(user.id, "document.view", "Document", doc.id, { type: doc.type, version: doc.version });

  // في S3: تحويل لرابط مؤقت بيخلص بعد 10 دقايق
  if (file.kind === "url") {
    return new Response(null, { status: 302, headers: { Location: file.url, "Cache-Control": "private, no-store" } });
  }

  const headers: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // صور SVG ما تقدرش تشغّل سكريبت (الـ PDF بيحتاج عارض المتصفح فمن غير sandbox)
  if (file.mimeType === "image/svg+xml") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new Response(Buffer.from(file.data), { headers });
}

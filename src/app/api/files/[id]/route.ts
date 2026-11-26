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

  const blob = await readFile(doc.storageKey);
  if (!blob) return new Response("File missing", { status: 404 });

  if (user) await audit(user.id, "document.view", "Document", doc.id, { type: doc.type, version: doc.version });

  const headers: Record<string, string> = {
    "Content-Type": blob.mimeType,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // صور SVG ما تقدرش تشغّل سكريبت (الـ PDF بيحتاج عارض المتصفح فمن غير sandbox)
  if (blob.mimeType === "image/svg+xml") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return new Response(Buffer.from(blob.data), { headers });
}

// فحص سريع إن السيرفر شغال: GET /api/health
export function GET() {
  return Response.json({ ok: true, service: "resell", time: new Date().toISOString() });
}

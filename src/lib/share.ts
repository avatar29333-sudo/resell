/** MKT-05 — رابط المشاركة (منطق نقي، متغطي باختبار): UTM ثابتة + كود الإحالة لو المستخدم ليه كود */
export function shareUrl(base: string, path: string, ref?: string | null, source = "whatsapp") {
  const u = new URL(path, base);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "share");
  if (ref) u.searchParams.set("ref", ref);
  return u.toString();
}

export function whatsappHref(text: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

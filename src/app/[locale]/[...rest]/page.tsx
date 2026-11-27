import { notFound } from "next/navigation";

// UX-11: أي مسار مش موجود جوه /ar أو /en → صفحة 404 بنفس التصميم واللغة
export default function CatchAll() {
  notFound();
}

/** MKT-14 — نص القصة المختصرة (منطق نقي، متغطي باختبار): المدينة والمدة بس، من غير أسماء؛ الكود بموافقة الطرفين */
export function storyText(locale: "ar" | "en", cityName: string, days: number, plotCode?: string | null) {
  const d = Math.max(1, Math.round(days));
  if (locale === "ar") return `قطعة في ${cityName}${plotCode ? ` (${plotCode})` : ""} اتباعت واتنقلت ملكيتها في الجهاز خلال ${d} يوم — بورق متراجع مع محامي وعربون محفوظ في البنك.`;
  return `A plot in ${cityName}${plotCode ? ` (${plotCode})` : ""} was sold and transferred at the authority in ${d} days — with lawyer-checked papers and a bank-held deposit.`;
}

export const bothConsented = (s: { buyerConsentAt: Date | null; sellerConsentAt: Date | null }) => !!s.buyerConsentAt && !!s.sellerConsentAt;

export const dealDays = (createdAt: Date, closedAt: Date | null) => (closedAt ? (closedAt.getTime() - createdAt.getTime()) / 86_400_000 : 0);

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * PRIV-01: «حمّل بياناتي» — كل البيانات اللي عندنا عنك (JSON).
 * من غير أسرار الدخول، والحسابات البنكية مخفية، والمستندات بياناتها بس (الملفات نفسها بتتفتح من حسابك).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const [listings, dealsAsBuyer, documents, consents, disclosures, banks, notifications, actions] = await Promise.all([
    db.listing.findMany({ where: { sellerId: user.id }, select: { id: true, status: true, price: true, currency: true, createdAt: true, plot: { select: { city: true, district: true, code: true, areaSqm: true } } } }),
    db.deal.findMany({ where: { buyerId: user.id }, select: { id: true, stage: true, status: true, agreedPrice: true, createdAt: true } }),
    db.document.findMany({ where: { OR: [{ ownerId: user.id }, { uploadedById: user.id }] }, select: { id: true, type: true, title: true, fileName: true, status: true, visibility: true, sha256: true, createdAt: true } }),
    db.consentRecord.findMany({ where: { userId: user.id }, orderBy: { acceptedAt: "asc" } }),
    db.disclosureConsent.findMany({ where: { userId: user.id } }),
    db.bankAccount.findMany({ where: { userId: user.id } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: "desc" }, take: 500, select: { action: true, entityType: true, entityId: true, createdAt: true } }),
  ]);
  const deals = await db.deal.findMany({ where: { listing: { sellerId: user.id } }, select: { id: true, stage: true, status: true, agreedPrice: true, createdAt: true } });
  const data = {
    exportedAt: new Date().toISOString(),
    profile: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role, accountLevel: user.accountLevel, locale: user.locale, createdAt: user.createdAt, termsAcceptedAt: user.termsAcceptedAt, marketingOptOutAt: user.marketingOptOutAt },
    listings,
    deals: { asBuyer: dealsAsBuyer, asSeller: deals },
    documents,
    consents,
    disclosures,
    bankAccounts: banks.map((b) => ({ id: b.id, holderName: b.holderName, bankName: b.bankName, country: b.country, currency: b.currency, iban: `${b.country}•• •••• •••• ${b.ibanLast4}`, status: b.status, createdAt: b.createdAt })),
    notifications,
    yourActions: actions,
    note: "المستندات المرتبطة بعقود بتفضل محفوظة للمدة القانونية حتى لو طلبت الحذف.",
  };
  await audit(user.id, "privacy.export", "User", user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="resell-my-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" },
  });
}

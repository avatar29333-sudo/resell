-- PUB-01..03: موافقة نموذج 1، تأكيد المالك بكود، اتفاقية الشريك، مراجعة طلبات شراء العميل الأساسي، إحالة مشتري — إضافة بس
ALTER TABLE "Listing" ADD COLUMN "authorizationConsentAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "ownerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "ownerConfirmCodeHash" TEXT;
ALTER TABLE "Listing" ADD COLUMN "ownerConfirmExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "partnerAgreedAt" TIMESTAMP(3);
ALTER TABLE "BuyRequest" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN "referredByPartnerId" TEXT;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_referredByPartnerId_fkey" FOREIGN KEY ("referredByPartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- العروض والطلبات الموجودة: كانت ماشية بالنظام القديم — بتتعامل كمتوافق عليها.
-- مش موافقات جديدة: بتتسجل هنا إنها «قديمة» (legacy) عشان تتميّز عن موافقة حقيقية بالكود
CREATE TABLE IF NOT EXISTS "_legacy_consents_20261127" AS
  SELECT 'listing' AS kind, id FROM "Listing" WHERE "status" <> 'DRAFT'
  UNION ALL SELECT 'buy_request', id FROM "BuyRequest"
  UNION ALL SELECT 'partner', id FROM "User" WHERE "role" = 'PARTNER_BROKER';
UPDATE "Listing" SET "authorizationConsentAt" = "createdAt", "ownerConfirmedAt" = "createdAt" WHERE "status" <> 'DRAFT';
UPDATE "BuyRequest" SET "approvedAt" = "createdAt";
UPDATE "User" SET "partnerAgreedAt" = COALESCE("partnerApprovedAt", CURRENT_TIMESTAMP) WHERE "role" = 'PARTNER_BROKER';

CREATE TABLE "PartnerReferral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerConsentAt" TIMESTAMP(3) NOT NULL,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerReferral_listingId_buyerId_key" ON "PartnerReferral"("listingId", "buyerId");
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

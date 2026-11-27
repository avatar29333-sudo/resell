-- BANK-01: الحسابات البنكية (حقول مشفّرة، تحقق، فترة انتظار 48 ساعة، ممنوع الحذف) — إضافة بس
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "ibanEnc" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "ibanHash" TEXT NOT NULL,
    "accountNumberEnc" TEXT,
    "swiftBic" TEXT,
    "branch" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nameMatches" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "proofDocumentId" TEXT,
    "usableAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");
CREATE INDEX "BankAccount_status_idx" ON "BankAccount"("status");
CREATE INDEX "BankAccount_ibanHash_idx" ON "BankAccount"("ibanHash");
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_proofDocumentId_fkey" FOREIGN KEY ("proofDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- الحساب ما بيتمسحش (بيتوقف بس)
CREATE OR REPLACE FUNCTION resell_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ممنوع الحذف — السجل بيتوقف بس';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BankAccount_no_delete" BEFORE DELETE ON "BankAccount" FOR EACH ROW EXECUTE FUNCTION resell_block_delete();

-- الحساب اللي هيستلم عليه كل طرف في الصفقة (بيتثبت عند توقيع نموذج 3)
ALTER TABLE "Deal" ADD COLUMN "buyerBankAccountId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "sellerBankAccountId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "bankLockedAt" TIMESTAMP(3);
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_buyerBankAccountId_fkey" FOREIGN KEY ("buyerBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_sellerBankAccountId_fkey" FOREIGN KEY ("sellerBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FEE-01: مصاريف التحويل الفعلية على المستلم + الصافي + الحساب اللي اتصرف عليه
ALTER TABLE "Deposit" ADD COLUMN "payoutBankAccountId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "payoutFeeEgp" DECIMAL(14,2);
ALTER TABLE "Deposit" ADD COLUMN "payoutNetEgp" DECIMAL(14,2);
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_payoutBankAccountId_fkey" FOREIGN KEY ("payoutBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PRIV-01: الكشف بالموافقة
CREATE TABLE "DisclosureConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fields" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'USER',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "DisclosureConsent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DisclosureConsent_dealId_userId_idx" ON "DisclosureConsent"("dealId", "userId");
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisclosureConsent" ADD CONSTRAINT "DisclosureConsent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PRIV-01: رؤية كل مستند — الافتراضي للجديد «خاص»
ALTER TABLE "Document" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';
-- القديم يفضل زي ما كان بيظهر قبل كده (ما نكسرش صفقات شغالة)
UPDATE "Document" SET "visibility" = 'SHARED_WITH_COUNTERPARTY' WHERE "dealId" IS NOT NULL OR "listingId" IS NOT NULL;

-- الصفقات القديمة: موافقات كشف ضمنية مطابقة للي كان ظاهر فعلاً (موسومة BACKFILL)
INSERT INTO "DisclosureConsent" ("id", "userId", "dealId", "fields", "source")
SELECT 'dc_' || md5(d."id" || u.uid), u.uid, d."id",
       CASE WHEN EXISTS (SELECT 1 FROM "Contract" c WHERE c."dealId" = d."id" AND c."type" = 'PRELIMINARY_CONTRACT' AND c."status" IN ('SIGNED','VERIFIED'))
            THEN ARRAY['name','plotCode','documents'] ELSE ARRAY['name','plotCode'] END,
       'BACKFILL'
FROM "Deal" d
JOIN "Listing" l ON l."id" = d."listingId"
CROSS JOIN LATERAL (VALUES (d."buyerId"), (l."sellerId")) AS u(uid)
WHERE EXISTS (SELECT 1 FROM "Contract" c WHERE c."dealId" = d."id" AND c."type" = 'COMMISSION_AGREEMENT' AND c."status" IN ('SIGNED','VERIFIED'));

-- PRIV-01: طلبات الجهات الرسمية
CREATE TABLE "OfficialRequest" (
    "id" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "userId" TEXT,
    "dealId" TEXT,
    "delivered" TEXT NOT NULL,
    "gagged" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficialRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OfficialRequest" ADD CONSTRAINT "OfficialRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfficialRequest" ADD CONSTRAINT "OfficialRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER "OfficialRequest_append_only" BEFORE UPDATE OR DELETE ON "OfficialRequest" FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- PRIV-01: سحب الموافقة التسويقية
ALTER TABLE "User" ADD COLUMN "marketingOptOutAt" TIMESTAMP(3);

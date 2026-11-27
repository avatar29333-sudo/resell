-- MKT-10 + MKT-06: مصدر العميل (first/last touch) + الإحالة (أعمدة جديدة بس)
ALTER TABLE "User" ADD COLUMN "source" JSONB, ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRequest" ADD COLUMN "source" JSONB;
ALTER TABLE "Deal" ADD COLUMN "source" JSONB;

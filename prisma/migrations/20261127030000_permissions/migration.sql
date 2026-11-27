-- PERM-04/05/07/08/09 — إضافات بس (مفيش مسح ولا تعديل لأعمدة موجودة)

-- أدوار جديدة
ALTER TYPE "Role" ADD VALUE 'PARTNER_BROKER';
ALTER TYPE "Role" ADD VALUE 'BROKER_LEAD';

-- حالة الحساب + موافقات الصرف
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendReason" TEXT,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "brokerRegNo" TEXT,
  ADD COLUMN "partnerApprovedAt" TIMESTAMP(3),
  ADD COLUMN "kycRejections" INTEGER NOT NULL DEFAULT 0;

-- الإسناد على العرض
ALTER TABLE "Listing"
  ADD COLUMN "assignedBrokerId" TEXT,
  ADD COLUMN "assignedLawyerId" TEXT,
  ADD COLUMN "submittedById" TEXT,
  ADD COLUMN "clientConsentAt" TIMESTAMP(3);
CREATE INDEX "Listing_assignedBrokerId_idx" ON "Listing"("assignedBrokerId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_assignedBrokerId_fkey" FOREIGN KEY ("assignedBrokerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_assignedLawyerId_fkey" FOREIGN KEY ("assignedLawyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- قاعدة الأربع عيون
CREATE TABLE "PaymentApproval" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentApproval_status_createdAt_idx" ON "PaymentApproval"("status", "createdAt");
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentApproval" ADD CONSTRAINT "PaymentApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PERM-04: العروض الموجودة بتاخد وسيط ومحامي من الصفقات اللي عليها أو بالدور
UPDATE "Listing" l SET "assignedBrokerId" = d."brokerId"
FROM (SELECT DISTINCT ON ("listingId") "listingId", "brokerId" FROM "Deal" WHERE "brokerId" IS NOT NULL ORDER BY "listingId", "createdAt") d
WHERE d."listingId" = l.id AND l."assignedBrokerId" IS NULL;

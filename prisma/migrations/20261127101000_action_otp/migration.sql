-- DEAL-03 + CON-03: أكواد تحقق مربوطة بالإجراء + سجل موافقات لا يتعدّل (إضافات بس)

ALTER TABLE "User" ADD COLUMN "otpChannel" TEXT NOT NULL DEFAULT 'whatsapp';

CREATE TABLE "ActionCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dealId" TEXT,
    "paramsHash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionCode_userId_action_createdAt_idx" ON "ActionCode"("userId", "action", "createdAt");
CREATE INDEX "ActionCode_userId_createdAt_idx" ON "ActionCode"("userId", "createdAt");
ALTER TABLE "ActionCode" ADD CONSTRAINT "ActionCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ActionLock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActionLock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActionLock_userId_action_key" ON "ActionLock"("userId", "action");

-- CON-03 + DEAL-03: كل موافقة/تحقق بيتسجل هنا — ما يتعدّلش وما يتمسحش
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "templateVersionId" TEXT,
    "dealId" TEXT,
    "listingId" TEXT,
    "summary" TEXT NOT NULL,
    "renderedText" TEXT,
    "sha256" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "phoneLast4" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "otpVerifiedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsentRecord_userId_acceptedAt_idx" ON "ConsentRecord"("userId", "acceptedAt");
CREATE INDEX "ConsentRecord_dealId_idx" ON "ConsentRecord"("dealId");
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER "ConsentRecord_append_only" BEFORE UPDATE OR DELETE ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- DEAL-03 بند 7: تأكيد الطرفين «حوّلت العربون» / «استلمت المبلغ»
ALTER TABLE "Deposit" ADD COLUMN "buyerSentAt" TIMESTAMP(3), ADD COLUMN "sellerReceivedAt" TIMESTAMP(3);

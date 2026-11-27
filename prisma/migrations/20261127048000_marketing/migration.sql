-- MKT-04/06/07/12/13/14: جداول وأعمدة جديدة بس (مفيش مسح ولا تعديل لأعمدة موجودة)

-- MKT-04: «فكّرني بمهلتي»
CREATE TABLE "DeadlineReminder" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "deadline" DATE NOT NULL,
    "plotCode" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "unsubToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "sent90At" TIMESTAMP(3),
    "sent30At" TIMESTAMP(3),
    "sent7At" TIMESTAMP(3),
    "source" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeadlineReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeadlineReminder_unsubToken_key" ON "DeadlineReminder"("unsubToken");
CREATE INDEX "DeadlineReminder_city_idx" ON "DeadlineReminder"("city");
CREATE INDEX "DeadlineReminder_deadline_idx" ON "DeadlineReminder"("deadline");

-- رسايل واتساب/إيميل برّه المنصة: بتتسجل هنا وبتتبعت لما المزوّد يتظبط
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");
CREATE INDEX "OutboundMessage_to_kind_createdAt_idx" ON "OutboundMessage"("to", "kind", "createdAt");

-- MKT-13: موافقة صريحة على تنبيهات طلب الشراء + رابط إيقاف
ALTER TABLE "BuyRequest" ADD COLUMN "alertConsentAt" TIMESTAMP(3), ADD COLUMN "unsubToken" TEXT, ADD COLUMN "lastAlertAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "BuyRequest_unsubToken_key" ON "BuyRequest"("unsubToken");

-- MKT-06: مكافآت الإحالة (بتستحق بس لما صفقة المُحال تتقفل)
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralReward_dealId_key" ON "ReferralReward"("dealId");
CREATE INDEX "ReferralReward_referrerId_idx" ON "ReferralReward"("referrerId");
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MKT-07: نصيب السمسار الشريك من العمولة (نسبة لكل شريك)
ALTER TABLE "User" ADD COLUMN "partnerSharePct" DECIMAL(5,2);

-- MKT-12: مصروف كل حملة في الشهر (إدخال يدوي)
CREATE TABLE "CampaignSpend" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountEgp" DECIMAL(14,2) NOT NULL,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignSpend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignSpend_channel_month_key" ON "CampaignSpend"("channel", "month");

-- MKT-14: قصص صفقات حقيقية بموافقة الطرفين
CREATE TABLE "DealStory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "buyerConsentAt" TIMESTAMP(3),
    "sellerConsentAt" TIMESTAMP(3),
    "showPlotCode" BOOLEAN NOT NULL DEFAULT false,
    "textAr" TEXT,
    "textEn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealStory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealStory_dealId_key" ON "DealStory"("dealId");
ALTER TABLE "DealStory" ADD CONSTRAINT "DealStory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

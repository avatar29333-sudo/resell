-- OPS-01: مرجع تحصيل العمولة + المطابقة الشهرية مع كشف البنك (إضافات بس)
ALTER TABLE "Commission" ADD COLUMN "paymentRef" TEXT;

CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "systemTotal" DECIMAL(14,2) NOT NULL,
    "bankTotal" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Reconciliation_month_idx" ON "Reconciliation"("month");
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

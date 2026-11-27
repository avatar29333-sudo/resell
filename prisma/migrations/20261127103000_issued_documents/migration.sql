-- TXN-01 / CON-06: سجل مرقّم لكل PDF بيطلع من المنصة (كود + بصمة + عدد صفحات) — صفحة التحقق بتقرا منه
CREATE TABLE "IssuedDocument" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dealId" TEXT,
    "contractId" TEXT,
    "templateVersion" TEXT,
    "issuedToId" TEXT,
    "copyFor" TEXT,
    "sha256" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IssuedDocument_code_key" ON "IssuedDocument"("code");
CREATE UNIQUE INDEX "IssuedDocument_seq_key" ON "IssuedDocument"("seq");
CREATE INDEX "IssuedDocument_dealId_idx" ON "IssuedDocument"("dealId");
CREATE INDEX "IssuedDocument_contractId_idx" ON "IssuedDocument"("contractId");
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_issuedToId_fkey" FOREIGN KEY ("issuedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- سجل مش بيتعدّل ولا بيتمسح
CREATE TRIGGER "IssuedDocument_append_only" BEFORE UPDATE OR DELETE ON "IssuedDocument" FOR EACH ROW EXECUTE FUNCTION resell_block_change();

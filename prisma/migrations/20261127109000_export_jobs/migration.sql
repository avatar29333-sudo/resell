-- ADM-EXP-01..03: التصدير في الخلفية، رابط لمرة واحدة لمدة ساعة — إضافة بس
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonNote" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "fileName" TEXT,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "fileCount" INTEGER,
    "tokenHash" TEXT,
    "error" TEXT,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExportJob_kind_subjectId_idx" ON "ExportJob"("kind", "subjectId");
CREATE INDEX "ExportJob_requestedById_idx" ON "ExportJob"("requestedById");
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

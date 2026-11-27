-- DOC-01: «مستند آخر» بعنوان، رفع متعدد بأجزاء (لحد 20MB)، وطلب مستند من المحامي — إضافة بس
ALTER TABLE "Document" ADD COLUMN "title" TEXT;

CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UploadSession_userId_createdAt_idx" ON "UploadSession"("userId", "createdAt");
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- أجزاء مؤقتة لحد ما الملف يكمل (بتتشال بعد التجميع)
CREATE TABLE "UploadChunk" (
    "sessionId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("sessionId", "idx")
);
ALTER TABLE "UploadChunk" ADD CONSTRAINT "UploadChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentRequest_dealId_status_idx" ON "DocumentRequest"("dealId", "status");
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ملحوظة: Prisma بيحاول يمسح فهرس Plot_boundary_gist في كل migration جديدة لأنه مش شايفه في schema.prisma. امسح السطر ده دايماً.

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'sign_in',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "LoginCode_phone_createdAt_idx" ON "LoginCode"("phone", "createdAt");

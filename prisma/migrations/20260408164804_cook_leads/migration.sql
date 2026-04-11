-- CreateEnum
CREATE TYPE "CookLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CookLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CookLeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'tilda',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CookLead_email_idx" ON "CookLead"("email");

-- CreateIndex
CREATE INDEX "CookLead_createdAt_idx" ON "CookLead"("createdAt");

-- CreateIndex
CREATE INDEX "CookLead_status_idx" ON "CookLead"("status");

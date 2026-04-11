-- CreateTable
CREATE TABLE "CookVerification" (
    "id" TEXT NOT NULL,
    "cookId" TEXT NOT NULL,
    "kitchenPhotoUrls" TEXT[],
    "healthCertUrl" TEXT NOT NULL,
    "certificateUrl" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CookVerification_cookId_key" ON "CookVerification"("cookId");

-- AddForeignKey
ALTER TABLE "CookVerification" ADD CONSTRAINT "CookVerification_cookId_fkey" FOREIGN KEY ("cookId") REFERENCES "Cook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

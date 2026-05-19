-- AlterEnum (append new values; safe for existing rows)
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_ADMIN_APPROVAL';
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PAYMENT';

-- NOTE:
-- Do not set default to a newly added enum value in the same migration transaction on Postgres,
-- otherwise shadow DB validation can fail with "unsafe use of new enum value" (P3006).
-- Default is set in a later migration after enum values are fully committed.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN     "entrance" TEXT;
ALTER TABLE "Order" ADD COLUMN     "intercom" TEXT;
ALTER TABLE "Order" ADD COLUMN     "floor" TEXT;
ALTER TABLE "Order" ADD COLUMN     "apartment" TEXT;
ALTER TABLE "Order" ADD COLUMN     "courierComment" TEXT;
ALTER TABLE "Order" ADD COLUMN     "contactPhone" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Address" ADD COLUMN "entrance" TEXT;
ALTER TABLE "Address" ADD COLUMN "intercom" TEXT;
ALTER TABLE "Address" ADD COLUMN "floor" TEXT;
ALTER TABLE "Address" ADD COLUMN "apartment" TEXT;
ALTER TABLE "Address" ADD COLUMN "contactPhone" TEXT;

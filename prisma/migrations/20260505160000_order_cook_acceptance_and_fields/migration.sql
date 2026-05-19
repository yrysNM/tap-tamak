-- AlterEnum (append; safe for existing rows)
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_COOK_ACCEPTANCE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutPhotoPath" TEXT;
ALTER TABLE "Order" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "preparationTimeMinutes" INTEGER;

-- Set default after enum values from previous migration are committed
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'AWAITING_ADMIN_APPROVAL'::"OrderStatus";

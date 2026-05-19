-- Replace OrderStatus: drop AWAITING_ADMIN_APPROVAL + PREPARING, add COOKING, map existing rows.
CREATE TYPE "OrderStatus_new" AS ENUM (
  'AWAITING_COOK_ACCEPTANCE',
  'AWAITING_PAYMENT',
  'PENDING',
  'CONFIRMED',
  'COOKING',
  'READY',
  'ON_THE_WAY',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Order"
  ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING (
    CASE ("status"::text)
      WHEN 'AWAITING_ADMIN_APPROVAL' THEN 'AWAITING_COOK_ACCEPTANCE'::"OrderStatus_new"
      WHEN 'PREPARING' THEN 'COOKING'::"OrderStatus_new"
      ELSE ("status"::text)::"OrderStatus_new"
    END
  );

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'AWAITING_COOK_ACCEPTANCE'::"OrderStatus";

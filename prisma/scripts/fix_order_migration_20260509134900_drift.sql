-- Repair dev DB after editing prisma/migrations/20260509134900_order_add_dishid/migration.sql
-- post-apply (Prisma: "migration was modified after it was applied").
--
-- 1) If an older version of this migration added "dishId" on "Order", align the table with the
--    current migration (basketId + index). Safe to run when dishId is already gone (IF EXISTS).
-- 2) Refresh the checksum Prisma stores for that migration (must match the current migration.sql).
--
-- Apply:  npx prisma db execute --file prisma/scripts/fix_order_migration_20260509134900_drift.sql
--
-- If you change migration.sql again, recompute checksum:
--   node -e "const fs=require('fs');const c=require('crypto');const b=fs.readFileSync('prisma/migrations/20260509134900_order_add_dishid/migration.sql');console.log(c.createHash('sha256').update(b).digest('hex'));"

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_dishId_fkey";
DROP INDEX IF EXISTS "Order_dishId_idx";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "dishId";

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "basketId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_basketId_idx" ON "Order"("basketId");

UPDATE "_prisma_migrations"
SET checksum = '7b261acd42d3ff044ff6ac14e662f5ce61198596f436a657a310b0be909feccc'
WHERE migration_name = '20260509134900_order_add_dishid';

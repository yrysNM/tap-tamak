-- Track kitchen start and ready instants for prep-time analytics
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cookingStartedAt" TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMPTZ(3);

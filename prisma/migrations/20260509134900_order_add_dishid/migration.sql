-- Store the checkout basket/cart id on new orders.
-- Existing orders cannot be backfilled reliably because carts are deleted after checkout.
ALTER TABLE "Order" ADD COLUMN "basketId" TEXT;

CREATE INDEX "Order_basketId_idx" ON "Order"("basketId");

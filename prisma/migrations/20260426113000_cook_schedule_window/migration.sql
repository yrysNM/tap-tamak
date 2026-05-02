-- Add cook work schedule window (UTC timestamps)
ALTER TABLE "Cook"
ADD COLUMN "workStartAt" TIMESTAMP(3),
ADD COLUMN "workEndAt" TIMESTAMP(3);

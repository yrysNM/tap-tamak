-- Store cook schedule as timezone-aware UTC instants
ALTER TABLE "Cook"
ALTER COLUMN "workStartAt" TYPE TIMESTAMPTZ(3)
USING CASE
  WHEN "workStartAt" IS NULL THEN NULL
  ELSE "workStartAt" AT TIME ZONE 'UTC'
END,
ALTER COLUMN "workEndAt" TYPE TIMESTAMPTZ(3)
USING CASE
  WHEN "workEndAt" IS NULL THEN NULL
  ELSE "workEndAt" AT TIME ZONE 'UTC'
END;

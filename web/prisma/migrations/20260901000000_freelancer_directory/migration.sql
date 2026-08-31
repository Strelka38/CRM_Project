CREATE TABLE IF NOT EXISTS "Freelancer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Freelancer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Freelancer_name_idx" ON "Freelancer"("name");
CREATE INDEX IF NOT EXISTS "Freelancer_active_idx" ON "Freelancer"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "Freelancer_name_lower_key" ON "Freelancer"(lower(btrim("name")));

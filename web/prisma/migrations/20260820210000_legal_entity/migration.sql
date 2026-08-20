-- LegalEntity lives beside CatalogOwner (warehouse tags SHM/DK/NE), not instead of them.

CREATE TABLE IF NOT EXISTS "LegalEntity" (
    "id" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "inn" TEXT NOT NULL,
    "ogrnip" TEXT NOT NULL DEFAULT '',
    "legalAddress" TEXT NOT NULL DEFAULT '',
    "actualAddress" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "catalogOwner" "CatalogOwner",
    "signatoryName" TEXT NOT NULL DEFAULT '',
    "sealPath" TEXT,
    "signaturePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntity_inn_key" ON "LegalEntity"("inn");
CREATE INDEX IF NOT EXISTS "LegalEntity_catalogOwner_idx" ON "LegalEntity"("catalogOwner");
CREATE INDEX IF NOT EXISTS "LegalEntity_active_idx" ON "LegalEntity"("active");

CREATE TABLE IF NOT EXISTS "LegalEntityBankAccount" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL,
    "corrAccount" TEXT NOT NULL DEFAULT '',
    "bik" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalEntityBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntityBankAccount_legalEntityId_account_key"
  ON "LegalEntityBankAccount"("legalEntityId", "account");
CREATE INDEX IF NOT EXISTS "LegalEntityBankAccount_legalEntityId_idx"
  ON "LegalEntityBankAccount"("legalEntityId");

DO $$ BEGIN
  ALTER TABLE "LegalEntityBankAccount"
    ADD CONSTRAINT "LegalEntityBankAccount_legalEntityId_fkey"
    FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verifica in due passaggi (TOTP) e passkey
ALTER TABLE "users"
  ADD COLUMN "totpSecret" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastStep" INTEGER,
  ADD COLUMN "totpRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "passkeys" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "passkeys_credentialId_key" ON "passkeys"("credentialId");
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webauthn_challenges" (
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "userId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("challenge")
);
CREATE INDEX "webauthn_challenges_expiresAt_idx" ON "webauthn_challenges"("expiresAt");

-- Drop 1:1 unique on api_credentials.user_id (multi-credential per user)
DROP INDEX IF EXISTS "api_credentials_user_id_key";

-- New columns for credential lifecycle
ALTER TABLE "api_credentials" ADD COLUMN IF NOT EXISTS "label" TEXT DEFAULT 'default';
ALTER TABLE "api_credentials" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "api_credentials_user_id_idx" ON "api_credentials"("user_id");

-- Platform settings singleton (JSON config)
CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- System logs
CREATE TYPE "SystemLogType" AS ENUM ('login', 'api_request', 'call_error');

CREATE TABLE IF NOT EXISTS "system_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "SystemLogType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_logs_created_at_idx" ON "system_logs"("created_at");
CREATE INDEX IF NOT EXISTS "system_logs_type_idx" ON "system_logs"("type");
CREATE INDEX IF NOT EXISTS "system_logs_user_id_idx" ON "system_logs"("user_id");

ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

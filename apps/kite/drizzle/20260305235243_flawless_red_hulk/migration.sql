CREATE TYPE "upload_status" AS ENUM('pending', 'uploading', 'processing', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "request_status" AS ENUM('open', 'fulfilled', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "share_status" AS ENUM('active', 'expired', 'deleted');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"is_anonymous" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"fingerprint" text NOT NULL,
	"filename" text,
	"relative_path" text,
	"size" bigint NOT NULL,
	"mime_type" text,
	"chunk_size" integer,
	"uploaded_bytes" bigint DEFAULT 0 NOT NULL,
	"status" "upload_status" DEFAULT 'pending'::"upload_status" NOT NULL,
	"high_sensitivity" boolean DEFAULT false NOT NULL,
	"storage_provider" text,
	"storage_path" text,
	"hash" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "share_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text UNIQUE,
	"title" text,
	"message" text,
	"password_hash" text,
	"requester_name" text,
	"requester_email" text,
	"hide_requester_email" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"status" "request_status" DEFAULT 'open'::"request_status" NOT NULL,
	"max_submissions" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"title" text,
	"password_hash" text,
	"password_protected" boolean DEFAULT false NOT NULL,
	"high_sensitivity" boolean DEFAULT false NOT NULL,
	"message" text,
	"hide_message_behind_password" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"status" "share_status" DEFAULT 'active'::"share_status" NOT NULL,
	"source_request_id" uuid,
	"created_by" text,
	"max_downloads" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"last_downloaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "share_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"share_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_upload_unique_pair" UNIQUE("share_id","upload_id")
);
--> statement-breakpoint
CREATE TABLE "token_store" (
	"token" text PRIMARY KEY,
	"subject" text,
	"purpose" text,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "uploads_uploadedBy_idx" ON "uploads" ("uploaded_by");--> statement-breakpoint
CREATE INDEX "uploads_fingerprint_idx" ON "uploads" ("fingerprint");--> statement-breakpoint
CREATE INDEX "uploads_highSensitivity_idx" ON "uploads" ("high_sensitivity");--> statement-breakpoint
CREATE INDEX "uploads_status_idx" ON "uploads" ("status");--> statement-breakpoint
CREATE INDEX "uploads_createdAt_idx" ON "uploads" ("created_at");--> statement-breakpoint
CREATE INDEX "share_requests_code_idx" ON "share_requests" ("code");--> statement-breakpoint
CREATE INDEX "share_requests_status_idx" ON "share_requests" ("status");--> statement-breakpoint
CREATE INDEX "share_requests_expiresAt_idx" ON "share_requests" ("expires_at");--> statement-breakpoint
CREATE INDEX "shares_code_idx" ON "shares" ("code");--> statement-breakpoint
CREATE INDEX "shares_expiresAt_idx" ON "shares" ("expires_at");--> statement-breakpoint
CREATE INDEX "shares_createdBy_idx" ON "shares" ("created_by");--> statement-breakpoint
CREATE INDEX "shares_sourceRequestId_idx" ON "shares" ("source_request_id");--> statement-breakpoint
CREATE INDEX "share_upload_shareId_idx" ON "share_upload" ("share_id");--> statement-breakpoint
CREATE INDEX "share_upload_uploadId_idx" ON "share_upload" ("upload_id");--> statement-breakpoint
CREATE INDEX "token_store_expiresAt_idx" ON "token_store" ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" ("resource_type","resource_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share_requests" ADD CONSTRAINT "share_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_source_request_id_share_requests_id_fkey" FOREIGN KEY ("source_request_id") REFERENCES "share_requests"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "share_upload" ADD CONSTRAINT "share_upload_share_id_shares_id_fkey" FOREIGN KEY ("share_id") REFERENCES "shares"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share_upload" ADD CONSTRAINT "share_upload_upload_id_uploads_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT;
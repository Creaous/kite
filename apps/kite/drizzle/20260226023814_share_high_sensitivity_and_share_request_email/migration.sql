ALTER TABLE "uploads" ADD COLUMN "high_sensitivity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "share_requests" ADD COLUMN "hide_requester_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "high_sensitivity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "uploads_highSensitivity_idx" ON "uploads" ("high_sensitivity");
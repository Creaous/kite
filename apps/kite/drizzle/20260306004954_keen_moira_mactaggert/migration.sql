CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_profile_onboardingCompleted_idx" ON "user_profile" ("onboarding_completed");--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
-- Campaign attribution for off-site posts and ads (see lib/campaigns.ts).
-- Nullable with no default: null means "arrived organically or before this
-- existed", which is a different fact from any tag value.
ALTER TABLE "User" ADD COLUMN "signupSource" TEXT;

-- The only read is a groupBy over non-null values (getCampaignResults), and
-- the column is null for the overwhelming majority of rows, so a partial
-- index is both much smaller and all that query can use.
CREATE INDEX "User_signupSource_idx" ON "User"("signupSource") WHERE "signupSource" IS NOT NULL;

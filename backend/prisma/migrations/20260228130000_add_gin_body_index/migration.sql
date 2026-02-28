-- Enable pg_trgm extension for case-insensitive text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on body for fast ILIKE/LIKE searches
CREATE INDEX IF NOT EXISTS "Message_body_gin_idx" ON "Message" USING gin ("body" gin_trgm_ops);

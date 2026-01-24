-- ============================================================================
-- ADD AVATAR COLUMN TO USERS TABLE
-- ============================================================================
-- Store user avatar URL (from Supabase Storage)

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Index for avatar lookups (optional, for future features)
CREATE INDEX IF NOT EXISTS idx_users_avatar_url ON users(avatar_url) WHERE avatar_url IS NOT NULL;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'avatar_url';

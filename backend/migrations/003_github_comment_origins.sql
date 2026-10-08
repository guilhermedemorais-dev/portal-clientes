ALTER TABLE posts ADD COLUMN IF NOT EXISTS origin_key text;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts ADD CONSTRAINT posts_status_check CHECK(status IN ('pending','published','rejected','unpublished'));
CREATE UNIQUE INDEX IF NOT EXISTS posts_origin_key_unique ON posts(origin_key) WHERE origin_key IS NOT NULL;

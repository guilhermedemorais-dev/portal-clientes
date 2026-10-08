DROP INDEX IF EXISTS posts_origin_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS posts_project_origin_key_unique ON posts(project_id,origin_key) WHERE origin_key IS NOT NULL;

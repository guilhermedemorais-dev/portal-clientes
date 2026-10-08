CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, github_id text NOT NULL UNIQUE, login text NOT NULL, display_name text NOT NULL, avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id text NOT NULL, role text NOT NULL CHECK (role IN ('owner','client')),
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL, author_id text NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS post_likes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS attention_flags (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL, owner_id text NOT NULL REFERENCES users(id),
  mime text NOT NULL, size_bytes bigint NOT NULL, sha256 text NOT NULL, description text NOT NULL DEFAULT '', storage_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY, actor_id text, project_id text, action text NOT NULL, resource_id text,
  request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS issue_sync (
  id bigserial PRIMARY KEY, project_id text NOT NULL, issue_number integer NOT NULL CHECK (issue_number > 0),
  source_key text NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 10000), approved_by text NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent')), github_comment_id text,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(project_id,source_key)
);
CREATE INDEX IF NOT EXISTS posts_project_created ON posts(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_created ON audit_events(created_at DESC);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK(status IN ('pending','published','rejected'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS module_title text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS task_number text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS issue_url text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS attachment_ids uuid[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL, issue_number integer NOT NULL CHECK(issue_number>0),
  issue_url text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '', stage text NOT NULL,
  status text NOT NULL CHECK(status IN ('backlog','in_progress','blocked','done')), progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,issue_number)
);
CREATE INDEX IF NOT EXISTS comments_post_created ON post_comments(post_id,created_at);

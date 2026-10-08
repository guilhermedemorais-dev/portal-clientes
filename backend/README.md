# Portal Cliente reference API

Reference backend for a **single project installation**. It is a runnable Node 22, TypeScript, Fastify and PostgreSQL service. Each client should receive a separately configured API/database/storage boundary; `projectId` ACL checks are defense in depth, not a recommendation to operate a shared multi-tenant service.

## Local run

```sh
cp .env.example .env
# Start only this directory's local PostgreSQL service
docker compose up -d postgres
npm install
set -a; . ./.env; set +a
npm run db:migrate
npm run dev
```

Then use `GET /live` and `GET /ready`. Set a long random `METRICS_BEARER_TOKEN` and call `GET /metrics` with that bearer; without it, metrics are unavailable. Restrict its ingress to your monitoring network. Build and unit/HTTP tests: `npm run build && npm test`.

## GitHub sign-in setup

Create a GitHub OAuth App with callback exactly `https://API_HOST/v1/auth/github/callback`. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` only in the API runtime secret manager. Set `FRONTEND_CALLBACK_URL` to the fixed deployed static frontend callback and enumerate its exact origin in `FRONTEND_ORIGINS`. The server does not accept a callback URL from the browser.

Before navigation, the static client generates a random 43+ character verifier and its SHA-256 base64url challenge; retain the verifier in `sessionStorage`. Navigate to `/v1/auth/github?challenge=<challenge>`. OAuth uses independent server-side `state` and provider PKCE. The callback redirects only to the configured frontend callback with a 60-second, one-use grant and `Referrer-Policy: no-referrer`. The frontend POSTs `{grant, verifier}` to `/v1/auth/exchange`, removes the query string immediately, and holds the returned opaque bearer **in memory only**. Never put OAuth secrets, provider access tokens, or bearer tokens in URLs, localStorage, analytics, or logs. Reload asks the user to sign in again. This intentionally avoids cross-site cookies and persistent refresh tokens.

`ACCESS_MAP_JSON` bootstraps numeric GitHub account IDs to `owner` or `client` for this configured `PROJECT_ID`, for example `{"1234567":"owner","7654321":"client"}`. Manage ongoing membership through the owner API. The bootstrap map does not override a revoked database user. This is an allowlist, not an invitation flow.

## API behavior

The versioned OpenAPI contract is `openapi.yaml`. All `/v1/projects/{projectId}` endpoints require a live bearer and active exact-project membership. Client-submitted posts are `pending`; the feed returns each post's status so the owner can triage them, and owners publish/reject via `PATCH .../posts/{postId}`. Published checkpoints can carry `moduleTitle`, `taskNumber`, `issueUrl`, and attachment IDs. The dashboard is sourced from owner-published task rows; each task Issue URL must match the configured GitHub repository. Its `progress` is a simple completed-task ratio (`done / eligible`), reports the numerator, denominator, formula, and source, and does not estimate time or percentage complete within partially done tasks. Persistent comments are attached to a post. Like and attention POST operations are idempotent; DELETE removes the current user's reaction.

Uploads accept JPEG, PNG, WebP, and GIF only. The API verifies magic bytes, rejects SVG, caps file size at `MAX_UPLOAD_BYTES`, and sets the request limit to that cap plus bounded multipart overhead, so configured uploads above 1 MB work. It generates opaque filenames and stores them outside the web root with restrictive permissions; reads require active project membership and post visibility. Each upload requires `postId` and a short `description`, and attaches transactionally to the caller's own pending feedback post (or an owner post); no unlinked uploads are accepted. Feed metadata is safe to render, but image retrieval must use the authenticated API URL and bearer, then create a revocable browser blob URL. A production deployment should mount `STORAGE_DIR` on private durable storage and configure backups/access monitoring.

GitHub Issue import is owner-only and accepts only `{issueNumber, commentId}`. With `GITHUB_REPOSITORY=owner/repo` and a read-only token in `GITHUB_TOKEN`, the server fetches that exact Issue comment and its Issue metadata. It imports only when the comment body contains the literal marker `<!-- portal:client-approved -->`; the marker is stripped before display. It never writes comments to GitHub. A stable origin key based on repository, Issue number, and comment ID plus a project-scoped unique index makes repeated syncs update the same published post. The post includes Issue URL, Issue title as module title, and Issue number as task number. If the marker disappears or GitHub returns 404 for a previously imported comment, the post becomes `unpublished`; the post and its client replies are retained. A 404 for a comment that was never imported returns 404. Missing GitHub credentials returns 503. Use a GitHub token with only read access to Issues; import success is confirmed by HTTP 201/200. The legacy `issue_sync` table is retained for migration compatibility and is no longer used by this endpoint.

## Observability and privacy

Fastify emits structured Pino JSON with request IDs. URL, authorization and cookie fields are redacted; request/response bodies are not logged. `/metrics` exposes HTTP duration/response histograms, audit action, upload outcome, and GitHub import outcome counters. Labels are finite normalized method/status or fixed action/result values, without project, user, token, or content labels. `/live` checks process liveness; `/ready` checks PostgreSQL. `audit_events` records authentication, publishing, access grants/revocation, post/comment operations and private-upload reads, carrying request ID and actor/project identifiers but no content or credentials. Treat audit storage as sensitive operational data and apply retention controls.

## Limits before production

- No live OAuth app, API host, TLS/reverse-proxy trust configuration, GitHub repository/token, static-site deployment, or production PostgreSQL/storage was configured or exercised here.
- Access bearer sessions and one-time grants live in process memory. Multiple API replicas require a shared session/grant store, or deployment must remain single replica; restart invalidates all sessions.
- Local filesystem storage is a development adapter. Use private object storage in production, with encryption, backup, malware/image re-encoding pipeline, and quota policy. Magic-byte checks are not full decoder/re-encoder validation.
- Metrics are process-local counters, not durable and reset on restart. `/metrics` requires a dedicated `METRICS_BEARER_TOKEN`; also restrict ingress to the monitoring network. Unknown HTTP methods collapse to `OTHER`; histogram labels use normalized methods and bounded status codes. OAuth grants, state entries, and bearer sessions are pruned by expiry and have hard store caps.
- Configure trusted proxy handling and TLS at the selected host. Do not enable arbitrary `trustProxy` values. Configure production rate-limit storage if running multiple replicas.
- The GitHub sync reads the source comment on demand. Configure the GitHub token with read-only Issues access; no GitHub comment write permission is used.

Schema changes added for imported Issue posts: `003_github_comment_origins.sql` adds a stable `origin_key` and `unpublished` lifecycle state; `004_project_scoped_post_origins.sql` enforces origin uniqueness within each project.


Schema changes added for imported Issue posts: `003_github_comment_origins.sql` adds a stable `origin_key` and `unpublished` lifecycle state; `004_project_scoped_post_origins.sql` enforces origin uniqueness within each project.

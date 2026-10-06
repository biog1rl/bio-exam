# External Integrations

**Analysis Date:** 2026-07-27
**Analyzed Commit:** `29563ff`

## APIs & External Services

**Application API:**
- Express REST API - owns authentication, users, RBAC, groups, tests, search, settings, sidebar, and document assets through `app/server/src/routes/index.ts`.
  - SDK/Client: browser `fetch` and SWR helpers in `app/web/lib/api-fetch.ts`, `app/web/lib/fetcher.ts`, and `app/web/lib/swr-config.ts`.
  - Routing: browser requests stay same-origin; `app/web/next.config.ts` rewrites `/api/:path*` and `/uploads/:path*` to `API_ORIGIN`.
  - Auth: HttpOnly JWT and refresh-token cookies created by `app/server/src/routes/auth/login.ts` and rotated by `app/server/src/routes/auth/refresh.ts`.

**Object Storage:**
- Supabase Storage - stores question Markdown/JSON, images, avatars, and downloadable archives through `app/server/src/services/storage/storage.ts`.
  - SDK/Client: `@supabase/supabase-js` 2.93.1 from `app/server/package.json`.
  - Auth: `SUPABASE_URL` and server-only `SUPABASE_SERVICE_KEY` in `app/server/src/services/storage/storage.ts`.
  - Bucket: `SUPABASE_STORAGE_BUCKET`, defaulting to `main` in `app/server/src/services/storage/storage.ts`.
  - Access: public URLs and one-hour signed URLs are produced by `app/server/src/services/storage/storage.ts`; browser-side signed URLs are cached for 50 minutes by `app/web/lib/image-signed-url-cache.ts`.

**Embedded Media:**
- X/Twitter widgets - rich-editor tweet embeds load `https://platform.twitter.com/widgets.js` in `app/web/components/editor/nodes/embeds/tweet-node.tsx`.
  - SDK/Client: remotely loaded widget script in `app/web/components/editor/nodes/embeds/tweet-node.tsx`.
  - Auth: none in `app/web/components/editor/nodes/embeds/tweet-node.tsx`.
- YouTube privacy-enhanced embeds - rich-editor video nodes render `youtube-nocookie.com` iframes in `app/web/components/editor/nodes/embeds/youtube-node.tsx`.
  - SDK/Client: browser iframe in `app/web/components/editor/nodes/embeds/youtube-node.tsx`.
  - Auth: none in `app/web/components/editor/nodes/embeds/youtube-node.tsx`.
- Google Fonts - Nunito Sans, Lora, and Fira Code are declared through `next/font/google` in `app/web/config/fonts.ts`.
  - SDK/Client: Next.js font optimization in `app/web/config/fonts.ts`.
  - Auth: none in `app/web/config/fonts.ts`.

**Development Registries:**
- shadcn-compatible component registries are configured for scaffolding in `app/web/components.json`.
  - SDK/Client: shadcn registry configuration only; no runtime client is present in `app/web/components.json`.
  - Auth: none declared in `app/web/components.json`.

## Data Storage

**Databases:**
- PostgreSQL - primary relational store, with schema definitions in `app/server/src/db/schema.ts` and SQL migrations in `app/server/drizzle/`.
  - Connection: `DATABASE_URL` read by `app/server/src/db/index.ts`, `app/server/drizzle.config.ts`, `app/server/src/scripts/apply-migration.ts`, and `app/web/lib/env/server.ts`.
  - Client: `pg` 8.16.3 pooled connections and Drizzle ORM 0.45.1 in `app/server/src/db/index.ts`.
  - Next.js access: `app/web/lib/auth/server/getMeData.ts` maintains a server-only `pg` pool for `/api/auth/me`; it reads user, role, and RBAC grant tables directly.
  - SSL: `PG_FORCE_SSL=1` enables SSL explicitly; `app/server/src/db/index.ts` and `app/web/lib/auth/server/getMeData.ts` also enable it for `*.supabase.com` hosts unless the connection string supplies its own SSL parameter.

**File Storage:**
- Supabase Storage is the configured durable object store through `app/server/src/services/storage/storage.ts`.
- Local filesystem fallback writes under `app/web/public/uploads/` through `app/server/src/routes/docs/assets.ts`, `app/server/src/routes/users/avatar.ts`, `app/server/src/routes/tests/index.ts`, and fallback branches in `app/server/src/services/storage/storage.ts`.
- The Express app serves `/uploads` only outside production in `app/server/src/app.ts`; production file persistence therefore depends on Supabase Storage rather than the local fallback.
- Vercel avatar staging uses `/tmp` when `VERCEL` is set or production mode is active in `app/server/src/routes/users/avatar.ts`.

**Caching:**
- External/shared cache: Not detected in `package.json`, `app/web/package.json`, or `app/server/package.json`; no Redis or managed cache SDK is present.
- Client request caching: SWR 2.3.3 configured in `app/web/lib/swr-config.ts`.
- Signed URL caching: process-local `Map` with a 50-minute TTL in `app/web/lib/image-signed-url-cache.ts`.
- Login rate-limit state: process-local `Map` in `app/server/src/middleware/rateLimiter.ts`; it is not shared across Vercel function instances.

## Authentication & Identity

**Auth Provider:**
- Custom database-backed identity; no external OAuth, OIDC, SAML, NextAuth provider, or managed identity SDK is wired in `app/server/src/routes/auth/`, `app/web/lib/auth/`, or the package manifests.
  - Implementation: passwords are checked with `bcryptjs` in `app/server/src/routes/auth/login.ts`.
  - Access sessions: JWTs signed with `AUTH_JWT_SECRET` are stored in an HttpOnly, SameSite=Lax cookie by `app/server/src/middleware/auth/session.ts`.
  - Refresh sessions: opaque refresh tokens are hashed and stored in PostgreSQL, then rotated by `app/server/src/routes/auth/refresh.ts` and revoked by `app/server/src/routes/auth/logout.ts`.
  - Authorization: role defaults come from `packages/rbac/src/`; database overrides come from `rbac_role_grants` and `rbac_user_grants` through `app/server/src/services/rbac/rbac.ts` and `app/web/lib/auth/server/getMeData.ts`.
  - Production validation: `DATABASE_URL` and a non-default `AUTH_JWT_SECRET` are enforced by `app/server/src/config/env.ts` and `app/server/src/config/auth.ts`.
  - Legacy settings: optional `NEXTAUTH_*` keys remain in the validation schema at `app/web/lib/env/server.ts`, but no NextAuth dependency or provider implementation exists in `app/web/package.json`.

## Monitoring & Observability

**Error Tracking:**
- External error tracking: Not detected in `package.json`, `app/web/package.json`, `app/server/package.json`, or source imports under `app/`; no Sentry or equivalent SDK is integrated.
- API errors are normalized by the final Express error handler in `app/server/src/app.ts`; unexpected production errors return a generic message.

**Logs:**
- Pino structured logging with configurable `LOG_LEVEL` is defined in `app/server/src/lib/logger.ts`.
- HTTP requests receive or generate `x-request-id` values through `app/server/src/middleware/requestId.ts` and `app/server/src/lib/logger.ts`.
- Automatic request logging is disabled in `app/server/src/lib/logger.ts`; request failures are logged with method, path, request ID, and operational-error status by `app/server/src/app.ts`.
- Environment and database diagnostic logging is opt-in through `DEBUG_ENV=1` in `app/server/src/config/env.ts` and `app/server/src/db/index.ts`; DSNs are redacted by `safeDsn` in `app/server/src/config/env.ts`.
- Runtime log collection is delegated to the hosting environment defined by `app/server/vercel.json`; no separate log exporter is configured in `app/server/package.json`.

## CI/CD & Deployment

**Hosting:**
- Vercel hosts the Next.js frontend as a project rooted at `app/web`, configured by `app/web/vercel.json`.
- Vercel hosts the Express API as a Node serverless function rooted at `app/server`, configured by `app/server/vercel.json` and `app/server/api/index.ts`.
- The API function is allocated 1024 MB and a 30-second maximum duration in `app/server/vercel.json`.
- Frontend-to-API connectivity is provided by the `API_ORIGIN` rewrite contract in `app/web/next.config.ts`.

**CI Pipeline:**
- Dedicated CI service: Not detected; no `.github/` workflow directory exists, and root automation is limited to scripts in `package.json` and the task graph in `turbo.json`.
- Frontend deployment can be invoked with the `deploy` script in `app/web/package.json`, which formats, lints, and calls `vercel --prod`.
- Vercel installs dependencies with Corepack/Yarn and builds `@bio-exam/rbac` before each consumer, as defined in `app/web/vercel.json`, `app/server/vercel.json`, and `app/server/vercel-build.cjs`.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - mandatory for both application projects through `app/server/src/config/env.ts` and `app/web/lib/env/server.ts`.
- `AUTH_JWT_SECRET` - mandatory and required to differ from the development default in production through `app/server/src/config/auth.ts`; also required by `app/web/lib/env/server.ts`.
- `API_ORIGIN` - required for frontend `/api` and `/uploads` rewrites in `app/web/next.config.ts`; without it, the rewrite set is empty.
- `ALLOWED_ORIGIN` - production CORS allowlist read by `app/server/src/app.ts`; an empty production list rejects browser-origin requests.
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` - required for durable Supabase object operations in `app/server/src/services/storage/storage.ts`.
- `SUPABASE_STORAGE_BUCKET` - optional bucket override; defaults to `main` in `app/server/src/services/storage/storage.ts`.
- `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE_DAYS`, `ACCESS_TOKEN_EXPIRES_SEC`, and `REFRESH_TOKEN_EXPIRES_DAYS` - optional session controls read by `app/server/src/config/auth.ts`, `app/server/src/routes/auth/login.ts`, and `app/server/src/routes/auth/refresh.ts`.
- `APP_ORIGIN` or `NEXT_PUBLIC_APP_ORIGIN` - optional absolute-URL fallback in `app/web/lib/http/absoluteUrl.ts`.
- PostgreSQL tuning settings `PG_FORCE_SSL`, `PG_POOL_MAX`, `PG_MAX_USES`, `PG_CONNECTION_TIMEOUT_MS`, `PG_QUERY_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`, and `PG_KEEPALIVE_DELAY_MS` are consumed by `app/server/src/db/index.ts` and `app/web/lib/auth/server/getMeData.ts`.
- Operational toggles `AUTH_SESSION_ENFORCE_DB`, `RBAC_DB_FAIL_OPEN`, `RBAC_USE_DB_OVERRIDES`, `DB_QUERY_RETRY`, `JSON_BODY_LIMIT`, `LOG_LEVEL`, and `DEBUG_ENV` are consumed in `app/server/src/`.
- Bootstrap/admin credentials are feature-specific: `ADMIN_BOOTSTRAP_LOGIN`, `ADMIN_BOOTSTRAP_PASSWORD`, and `ADMIN_BOOTSTRAP_PASSWORD_HASH` in `app/server/src/scripts/bootstrap-admin.ts`; `ADMIN_LOGIN`, `ADMIN_PASSWORD`, and `ADMIN_PASSWORD_HASH` in `app/server/src/middleware/auth/basic-admin.ts`.

**Secrets location:**
- Local API secrets belong in the ignored `app/server/.env`, loaded by `app/server/src/config/env.ts`; the file exists but its contents are intentionally not read or recorded.
- Local frontend/server-rendering secrets belong in the ignored `app/web/.env`; the file exists but its contents are intentionally not read or recorded.
- Production secrets are configured in each Vercel project's environment settings; `app/server/api/index.ts` explicitly reports a missing `DATABASE_URL` as a Vercel configuration error.
- Never expose `SUPABASE_SERVICE_KEY`, `AUTH_JWT_SECRET`, database credentials, password hashes, or bootstrap passwords to browser-prefixed variables; each is consumed only by server code under `app/server/` or `app/web/lib/env/server.ts`.

## Webhooks & Callbacks

**Incoming:**
- Webhook endpoints: None detected in the route tree rooted at `app/server/src/routes/index.ts`.
- The `callbackUrl` values used by `app/web/components/auth/AuthGuard.tsx` and `app/web/lib/auth/loginRedirect.ts` are internal post-login navigation targets, not external callbacks.

**Outgoing:**
- Outgoing webhooks: None detected in server source under `app/server/src/`.
- Outbound service calls are limited to Supabase Storage operations in `app/server/src/services/storage/storage.ts` and browser-loaded media/font resources declared in `app/web/components/editor/nodes/embeds/` and `app/web/config/fonts.ts`.

---

*Integration audit: 2026-07-27*

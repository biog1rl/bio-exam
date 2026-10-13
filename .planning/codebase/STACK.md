# Technology Stack

**Analysis Date:** 2026-07-27
**Analyzed Commit:** `29563ff`

## Languages

**Primary:**
- TypeScript 5.9.3 - Express API, database layer, scripts, and Vercel function entry point under `app/server/src/` and `app/server/api/index.ts`; version declared in `app/server/package.json`.
- TypeScript 5.6.3 - Next.js application under `app/web/` and shared RBAC package under `packages/rbac/src/`; versions declared in `app/web/package.json` and `packages/rbac/package.json`.
- TSX - React Server and Client Components under `app/web/app/` and reusable UI under `app/web/components/`; the JSX mode is configured in `app/web/tsconfig.json`.

**Secondary:**
- SQL - Drizzle-managed PostgreSQL migrations under `app/server/drizzle/*.sql`.
- CSS - Tailwind CSS entry point and global styles in `app/web/styles/globals.css`.
- MDX/Markdown - Content pages supported by `@next/mdx` through `app/web/next.config.ts`.
- CommonJS JavaScript - Vercel build orchestration in `app/server/vercel-build.cjs`.

## Runtime

**Environment:**
- Node.js 24 - pinned by `.nvmrc` and `app/web/.nvmrc`, and required by `app/server/package.json`.
- The inspected development installation runs Node.js 24.17.0; the repository contract remains the major version `24` in `.nvmrc`.
- Browser runtime - React client components and browser state live under `app/web/components/` and `app/web/store/`.

**Package Manager:**
- Yarn 4.12.0 - declared in `package.json`, vendored at `.yarn/releases/yarn-4.12.0.cjs`, and configured by `.yarnrc.yml`.
- Lockfile: present at `yarn.lock`.
- A tracked npm lockfile also exists at `package-lock.json`, but project scripts, Vercel install commands, and the `packageManager` field all select Yarn; use `yarn.lock` as the operational dependency lock.
- Workspace layout: `app/web`, `app/server`, and `packages/*`, declared in `package.json`.

## Frameworks

**Core:**
- Next.js 16.2.1 - App Router frontend, server rendering, route handlers, proxy-based route protection, and MDX support in `app/web/app/`, `app/web/proxy.ts`, and `app/web/next.config.ts`.
- React 19.2.2 / React DOM 19.2.2 - UI runtime for `app/web/components/` and `app/web/app/`, pinned in `app/web/package.json`.
- Express 4.19.2 - REST API and middleware pipeline assembled in `app/server/src/app.ts` and started locally by `app/server/src/index.ts`.
- Drizzle ORM 0.45.1 - typed PostgreSQL schema and queries in `app/server/src/db/schema.ts`, `app/server/src/db/index.ts`, and `app/server/src/routes/`.
- Tailwind CSS 4.1.13 - styling toolchain configured by the `postcss` section of `app/web/package.json` and consumed from `app/web/styles/globals.css`.
- MDX 3.1.0 / `@next/mdx` 16.2.1 - Markdown and MDX page compilation configured in `app/web/next.config.ts`.

**Testing:**
- Node.js `node:assert/strict` - direct assertion style in files such as `app/server/src/lib/tests/scoring.test.ts` and `app/web/lib/auth/loginRedirect.test.ts`.
- Dedicated test runner: Not detected; `app/web/package.json`, `app/server/package.json`, and root `package.json` do not define a `test` script or Jest/Vitest dependency.
- Coverage tooling: Not detected in `package.json`, `app/web/package.json`, or `app/server/package.json`.

**Build/Dev:**
- Turborepo 2.9.8 - workspace build, development, start, lint, and type-check task graph in `turbo.json` and root `package.json`.
- Next.js Turbopack - frontend development through `next dev --turbopack` in `app/web/package.json`.
- TypeScript compiler - emits the Express server to `app/server/dist/` using `app/server/tsconfig.json`; type-checks the web application using `app/web/tsconfig.json`.
- `tsx` 4.20.6 - watches the API and runs migrations, seeds, and administration scripts from `app/server/package.json`.
- `tsup` 8.5.0 - emits ESM, CommonJS, and declarations for `packages/rbac/src/index.ts`, configured in `packages/rbac/package.json`.
- Drizzle Kit 0.31.5 - generates migrations from `app/server/src/db/schema.ts` using `app/server/drizzle.config.ts`.
- Vercel build tooling - `app/server/vercel-build.cjs`, `app/server/vercel.json`, and `app/web/vercel.json` define package installation and production builds.

## Key Dependencies

**Critical:**
- `pg` 8.16.3 - PostgreSQL pools for the API in `app/server/src/db/index.ts` and the Next.js `/api/auth/me` route in `app/web/lib/auth/server/getMeData.ts`.
- `@supabase/supabase-js` 2.93.1 - server-side object-storage client in `app/server/src/services/storage/storage.ts`.
- `zod` 3.24.3 - request and environment validation, including `app/web/lib/env/server.ts` and server schemas under `app/server/src/schemas/`.
- `jsonwebtoken` 9.0.2 and `bcryptjs` 3.0.2 - custom JWT session and password authentication in `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/refresh.ts`, and `app/server/src/middleware/auth/session.ts`.
- `@bio-exam/rbac` workspace package - shared role and permission definitions consumed by `app/server/src/services/rbac/rbac.ts` and `app/web/lib/auth/server/getMeData.ts`; implementation starts at `packages/rbac/src/index.ts`.
- Lexical 0.38.1 family - rich question/content editor implemented under `app/web/components/editor/`; dependencies are declared in `app/web/package.json`.
- SWR 2.3.3 and Zustand 5.0.3 - client data fetching/cache and local UI state in `app/web/lib/swr-config.ts` and `app/web/store/`.

**Infrastructure:**
- `@vercel/node` 3.0.22 - type contract for the serverless API entry at `app/server/api/index.ts`.
- Pino 10.0.0 / `pino-http` 11.0.0 - structured application and request logging in `app/server/src/lib/logger.ts`.
- Multer 2.0.2, Sharp 0.34.5, and Archiver 7.0.1 - upload ingestion, image processing, and archive creation in `app/server/src/routes/users/avatar.ts`, `app/server/src/routes/docs/assets.ts`, and `app/server/src/services/storage/storage.ts`.
- Helmet 8.1.0 and CORS 2.8.5 - HTTP security headers and browser-origin policy in `app/server/src/app.ts`.
- `dotenv` 16.4.5 - local server environment loading in `app/server/src/config/env.ts`.
- Radix UI packages and `lucide-react` - component primitives and icons used throughout `app/web/components/`, declared in `app/web/package.json`.

## Configuration

**Environment:**
- Load API environment settings through `app/server/src/config/env.ts`; it selects the first available local `.env` candidate and validates `DATABASE_URL` and `AUTH_JWT_SECRET` in production.
- Validate Next.js server-only settings with Zod in `app/web/lib/env/server.ts`; `DATABASE_URL` and `AUTH_JWT_SECRET` are required there because `app/web/lib/auth/server/getMeData.ts` verifies JWTs and queries PostgreSQL directly.
- Route browser `/api/*` and `/uploads/*` requests to the API origin using `API_ORIGIN` in `app/web/next.config.ts`.
- Configure PostgreSQL pool sizing, timeouts, SSL, and query behavior through the named `PG_*` settings read by `app/server/src/db/index.ts` and `app/web/lib/auth/server/getMeData.ts`.
- Local environment files exist at `app/server/.env` and `app/web/.env`; these files are ignored by package-level `.gitignore` rules and their contents are not part of this map.

**Build:**
- Workspace task graph: `turbo.json`.
- Root workspace/package-manager metadata: `package.json` and `.yarnrc.yml`.
- Frontend framework/build configuration: `app/web/next.config.ts`, `app/web/tsconfig.json`, `app/web/eslint.config.mjs`, and `app/web/vercel.json`.
- API compile/deploy configuration: `app/server/tsconfig.json`, `app/server/vercel-build.cjs`, and `app/server/vercel.json`.
- Database generation configuration: `app/server/drizzle.config.ts`.
- Shared RBAC package build configuration: `packages/rbac/package.json` and `packages/rbac/tsconfig.json`.
- Formatting configuration: `.prettierrc.json` and `.editorconfig`.

## Platform Requirements

**Development:**
- Use Node.js 24 and Corepack-backed Yarn 4.12.0 as pinned by `.nvmrc`, `.yarnrc.yml`, and `package.json`.
- Supply a PostgreSQL connection through `DATABASE_URL`; both `app/server/src/db/index.ts` and `app/web/lib/env/server.ts` fail without it.
- Build `@bio-exam/rbac` before consumers when not using Turborepo; dependency ordering is encoded in `turbo.json` and the Vercel builds in `app/server/vercel-build.cjs` and `app/web/vercel.json`.
- Apply or generate database migrations from `app/server/drizzle/` using the scripts in `app/server/package.json`.
- Supabase Storage is feature-dependent in development; `app/server/src/services/storage/storage.ts`, `app/server/src/routes/docs/assets.ts`, and `app/server/src/routes/users/avatar.ts` provide local filesystem fallbacks when storage credentials are absent.

**Production:**
- Frontend target: Vercel Next.js project configured by `app/web/vercel.json`.
- API target: Vercel Node serverless function configured by `app/server/vercel.json` and entered through `app/server/api/index.ts`.
- Durable database target: externally reachable PostgreSQL configured by `DATABASE_URL`, used by `app/server/src/db/index.ts` and `app/web/lib/auth/server/getMeData.ts`.
- Durable object target: Supabase Storage configured in `app/server/src/services/storage/storage.ts`; local upload paths under `app/web/public/uploads/` are development fallbacks and are not served by `app/server/src/app.ts` in production.

---

*Stack analysis: 2026-07-27*

---
last_mapped_commit: 29563ffe5157
---
<!-- refreshed: 2026-07-27 -->
# Architecture

**Analysis Date:** 2026-07-27
**Mapped Commit:** `29563ffe5157`

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│ Next.js App Router pages, client components, SWR, React context      │
│ `app/web/app/` · `app/web/components/` · `app/web/lib/`              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ same-origin `/api/*`
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
┌──────────────────────────────┐  ┌───────────────────────────────────┐
│ Next.js server boundary      │  │ Express API                       │
│ proxy + server components +  │  │ middleware → routers → services  │
│ local `/api/auth/me` handler │  │ `app/server/src/app.ts`           │
│ `app/web/proxy.ts`           │  │ `app/server/src/routes/`          │
└──────────────┬───────────────┘  └──────────────┬────────────────────┘
               │                                  │
               ├──────────────┬───────────────────┤
               ▼              ▼                   ▼
┌────────────────────┐ ┌────────────────┐ ┌───────────────────────────┐
│ Shared RBAC domain │ │ PostgreSQL     │ │ Supabase Storage          │
│ `packages/rbac/`   │ │ Drizzle + `pg` │ │ `app/server/src/services/ │
│                    │ │ `app/server/   │ │ storage/storage.ts`       │
│                    │ │ src/db/`       │ │                           │
└────────────────────┘ └────────────────┘ └───────────────────────────┘
```

The deployable system consists of a Next.js web application in `app/web/`, an
Express API in `app/server/`, and a buildable shared authorization package in
`packages/rbac/`. Turborepo coordinates package builds from `turbo.json`, while
Yarn workspaces declare the package graph in `package.json`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Web shell | Root metadata, global styling, application chrome, and provider composition | `app/web/app/layout.tsx`, `app/web/components/AppLayout/AppLayout.tsx` |
| Route tree | URL composition through Next.js App Router route groups and server/client page pairs | `app/web/app/(internal)/`, `app/web/app/(internal)/(protected)/` |
| Client data layer | Same-origin API calls, 401 refresh-and-retry, SWR queries, and UI-local state | `app/web/lib/api-fetch.ts`, `app/web/lib/fetcher.ts`, `app/web/store/unsavedChanges.store.ts` |
| Web auth boundary | Route prefiltering, SSR identity lookup, and browser auth/RBAC context | `app/web/proxy.ts`, `app/web/lib/auth/getServerMe.ts`, `app/web/components/providers/AuthProvider.tsx` |
| Web auth BFF | Resolves `/api/auth/me` directly from JWT cookies and PostgreSQL | `app/web/app/api/auth/me/route.ts`, `app/web/lib/auth/server/getMeData.ts` |
| API composition root | Applies cross-cutting middleware and mounts the root API router | `app/server/src/app.ts`, `app/server/src/routes/index.ts` |
| API runtime entry | Starts the local HTTP server and owns graceful pool shutdown | `app/server/src/index.ts` |
| Serverless API entry | Adapts the compiled Express application to a Vercel function | `app/server/api/index.ts`, `app/server/vercel.json` |
| Feature routers | Own HTTP paths, validation, authorization, orchestration, and—frequently—direct Drizzle queries | `app/server/src/routes/` |
| Domain services | Encapsulate reusable RBAC, search, and object-storage behavior | `app/server/src/services/rbac/rbac.ts`, `app/server/src/services/search/`, `app/server/src/services/storage/storage.ts` |
| Persistence | Owns the shared PostgreSQL pool, Drizzle client, transactions, schema, and migrations | `app/server/src/db/index.ts`, `app/server/src/db/schema.ts`, `app/server/drizzle/` |
| Shared RBAC domain | Defines typed roles, permission domains, access rules, and permission evaluation used by both apps | `packages/rbac/src/index.ts`, `packages/rbac/src/domains.ts`, `packages/rbac/src/roles.ts`, `packages/rbac/src/rbac.ts` |

## Pattern Overview

**Overall:** Client-server modular monorepo with feature-oriented routes and a
small shared domain package.

**Key Characteristics:**

- Keep deployable boundaries separate: `app/web/` builds as Next.js and
  `app/server/` builds as Express; share compile-time domain logic through
  `packages/rbac/`.
- Treat Next.js as both presentation tier and a narrow backend-for-frontend:
  `app/web/next.config.ts` forwards most `/api/*` traffic to Express, but
  `app/web/app/api/auth/me/route.ts` terminates the identity read inside the web
  deployment.
- Organize the API primarily by resource router in `app/server/src/routes/`;
  extract reusable or integration-heavy work into `app/server/src/services/`.
- Use PostgreSQL as the authoritative state store. The API uses Drizzle through
  `app/server/src/db/index.ts`; the web-only auth BFF uses parameterized `pg`
  queries in `app/web/lib/auth/server/getMeData.ts`.
- Enforce permissions server-side with `sessionRequired()` and `requirePerm()`
  from `app/server/src/middleware/auth/`; use the shared permission set in the
  web UI only for presentation gating.

## Layers

**Presentation and Routing:**

- Purpose: Render application pages, compose global UI, and map URL segments to
  server or client components.
- Location: `app/web/app/`, `app/web/components/`.
- Contains: App Router `page.tsx`/`layout.tsx` files, `*Client.tsx` feature
  screens, shared UI primitives, dialogs, and the Lexical editor.
- Depends on: `app/web/lib/`, `app/web/hooks/`, `app/web/store/`, and
  `packages/rbac/`.
- Used by: Browser requests handled by the Next.js runtime declared in
  `app/web/app/layout.tsx`.

**Web Server and BFF:**

- Purpose: Redirect unauthenticated navigation, preload identity for SSR, and
  serve the web-local auth identity endpoint.
- Location: `app/web/proxy.ts`, `app/web/lib/auth/`,
  `app/web/app/api/auth/me/route.ts`.
- Contains: Cookie lookup, JWT verification, direct PostgreSQL auth reads, and
  server-only URL/env helpers.
- Depends on: `next/headers`, `jsonwebtoken`, `pg`, and `packages/rbac/`.
- Used by: `app/web/components/AppLayout/AppLayout.tsx` and
  `app/web/components/providers/AuthProvider.tsx`.

**API Transport:**

- Purpose: Establish the Express request pipeline and map `/api` resources to
  route modules.
- Location: `app/server/src/app.ts`, `app/server/src/routes/`,
  `app/server/src/middleware/`.
- Contains: Helmet, CORS, JSON parsing, request IDs, Pino HTTP logging, session
  parsing, Zod validation, RBAC middleware, and error translation.
- Depends on: Application services in `app/server/src/services/` and persistence
  in `app/server/src/db/`.
- Used by: Local runtime `app/server/src/index.ts` and serverless runtime
  `app/server/api/index.ts`.

**Application and Domain Services:**

- Purpose: Reuse logic that spans multiple route handlers or external systems.
- Location: `app/server/src/services/`, `app/server/src/lib/tests/`.
- Contains: Effective permission calculation, database search, search-document
  construction, scoring, telemetry, submission calculations, and storage access.
- Depends on: `app/server/src/db/`, `packages/rbac/`, and Supabase Storage.
- Used by: Feature routers such as `app/server/src/routes/search.ts` and
  `app/server/src/routes/tests/index.ts`.

**Persistence:**

- Purpose: Provide typed database access and durable schema evolution.
- Location: `app/server/src/db/`, `app/server/drizzle/`,
  `app/server/drizzle.config.ts`.
- Contains: A module-level `pg.Pool`, the Drizzle client, transaction helper,
  schema definitions, seed logic, and ordered SQL migrations.
- Depends on: PostgreSQL connection configuration loaded by
  `app/server/src/config/env.ts`.
- Used by: API route modules, server services, scripts, and the independent web
  auth pool in `app/web/lib/auth/server/getMeData.ts`.

**Shared Authorization Domain:**

- Purpose: Keep permission keys, roles, and pure access-rule evaluation
  consistent across web and server packages.
- Location: `packages/rbac/src/`.
- Contains: Domain/action registry, role registry, access normalization, and
  pure permission-set helpers.
- Depends on: No application package; `packages/rbac/package.json` builds a
  standalone ESM/CJS/types artifact.
- Used by: `app/server/src/middleware/auth/`,
  `app/server/src/services/rbac/rbac.ts`, and
  `app/web/components/providers/AuthProvider.tsx`.

## Data Flow

### Primary Authenticated API Request

1. A client feature starts a same-origin request through SWR or `apiFetch()`;
   the tests list is representative at
   `app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx:83`.
2. Next.js forwards `/api/:path*` to the configured API origin through
   `app/web/next.config.ts:25`.
3. Express applies request ID/logging, JSON parsing, and optional session
   extraction before mounting the API router at `app/server/src/app.ts:79`.
4. `app/server/src/routes/index.ts:17` dispatches to a resource router; protected
   handlers compose parameter validation, `sessionRequired()`, and
   `requirePerm()` as shown at `app/server/src/routes/tests/index.ts:280`.
5. The handler or a service queries the shared Drizzle client from
   `app/server/src/db/index.ts:64`, then serializes JSON.
6. Operational errors are passed with `next(error)` and normalized by the final
   handler at `app/server/src/app.ts:106`; `apiFetch()` handles an expired
   session by refreshing once and retrying at `app/web/lib/api-fetch.ts:9`.

### SSR Identity and Permission Flow

1. `app/web/proxy.ts:15` performs a coarse navigation gate based on the presence
   of a session or refresh cookie; it does not establish identity.
2. `app/web/components/AppLayout/AppLayout.tsx:20` calls the cached server helper
   in `app/web/lib/auth/getServerMe.ts:11`.
3. The helper calls the same-origin Next route
   `app/web/app/api/auth/me/route.ts:8`, forwarding request cookies.
4. `app/web/lib/auth/server/getMeData.ts:125` verifies the JWT, reads the user,
   roles, and DB grant overrides with a web-owned `pg.Pool`, then combines them
   with the pure rules from `packages/rbac/src/rbac.ts`.
5. `app/web/components/providers/AuthProvider.tsx:34` exposes the identity and
   immutable permission set to client components; server-side API middleware
   still recalculates authorization before protected operations.

### Local and Serverless Startup

1. Local development executes `app/server/src/index.ts:10`, imports the composed
   Express app, and calls `listen()`.
2. Vercel routes API traffic to `app/server/api/index.ts:3`, which dynamically
   imports the compiled `app/server/dist/app.js`.
3. Both paths use the same application composition in
   `app/server/src/app.ts`; only the local entry owns signal handling and
   `pgPool.end()` in `app/server/src/index.ts:16`.

**State Management:**

- Keep durable domain state in PostgreSQL via `app/server/src/db/schema.ts`.
- Use request/server state through Next server components and React's
  per-request `cache()` in `app/web/lib/auth/getServerMe.ts`.
- Use browser-shared auth state through React context in
  `app/web/components/providers/AuthProvider.tsx`.
- Use remote query state through SWR in feature clients such as
  `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`.
- Use Zustand only for focused cross-component client state, currently
  unsaved-change tracking in `app/web/store/unsavedChanges.store.ts`.
- Treat the module-level RBAC maps in
  `app/server/src/services/rbac/rbac.ts` as per-process caches with a five-minute
  TTL, not as authoritative state.

## Key Abstractions

**Express Resource Router:**

- Purpose: Define a cohesive `/api/<resource>` surface.
- Examples: `app/server/src/routes/users/index.ts`,
  `app/server/src/routes/groups/index.ts`,
  `app/server/src/routes/tests/index.ts`.
- Pattern: Export one `Router`, compose middleware at each handler, and mount it
  once from `app/server/src/routes/index.ts`.

**Session Middleware:**

- Purpose: Convert an HTTP-only JWT cookie into `req.authUser` and enforce
  authenticated access.
- Examples: `app/server/src/middleware/auth/session.ts`,
  `app/server/src/routes/auth/me.ts`.
- Pattern: Install `sessionOptional()` globally, then add `sessionRequired()` at
  protected route boundaries.

**Typed Permission Registry:**

- Purpose: Make roles, domains, actions, and permission keys a shared contract.
- Examples: `packages/rbac/src/domains.ts`, `packages/rbac/src/roles.ts`,
  `packages/rbac/src/rbac.ts`.
- Pattern: Use pure base grants from the package, then layer database role and
  user overrides in `app/server/src/services/rbac/rbac.ts`.

**Database Boundary:**

- Purpose: Centralize PostgreSQL pooling, typed Drizzle access, and
  user-attributed transactions for the API.
- Examples: `app/server/src/db/index.ts`, `app/server/src/db/schema.ts`.
- Pattern: Import the shared `db` for queries and use `withUserTx()` for
  multi-statement work that requires a transaction-local `app.user_id`.

**Storage Service:**

- Purpose: Isolate Supabase object operations, retry policy, signed URLs, and
  archive/file behavior.
- Examples: `app/server/src/services/storage/storage.ts`,
  `app/server/src/routes/docs/assets.ts`.
- Pattern: Keep SDK access behind `StorageService`; route handlers pass paths,
  buffers, and access decisions.

## Entry Points

**Web Application:**

- Location: `app/web/app/layout.tsx`
- Triggers: Next.js requests to the web deployment.
- Responsibilities: Declare runtime/rendering policy, metadata, global styles,
  and mount `app/web/components/AppLayout/AppLayout.tsx`.

**Navigation Gate:**

- Location: `app/web/proxy.ts`
- Triggers: Matched application navigation outside static, API, and upload
  paths.
- Responsibilities: Allow public login/invite routes and redirect cookie-less
  requests to `/login`.

**Web Auth Route:**

- Location: `app/web/app/api/auth/me/route.ts`
- Triggers: `GET /api/auth/me` in the Next.js deployment.
- Responsibilities: Return the SSR/browser identity payload built by
  `app/web/lib/auth/server/getMeData.ts`.

**Express Application:**

- Location: `app/server/src/app.ts`
- Triggers: Import by either API runtime entry.
- Responsibilities: Build middleware order, mount health/API routes, and
  translate errors.

**Local API Runtime:**

- Location: `app/server/src/index.ts`
- Triggers: `yarn workspace @bio-exam/server dev` or `start`.
- Responsibilities: Listen on the configured port and close the shared DB pool
  on termination signals.

**Vercel API Runtime:**

- Location: `app/server/api/index.ts`
- Triggers: Rewrites in `app/server/vercel.json`.
- Responsibilities: Validate minimum runtime configuration, load the compiled
  Express app, and adapt it to Vercel request/response objects.

**RBAC Package:**

- Location: `packages/rbac/src/index.ts`
- Triggers: Imports from either application workspace.
- Responsibilities: Publish the shared typed authorization API built by
  `packages/rbac/package.json`.

## Architectural Constraints

- **Threading:** Both deployments run on the Node.js event loop. CPU-heavy image
  work through `sharp` and archive work through `archiver`, referenced by
  `app/server/src/routes/users/avatar.ts` and
  `app/server/src/services/storage/storage.ts`, must remain bounded because
  there is no worker-thread layer.
- **Global state:** `app/server/src/db/index.ts` exports one process-wide
  `pg.Pool`; `app/server/src/services/rbac/rbac.ts` owns mutable in-memory role
  and user caches; `app/web/lib/auth/server/getMeData.ts` stores a separate auth
  pool on `globalThis`.
- **Serverless state:** Do not rely on cache persistence across invocations.
  Caches in `app/server/src/services/rbac/rbac.ts` and the pool singleton in
  `app/web/lib/auth/server/getMeData.ts` are optimization-only.
- **Circular imports:** GitNexus reports two cycles:
  `app/web/components/editor/editor-ui/image-component.tsx` ↔
  `app/web/components/editor/nodes/image-node.tsx`, and
  `app/web/components/editor/nodes/autocomplete-node.tsx` ↔
  `app/web/components/editor/plugins/autocomplete-plugin.tsx`.
- **Module format:** Server source is ESM and uses explicit `.js` suffixes in
  relative TypeScript imports, as configured by `app/server/tsconfig.json`;
  preserve that convention in new server modules.
- **API boundary:** Most same-origin `/api/*` requests cross the rewrite in
  `app/web/next.config.ts`; `/api/auth/me` is a web-local route backed by a
  second direct database access path in
  `app/web/lib/auth/server/getMeData.ts`.
- **Authorization boundary:** UI checks in
  `app/web/components/providers/AuthProvider.tsx` are advisory. Mutating and
  sensitive reads must enforce session and permissions again in
  `app/server/src/middleware/auth/`.

## Anti-Patterns

### Route Modules as the Entire Application Layer

**What happens:** Large feature routers combine validation, authorization,
database queries, transaction orchestration, transformations, and response
serialization. The strongest example is
`app/server/src/routes/tests/index.ts` (2,723 lines).

**Why it's wrong:** New changes become coupled to Express, reusable business
logic is difficult to test without HTTP setup, and a single feature module
accumulates a large blast radius.

**Do this instead:** Keep new handlers thin in `app/server/src/routes/<feature>/`
and move reusable workflows into `app/server/src/services/<feature>/`, following
the separation already present between `app/server/src/routes/search.ts` and
`app/server/src/services/search/database-search.ts`.

### Duplicate Auth Provider Ownership

**What happens:** `app/web/components/AppLayout/AppLayout.tsx` mounts
`AuthProvider` with SSR `initialMe`, while its nested `Providers` component in
`app/web/app/providers.tsx` mounts another `AuthProvider` without that initial
state.

**Why it's wrong:** Descendants can bind to the inner context and repeat the
identity fetch, while the outer SSR-initialized context does not become the
single source of truth.

**Do this instead:** Add new global providers in one composition root and keep
exactly one auth context owner. Use the SSR-initialized provider in
`app/web/components/AppLayout/AppLayout.tsx` as the architectural boundary.

### Cross-Importing Editor Nodes and Plugins

**What happens:** Node and plugin modules directly depend on one another in the
two cycles reported under Architectural Constraints.

**Why it's wrong:** Initialization order becomes implicit and extracting or
testing an editor node requires loading plugin behavior.

**Do this instead:** Put shared commands, payload types, or registration helpers
under `app/web/components/editor/utils/` or another dependency-neutral editor
module, then make both node and plugin depend inward on that module.

## Error Handling

**Strategy:** Translate expected failures to HTTP responses at the route or
middleware boundary and forward unexpected failures to one Express error
handler.

**Patterns:**

- Throw `ApiError` values from `app/server/src/lib/errors.ts` for operational
  failures that need a status code and safe message.
- Wrap async route bodies in `try/catch` and call `next(error)`, as in
  `app/server/src/routes/search.ts`; async rejection forwarding is patched once
  by `app/server/src/lib/patchExpressAsyncErrors.ts`.
- Validate request data with Zod schemas from `app/server/src/schemas/` or
  route-local schemas before persistence calls.
- Return `401` for missing/invalid sessions and `403` for missing permissions
  from `app/server/src/middleware/auth/requirePerm.ts`.
- Let `app/server/src/app.ts` log request context and suppress internal error
  details in production.
- On the web, normalize an unrecoverable API `401` to `AuthExpiredError` in
  `app/web/lib/api-fetch.ts`; server-side identity helpers return `null` on
  invalid identity in `app/web/lib/auth/getServerMe.ts`.

## Cross-Cutting Concerns

**Logging:** Use structured Pino request logging from
`app/server/src/lib/logger.ts`; include request ID, method, path, and error
context in `app/server/src/app.ts`. Startup scripts and storage fallbacks still
use `console` in files such as `app/server/src/config/env.ts` and
`app/server/src/services/storage/storage.ts`.

**Validation:** Use Zod schemas in `app/server/src/schemas/` and focused
middleware such as `app/server/src/middleware/validateParams.ts`; database
constraints and relations live in `app/server/src/db/schema.ts`.

**Authentication:** Use signed JWTs in HTTP-only cookies, parsed by
`app/server/src/middleware/auth/session.ts`; refresh-token persistence lives in
`app/server/src/db/schema.ts` and refresh behavior is exposed by
`app/server/src/routes/auth/refresh.ts`.

**Authorization:** Define the static role model in `packages/rbac/src/` and
apply database allow/deny overrides in
`app/server/src/services/rbac/rbac.ts`. Every protected API route must compose
`sessionRequired()` with the narrowest applicable `requirePerm()`.

**Security Headers and CORS:** Keep global Helmet and credentialed CORS policy
in `app/server/src/app.ts`, before route mounting.

---

*Architecture analysis: 2026-07-27*

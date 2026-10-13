---
last_mapped_commit: 29563ffe5157
---
# Codebase Structure

**Analysis Date:** 2026-07-27
**Mapped Commit:** `29563ffe5157`

## Directory Layout

```text
bio-exam/
├── app/
│   ├── server/                     # Express API workspace
│   │   ├── api/index.ts            # Vercel serverless adapter
│   │   ├── drizzle/                # Ordered, committed SQL migrations
│   │   └── src/
│   │       ├── config/             # Runtime auth/environment configuration
│   │       ├── db/                 # Drizzle schema, pool, seeds
│   │       ├── lib/                # Shared server helpers and pure test logic
│   │       ├── middleware/         # Express cross-cutting middleware
│   │       ├── routes/             # Resource-oriented API routers
│   │       ├── schemas/            # Zod request/domain schemas
│   │       ├── scripts/            # Operational data/admin scripts
│   │       ├── services/           # RBAC, search, and storage services
│   │       ├── types/              # Server-only ambient/domain types
│   │       ├── app.ts              # Express composition root
│   │       └── index.ts            # Local API runtime entry
│   └── web/                        # Next.js web workspace
│       ├── app/                    # App Router pages, layouts, route handlers
│       │   ├── (internal)/         # Login, invite, and authenticated UI tree
│       │   └── api/                # Web-local route handlers
│       ├── components/             # Shared and feature UI components
│       ├── config/                 # Site, font, and breadcrumb configuration
│       ├── helpers/                # Small presentation helpers
│       ├── hooks/                  # Reusable React hooks
│       ├── lib/                    # Auth, HTTP, MDX, search, and test clients
│       ├── public/                 # Static assets
│       ├── store/                  # Focused Zustand stores
│       ├── styles/                 # Global CSS and breakpoints
│       ├── types/                  # Web ambient and shared UI types
│       ├── utils/                  # General web utilities
│       ├── proxy.ts                # Next navigation/auth prefilter
│       └── next.config.ts          # MDX and API/upload rewrites
├── packages/
│   └── rbac/
│       └── src/                    # Shared roles and permission domain logic
├── .yarn/releases/                 # Committed Yarn binary
├── package.json                    # Workspace root and aggregate scripts
├── turbo.json                      # Task graph and build outputs
├── yarn.lock                       # Canonical dependency lockfile
└── .planning/codebase/             # Generated GSD codebase map
```

## Directory Purposes

**`app/server/src/config/`:**

- Purpose: Load runtime configuration and expose authentication settings.
- Contains: Environment lookup/redaction and JWT/cookie configuration.
- Key files: `app/server/src/config/env.ts`,
  `app/server/src/config/auth.ts`.

**`app/server/src/db/`:**

- Purpose: Define PostgreSQL persistence and create reusable database clients.
- Contains: Drizzle schema, shared `pg.Pool`, transaction helper, and seed data.
- Key files: `app/server/src/db/index.ts`, `app/server/src/db/schema.ts`,
  `app/server/src/db/seed.ts`.

**`app/server/src/middleware/`:**

- Purpose: Implement reusable HTTP request policy before route handlers run.
- Contains: Session extraction, basic-admin auth, permission enforcement, rate
  limiting, request IDs, and parameter validation.
- Key files: `app/server/src/middleware/auth/session.ts`,
  `app/server/src/middleware/auth/requirePerm.ts`,
  `app/server/src/middleware/rateLimiter.ts`,
  `app/server/src/middleware/validateParams.ts`.

**`app/server/src/routes/`:**

- Purpose: Own the Express API surface grouped by resource/domain.
- Contains: Root router plus auth, users, groups, tests, RBAC, search, settings,
  sidebar, docs-assets, and health routers.
- Key files: `app/server/src/routes/index.ts`,
  `app/server/src/routes/tests/index.ts`,
  `app/server/src/routes/tests/public.ts`,
  `app/server/src/routes/users/index.ts`.

**`app/server/src/schemas/`:**

- Purpose: Keep reusable Zod validation contracts outside route bodies.
- Contains: Assignment, group, RBAC, tests, and users schemas.
- Key files: `app/server/src/schemas/tests.ts`,
  `app/server/src/schemas/users.ts`,
  `app/server/src/schemas/groups.ts`.

**`app/server/src/services/`:**

- Purpose: Encapsulate reusable domain workflows and external-system access.
- Contains: RBAC permission resolution, database search/indexing, and Supabase
  object storage.
- Key files: `app/server/src/services/rbac/rbac.ts`,
  `app/server/src/services/search/database-search.ts`,
  `app/server/src/services/search/question-documents.ts`,
  `app/server/src/services/storage/storage.ts`.

**`app/server/src/lib/tests/`:**

- Purpose: Hold pure testing-domain logic shared by API endpoints and unit tests.
- Contains: Question type resolution, scoring, telemetry, and submission result
  calculation.
- Key files: `app/server/src/lib/tests/scoring.ts`,
  `app/server/src/lib/tests/submit-result.ts`,
  `app/server/src/lib/tests/question-type-resolver.ts`.

**`app/server/src/scripts/`:**

- Purpose: Provide manually invoked operational commands.
- Contains: Migration application, search backfill, and initial admin bootstrap.
- Key files: `app/server/src/scripts/apply-migration.ts`,
  `app/server/src/scripts/backfill-question-search.ts`,
  `app/server/src/scripts/bootstrap-admin.ts`.

**`app/server/drizzle/`:**

- Purpose: Store the ordered PostgreSQL migration history generated from
  `app/server/src/db/schema.ts`.
- Contains: Numbered `.sql` migrations and Drizzle metadata.
- Key files: `app/server/drizzle/0000_typical_exiles.sql`,
  `app/server/drizzle/0020_short_answer_variants.sql`,
  `app/server/drizzle/meta/_journal.json`.

**`app/web/app/`:**

- Purpose: Define the URL tree with Next.js App Router conventions.
- Contains: Root layout/error/not-found pages, route groups, dynamic segments,
  and the web-local auth route.
- Key files: `app/web/app/layout.tsx`, `app/web/app/page.tsx`,
  `app/web/app/error.tsx`, `app/web/app/api/auth/me/route.ts`.

**`app/web/app/(internal)/`:**

- Purpose: Group application routes without adding a URL segment.
- Contains: Public login/invite pages and the `(protected)` subtree.
- Key files: `app/web/app/(internal)/login/page.tsx`,
  `app/web/app/(internal)/invite/[token]/page.tsx`,
  `app/web/app/(internal)/(protected)/layout.tsx`.

**`app/web/app/(internal)/(protected)/`:**

- Purpose: Organize authenticated student/profile/admin screens.
- Contains: Dashboard, tests, profile, and administration features; route
  folders commonly pair a small `page.tsx` with a larger `*Client.tsx`.
- Key files:
  `app/web/app/(internal)/(protected)/dashboard/page.tsx`,
  `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`,
  `app/web/app/(internal)/(protected)/admin/layout.tsx`.

**`app/web/components/`:**

- Purpose: Provide reusable application shell, feature widgets, dialogs, editor
  modules, and UI primitives.
- Contains: PascalCase feature folders, lowercase shadcn-style primitives under
  `ui/`, auth/RBAC components, and the Lexical editor.
- Key files: `app/web/components/AppLayout/AppLayout.tsx`,
  `app/web/components/AppSidebar.tsx`,
  `app/web/components/auth/AuthGuard.tsx`,
  `app/web/components/editor/editor.tsx`.

**`app/web/lib/`:**

- Purpose: Hold non-visual web logic and API adapters.
- Contains: Auth/session helpers, `apiFetch`, server-only environment access,
  HTTP origin calculation, MDX transforms, search adapters, test API types, and
  image URL caching.
- Key files: `app/web/lib/api-fetch.ts`,
  `app/web/lib/auth/getServerMe.ts`,
  `app/web/lib/auth/server/getMeData.ts`,
  `app/web/lib/search/api.ts`,
  `app/web/lib/tests/api.ts`.

**`app/web/store/`:**

- Purpose: Hold narrowly scoped client state that is not server query state.
- Contains: Zustand stores.
- Key files: `app/web/store/unsavedChanges.store.ts`.

**`packages/rbac/src/`:**

- Purpose: Publish application-independent authorization contracts to both
  workspaces.
- Contains: Permission domains, role definitions, permission calculation, and
  access-rule normalization.
- Key files: `packages/rbac/src/index.ts`,
  `packages/rbac/src/domains.ts`, `packages/rbac/src/roles.ts`,
  `packages/rbac/src/rbac.ts`, `packages/rbac/src/access.ts`.

## Key File Locations

**Entry Points:**

- `app/web/app/layout.tsx`: Next.js root layout and runtime/render policy.
- `app/web/proxy.ts`: Navigation-level cookie gate.
- `app/web/app/api/auth/me/route.ts`: Web-local identity endpoint.
- `app/server/src/app.ts`: Express application composition without listening.
- `app/server/src/index.ts`: Local Express server with graceful shutdown.
- `app/server/api/index.ts`: Vercel serverless Express adapter.
- `packages/rbac/src/index.ts`: Shared package public API.

**Configuration:**

- `package.json`: Yarn workspace boundaries and aggregate Turbo commands.
- `turbo.json`: Build/dev/start/lint/typecheck task graph.
- `app/server/package.json`: Server commands and Node runtime requirement.
- `app/server/tsconfig.json`: ESM server compilation into `dist/`.
- `app/server/drizzle.config.ts`: Schema and migration output locations.
- `app/server/vercel.json`: API function build and rewrite configuration.
- `app/web/package.json`: Next.js scripts and web dependencies.
- `app/web/tsconfig.json`: Strict web TypeScript plus `@/*` path alias.
- `app/web/next.config.ts`: MDX integration and proxy rewrites.
- `app/web/vercel.json`: Web deployment build command.
- `packages/rbac/package.json`: ESM/CJS/declaration package build.

**Core Logic:**

- `app/server/src/routes/tests/index.ts`: Administrative test/topic/question API.
- `app/server/src/routes/tests/public.ts`: Student-facing test lifecycle API.
- `app/server/src/lib/tests/submit-result.ts`: Test result calculation.
- `app/server/src/services/rbac/rbac.ts`: Effective permission resolution.
- `app/server/src/services/search/database-search.ts`: Permission-aware search.
- `app/server/src/services/storage/storage.ts`: Supabase storage boundary.
- `app/server/src/db/schema.ts`: Authoritative relational model.
- `app/web/components/providers/AuthProvider.tsx`: Browser identity/RBAC context.
- `app/web/lib/auth/server/getMeData.ts`: SSR identity and direct auth DB read.
- `packages/rbac/src/rbac.ts`: Pure role-to-permission evaluation.

**Testing:**

- `app/server/src/lib/tests/question-type-resolver.test.ts`: Question-type logic.
- `app/server/src/lib/tests/scoring.test.ts`: Scoring behavior.
- `app/server/src/lib/tests/telemetry.test.ts`: Telemetry behavior.
- `app/server/src/schemas/tests.test.ts`: Tests-schema validation.
- `app/web/lib/auth/loginRedirect.test.ts`: Login redirect behavior.
- `app/web/lib/auth/sessionCookie.test.ts`: Cookie name/read behavior.
- `app/web/lib/mdx/normalizeSource.test.ts`: MDX normalization.

## Naming Conventions

**Files:**

- Use Next.js reserved lowercase names for router files:
  `app/web/app/layout.tsx`, `app/web/app/page.tsx`,
  `app/web/app/api/auth/me/route.ts`.
- Use PascalCase for exported React component files:
  `app/web/components/AppSidebar.tsx`,
  `app/web/components/providers/AuthProvider.tsx`,
  `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`.
- Use `*Client.tsx` for client-heavy screens adjacent to a route `page.tsx`, as
  in `app/web/app/(internal)/(protected)/admin/groups/GroupsClient.tsx`.
- Use lowercase kebab-case for reusable web utilities and low-level UI files:
  `app/web/lib/image-signed-url-cache.ts`,
  `app/web/components/ui/alert-dialog.tsx`.
- Use `*.store.ts` for Zustand stores:
  `app/web/store/unsavedChanges.store.ts`.
- Use lowercase domain names for server modules and feature directories:
  `app/server/src/routes/search.ts`,
  `app/server/src/services/search/database-search.ts`.
- Use `index.ts` as the public composition/export point for server route
  directories and shared packages:
  `app/server/src/routes/auth/index.ts`,
  `packages/rbac/src/index.ts`.
- Use `*.test.ts` beside the implementation for current unit tests:
  `app/server/src/lib/tests/scoring.test.ts`,
  `app/web/lib/auth/sessionCookie.test.ts`.
- Use zero-padded sequential migration names in `app/server/drizzle/`, such as
  `app/server/drizzle/0020_short_answer_variants.sql`.

**Directories:**

- Use Next route groups and dynamic segments exactly where URL behavior requires
  them: `app/web/app/(internal)/(protected)/` and
  `app/web/app/(internal)/(protected)/profile/[id]/`.
- Use lowercase domain directories for API and non-visual logic:
  `app/server/src/routes/users/`, `app/server/src/services/rbac/`,
  `app/web/lib/auth/`.
- Existing reusable component groups use both PascalCase
  (`app/web/components/Breadcrumbs/`) and lowercase feature names
  (`app/web/components/users/`). Match the nearest sibling convention instead
  of renaming adjacent modules.
- Keep workspace packages under `packages/<package>/`, following
  `packages/rbac/`.

## Where to Add New Code

**New Web Feature:**

- Route entry: add `page.tsx` under the matching URL subtree in
  `app/web/app/(internal)/(protected)/`.
- Client screen: colocate `<Feature>Client.tsx` beside the route when the screen
  owns hooks, SWR, or mutations, following
  `app/web/app/(internal)/(protected)/admin/groups/GroupsClient.tsx`.
- Reusable feature UI: add to `app/web/components/<feature>/`; use
  `app/web/components/groups/` and `app/web/components/users/` as examples.
- Shared non-visual client/server logic: add to `app/web/lib/<feature>/`.
- Browser state: prefer SWR for API state; add a focused store to
  `app/web/store/` only for cross-component client-only state.
- Tests: colocate `*.test.ts` with the utility under `app/web/lib/<feature>/`.

**New API Resource:**

- Router: create `app/server/src/routes/<resource>/index.ts` for a multi-file
  resource, or `app/server/src/routes/<resource>.ts` for a small router.
- Registration: mount it once in `app/server/src/routes/index.ts`.
- Validation: add reusable Zod contracts to
  `app/server/src/schemas/<resource>.ts`.
- Business workflow: add reusable logic to
  `app/server/src/services/<resource>/`; keep route handlers focused on HTTP
  validation, auth, and response translation.
- Persistence: extend `app/server/src/db/schema.ts`, then generate a numbered
  migration under `app/server/drizzle/`.
- Tests: colocate pure service/domain tests as `*.test.ts`, following
  `app/server/src/lib/tests/scoring.test.ts`.

**New Shared Authorization Capability:**

- Permission domain/actions: update `packages/rbac/src/domains.ts`.
- Role defaults: update `packages/rbac/src/roles.ts`.
- Pure evaluation/normalization: add to `packages/rbac/src/rbac.ts` or
  `packages/rbac/src/access.ts`.
- Public export: expose it through `packages/rbac/src/index.ts`.
- Server enforcement: consume it from
  `app/server/src/middleware/auth/requirePerm.ts` or the relevant router.

**New Component/Module:**

- Shared visual primitive: `app/web/components/ui/`.
- Application-level reusable component: `app/web/components/<feature>/`.
- Editor node/plugin: `app/web/components/editor/nodes/` or
  `app/web/components/editor/plugins/`; place shared contracts in a neutral
  editor utility module to avoid the existing node/plugin cycles.
- Server cross-cutting middleware: `app/server/src/middleware/`.
- Server generic helper: `app/server/src/lib/`.

**Utilities:**

- Shared web helpers: `app/web/lib/` for behavior with dependencies or
  server/client boundaries; `app/web/utils/` or `app/web/helpers/` for small
  presentation/general functions, matching the nearest existing use.
- Shared server helpers: `app/server/src/lib/`.
- Cross-workspace pure domain code: create or extend a package under
  `packages/`; do not import from `app/web/` into `app/server/` or vice versa.

## Special Directories

**`app/server/drizzle/`:**

- Purpose: PostgreSQL migration history and Drizzle migration metadata.
- Generated: Partly; SQL is generated by the command in
  `app/server/package.json` and then reviewed/applied.
- Committed: Yes.

**`.yarn/releases/`:**

- Purpose: Pin the repository's Yarn 4 executable.
- Generated: Yes, by package-manager setup.
- Committed: Yes; root `.gitignore` explicitly preserves it.

**`app/web/public/`:**

- Purpose: Static web assets served from the site root.
- Generated: No.
- Committed: Yes, except runtime uploads excluded by
  `app/web/.gitignore`.

**`app/web/.next/` and `app/server/dist/`:**

- Purpose: Next.js and TypeScript production build outputs.
- Generated: Yes.
- Committed: No; both are excluded by `.gitignore`.

**`app/web/tsconfig.tsbuildinfo`:**

- Purpose: TypeScript incremental compilation cache.
- Generated: Yes.
- Committed: No; `*.tsbuildinfo` is excluded by `.gitignore`.

**`.gitnexus/`:**

- Purpose: Local code-intelligence graph for the current repository.
- Generated: Yes, by GitNexus analysis.
- Committed: No; `.gitnexus` is excluded by `.gitignore`.

**`.planning/codebase/`:**

- Purpose: Generated GSD codebase reference documents.
- Generated: Yes, by the codebase mapping workflow.
- Committed: The root `.gitignore` currently excludes `.planning`; repository
  workflow tooling decides whether to force-add planning artifacts.

---

*Structure analysis: 2026-07-27*

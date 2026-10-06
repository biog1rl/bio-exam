# Coding Conventions

**Analysis Date:** 2026-07-27

## Naming Patterns

**Files:**
- Use Next.js reserved lowercase names for route entry points: `app/web/app/layout.tsx`, `app/web/app/page.tsx`, `app/web/app/error.tsx`, and nested `page.tsx` files.
- Use PascalCase for feature-level React component files, matching the exported component: `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`, `app/web/components/tests/TestRunner.tsx`, and `app/web/components/Buttons/BackButton.tsx`.
- Use kebab-case for reusable UI primitives and low-level helpers: `app/web/components/ui/date-picker.tsx`, `app/web/lib/api-fetch.ts`, and `app/server/src/services/search/database-search.ts`.
- Use camelCase when a helper file is named directly after one JavaScript function or concern: `app/web/lib/auth/sessionCookie.ts`, `app/web/lib/auth/loginRedirect.ts`, and `app/server/src/lib/transliterate.ts`.
- Name executable assertion files `*.test.ts`; all 11 current tests use this suffix, including `app/server/src/lib/tests/scoring.test.ts` and `app/web/lib/mdx/normalizeSource.test.ts`.
- Keep Express route filenames lowercase and organize route groups with an `index.ts`: `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/index.ts`, and `app/server/src/routes/users/index.ts`.

**Functions:**
- Use camelCase for functions and handlers: `buildLoginRedirectPath` in `app/web/lib/auth/loginRedirect.ts`, `searchAll` in `app/web/lib/search/api.ts`, and `validateUUID` in `app/server/src/middleware/validateParams.ts`.
- Prefix React hooks with `use`: `useTestEditorModel` in `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts`.
- Use PascalCase for React components: `ProfileClient` in `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx` and `DatePicker` in `app/web/components/ui/date-picker.tsx`.
- Prefix Lexical editor command helpers with `$` where the Lexical API expects that idiom: `$updateToolbar` in `app/web/components/editor/plugins/toolbar/font-format-toolbar-plugin.tsx`.

**Variables:**
- Use camelCase for local values and function parameters: `questionTypesMap` in `app/server/src/lib/tests/question-type-resolver.test.ts` and `requestId` in `app/server/src/app.ts`.
- Use SCREAMING_SNAKE_CASE for module constants and registries: `JSON_BODY_LIMIT` in `app/server/src/app.ts`, `UUID_REGEX` in `app/server/src/middleware/validateParams.ts`, and `ROLE_REGISTRY` in `packages/rbac/src/roles.ts`.
- Prefix intentionally unused callback parameters with `_`: `_req` in `app/server/src/app.ts` and `_next` in its error handler; `app/web/eslint.config.mjs` explicitly allows unused names matching `^_`.

**Types:**
- Use PascalCase for interfaces, type aliases, and classes: `ProfileData` and `ProfileClientProps` in `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`, `ApiError` in `app/server/src/lib/errors.ts`, and `RoleKey` in `packages/rbac/src/roles.ts`.
- Suffix types by role when it improves intent: `*Props` for component inputs, `*Data` for payloads, `*Map` for keyed structures, and `*Key` for constrained strings, as shown in `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`, `app/server/src/lib/tests/question-type-resolver.ts`, and `packages/rbac/src/domains.ts`.
- Place type-only imports behind `import type` or inline `type` specifiers: `app/server/src/routes/search.ts`, `app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts`, and `packages/rbac/src/access.ts`.

## Code Style

**Formatting:**
- Use tabs, single quotes, no semicolons, ES5 trailing commas, LF endings, and a 120-column print width. These rules are declared in `.prettierrc.json`, `app/server/.prettierrc.json`, and `app/web/.prettierrc.json`.
- Let Prettier sort imports. The web order is React-specific packages, other packages, `@/` aliases, then relative imports in `app/web/.prettierrc.json`; the server order is Node built-ins, packages, `@/`, then relative imports in `app/server/.prettierrc.json`.
- Let `prettier-plugin-tailwindcss` sort Tailwind classes used through `clsx`, `cn`, and `cva` in web code; this is configured in `app/web/.prettierrc.json`.
- Treat `packages/rbac/src/*.ts` as formatting drift rather than a separate standard: files such as `packages/rbac/src/roles.ts` and `packages/rbac/src/rbac.ts` currently use spaces and semicolons even though the root `.prettierrc.json` specifies tabs and no semicolons.
- The only configured formatting script is `prettier --write .` in `app/web/package.json`; the root `package.json`, `app/server/package.json`, and `packages/rbac/package.json` do not expose a format script.

**Linting:**
- Run `yarn lint` from `package.json`; Turbo delegates to package scripts according to `turbo.json`.
- The active lint target is the web workspace because only `app/web/package.json` defines `lint`. `app/server/package.json` and `packages/rbac/package.json` have no lint script.
- Use the ESLint 9 flat configuration at `app/web/eslint.config.mjs`. The web command explicitly passes this file, so `app/web/.eslintrc.json` is legacy configuration and is not the invoked ruleset.
- Enforce Next.js recommended/core-web-vitals rules, React Hooks rules, and Prettier errors through `app/web/eslint.config.mjs`.
- Treat unused variables as warnings unless prefixed `_`; `app/web/eslint.config.mjs` configures `@typescript-eslint/no-unused-vars` accordingly.
- Current `yarn lint` exits successfully with warnings and, because `turbo.json` makes `lint` depend on upstream builds, also builds `packages/rbac`.
- Keep TypeScript strict. `strict: true` and `forceConsistentCasingInFileNames: true` are set in `app/server/tsconfig.json` and `app/web/tsconfig.json`; `packages/rbac/tsconfig.json` also enables strict mode.

## Import Organization

**Order:**
1. Put Node built-ins first in server files, using the `node:` protocol, as in `app/server/src/app.ts` and `app/server/src/lib/logger.ts`.
2. Put React imports first in client components, then framework and third-party packages, as in `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`.
3. Put workspace packages and external packages before local application imports, as in `app/server/src/routes/search.ts`.
4. Separate application aliases from relative imports with a blank line, as enforced by `app/web/.prettierrc.json`.
5. Use relative `.js` specifiers inside server TypeScript because the server emits ESM: `app/server/src/routes/search.ts` and `app/server/src/middleware/validateParams.ts`.

**Path Aliases:**
- Use `@/*` only in the web workspace; it resolves to `app/web/*` through `app/web/tsconfig.json`.
- Use the workspace package name `@bio-exam/rbac` for shared RBAC types and behavior, as in `app/server/src/routes/search.ts` and web dependencies declared in `app/web/package.json`.
- Use relative imports in `app/server/src/**` and `packages/rbac/src/**`; neither `app/server/tsconfig.json` nor `packages/rbac/tsconfig.json` defines a path alias.

## Error Handling

**Patterns:**
- Represent expected API failures with `ApiError` factory methods from `app/server/src/lib/errors.ts`, then let the centralized Express error handler in `app/server/src/app.ts` choose status and response shape.
- In async Express handlers, catch and pass unexpected errors to `next(error)`, as in `app/server/src/routes/search.ts`; `app/server/src/lib/patchExpressAsyncErrors.ts` also patches asynchronous error propagation.
- Validate external input with Zod. Use `safeParse` when returning a local 400 response, as in `app/server/src/routes/search.ts`, or `parse` with an explicit `ZodError` branch, as in `app/server/src/routes/users/profile.ts`.
- On the web, throw after a non-OK response and preserve the server message when available, as in `app/web/lib/search/api.ts`.
- Use a typed domain error for session expiry and retry once after refresh, as implemented by `AuthExpiredError` and `apiFetch` in `app/web/lib/api-fetch.ts`.
- Error handling is not fully uniform: `app/server/src/routes/users/profile.ts` handles and logs errors locally, while `app/server/src/routes/search.ts` delegates them to `app/server/src/app.ts`.

## Logging

**Framework:** Pino on the server; browser-facing notifications use Sonner.

**Patterns:**
- Use the configured `logger` and `pinoHttpMiddleware` from `app/server/src/lib/logger.ts` for structured server logs and request correlation.
- Attach request context such as `requestId`, method, path, and operational status in the centralized handler at `app/server/src/app.ts`.
- Set log severity from response status through `customLogLevel` in `app/server/src/lib/logger.ts`.
- Some routes still call `console.log` and `console.error`, notably `app/server/src/routes/users/profile.ts`; this is current local-handler behavior rather than the centralized Pino pattern.
- Surface user-visible web failures with `toast` in client components such as `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`.

## Comments

**When to Comment:**
- Use short comments for domain intent, validation rationale, and non-obvious compatibility behavior, as in `app/server/src/routes/users/profile.ts` and `app/server/src/lib/logger.ts`.
- Use section comments to make long procedural modules scannable, as in `app/server/src/app.ts` and `app/server/src/lib/tests/scoring.test.ts`.
- Existing application comments are predominantly Russian, matching user-facing domain text in `app/server/src/routes/users/profile.ts` and `app/server/src/lib/tests/scoring.test.ts`.

**JSDoc/TSDoc:**
- Add JSDoc to public middleware and shared abstractions when parameters or usage need explanation; `validateUUID` in `app/server/src/middleware/validateParams.ts` includes `@param`, `@returns`, and `@example`.
- Most local helpers and React components rely on TypeScript signatures rather than JSDoc, as in `app/web/lib/search/api.ts` and `app/web/components/ui/date-picker.tsx`.
- Avoid broad suppressions. The existing `@ts-ignore` around request ID compatibility in `app/server/src/lib/logger.ts` is a localized exception.

## Function Design

**Size:** Keep reusable transformations small and pure, following `searchAll` in `app/web/lib/search/api.ts`, `isValidUUID` in `app/server/src/middleware/validateParams.ts`, and the helpers under `app/web/components/tests/attempt-review/attempt-review-utils.ts`. Route modules such as `app/server/src/routes/users/profile.ts` use inline handler closures for request-specific orchestration.

**Parameters:** Prefer typed object parameters when a function has several related inputs, as in `scoreQuestionByType` usage in `app/server/src/lib/tests/scoring.test.ts`; destructure React props at the component boundary, as in `app/web/components/ui/date-picker.tsx`.

**Return Values:** Give exported non-component functions explicit return types when they define a public contract, as in `searchAll` at `app/web/lib/search/api.ts`, `isApiError` at `app/server/src/lib/errors.ts`, and the public API in `packages/rbac/src/rbac.ts`. Allow inference for short local helpers and React components, as in `ProfilePanel` at `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`.

## Module Design

**Exports:** Use named exports for reusable helpers, types, and shared components, as in `app/web/lib/api-fetch.ts`, `app/server/src/lib/errors.ts`, and `packages/rbac/src/access.ts`. Use default exports for Next.js route/layout entries and Express router modules, as in `app/web/app/page.tsx` and `app/server/src/routes/search.ts`.

**Barrel Files:** Keep barrels at explicit package or feature boundaries. Current examples are `packages/rbac/src/index.ts`, `app/server/src/services/search/index.ts`, and `app/web/components/Search/index.ts`; most web helpers and server modules are imported directly.

---

*Convention analysis: 2026-07-27*

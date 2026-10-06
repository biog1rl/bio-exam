# Testing Patterns

**Analysis Date:** 2026-07-27

## Test Framework

**Runner:**
- No test runner is configured in `package.json`, `app/server/package.json`, `app/web/package.json`, or `packages/rbac/package.json`.
- Current test files are executable TypeScript assertion scripts. They can be invoked individually with the hoisted `tsx` binary supplied by `app/server/package.json`, but no package script discovers or aggregates them.
- Config: Not detected; there is no Jest, Vitest, Node test-runner, Playwright, or Cypress configuration under the repository root.

**Assertion Library:**
- Node's built-in `node:assert/strict` is imported by all 11 test files, including `app/server/src/lib/tests/scoring.test.ts` and `app/web/lib/auth/sessionCookie.test.ts`.
- The tests do not use `node:test`, `describe`, `it`, or `test`; assertions execute at module top level.

**Run Commands:**
```bash
# No all-tests command is defined in package.json
(cd app/server && ../../node_modules/.bin/tsx src/lib/tests/scoring.test.ts)  # Verified single server test
(cd app/web && ../../node_modules/.bin/tsx lib/auth/sessionCookie.test.ts)   # Verified single web test
# Watch and coverage commands are not configured
```

**Project Gate Status:**
- The root `package.json` exposes `build`, `dev`, `start`, `lint`, and `typecheck`, but no `test` script.
- `turbo.json` defines no `test` or coverage task, so tests are absent from the Turborepo task graph.
- No CI workflow is present under `.github/workflows/`; automated test execution is not detected.
- `yarn lint` invokes only the web lint script from `app/web/package.json`; it does not execute the assertion files.
- All 11 current `*.test.ts` files pass when invoked individually with the installed `tsx` binary, but this is an ad hoc verification rather than a repository gate.

## Test File Organization

**Location:**
- The repository contains 11 `*.test.ts` files totaling 862 lines.
- Server test-domain unit tests live beside their implementations in `app/server/src/lib/tests/`: `question-type-resolver.test.ts`, `scoring.test.ts`, and `telemetry.test.ts`.
- Server schema assertions are colocated with the schema in `app/server/src/schemas/tests.test.ts`.
- Web utility assertions are colocated with source in `app/web/lib/auth/*.test.ts` and `app/web/lib/mdx/normalizeSource.test.ts`.
- Web test-domain assertions live under `app/web/components/tests/` and `app/web/components/tests/attempt-review/`.
- `app/web/app/(internal)/(protected)/admin/tests/` is the product's admin-tests feature path, not a generic test root; its `lifecycle.test.ts` sits beside `lifecycle.ts`.
- No tests exist under `packages/rbac/src/`.

**Naming:**
- Use the `*.test.ts` suffix, as in `app/web/components/tests/telemetry.test.ts`.
- Test filenames usually mirror the implementation, as in `app/web/lib/auth/loginRedirect.ts` with `app/web/lib/auth/loginRedirect.test.ts`.
- A test may use a component-oriented name while exercising extracted pure helpers; `app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts` imports from `attempt-review-utils.ts` and does not render a component.
- No `*.spec.*`, `*.test.tsx`, or `__tests__/` naming pattern is present.

**Structure:**
```text
app/server/src/
├── lib/tests/
│   ├── scoring.ts
│   └── scoring.test.ts
└── schemas/
    ├── tests.ts
    └── tests.test.ts

app/web/
├── lib/auth/
│   ├── sessionCookie.ts
│   └── sessionCookie.test.ts
└── components/tests/
    ├── telemetry.ts
    ├── telemetry.test.ts
    └── attempt-review/
        ├── attempt-review-utils.ts
        └── attempt-review-utils.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
// app/web/lib/auth/loginRedirect.test.ts
import assert from 'node:assert/strict'

import { buildLoginRedirectPath } from './loginRedirect'

assert.equal(buildLoginRedirectPath('/profile/test-user'), '/login?callbackUrl=%2Fprofile%2Ftest-user')
```

**Patterns:**
- Import `assert` first, leave a blank line, then import the unit under test, as in `app/web/lib/mdx/normalizeSource.test.ts`.
- Define inline input constants immediately above the assertions that use them, as in `app/server/src/schemas/tests.test.ts` and `app/web/components/tests/telemetry.test.ts`.
- Exercise multiple cases sequentially at module scope; `app/server/src/lib/tests/scoring.test.ts` separates scoring domains with section comments.
- Use `assert.equal` for scalar results, `assert.deepEqual` for arrays/objects, `assert.match` for validation text, and `assert.ok` for predicates in `app/server/src/lib/tests/scoring.test.ts` and `app/server/src/lib/tests/question-type-resolver.test.ts`.
- There is no setup/teardown lifecycle. Each file constructs its own state and exits on the first thrown assertion.
- There are no named suites or named test cases; failure identity comes from the file, line number, and optional assertion message.

## Mocking

**Framework:** Not detected; no mocking library or test-runner mock API is imported by the 11 `*.test.ts` files.

**Patterns:**
```typescript
// app/web/lib/auth/sessionCookie.test.ts
const legacyCookieStore = {
	get(name: string) {
		if (name === 'bio-exam_session') return { value: 'legacy-token' }
		return undefined
	},
}
assert.equal(readSessionCookieValue(legacyCookieStore, 'bio_exam_session'), 'legacy-token')
```

**What to Mock:**
- No repository-wide mocking convention is established. The only test double pattern is a hand-written structural object for the cookie-store interface in `app/web/lib/auth/sessionCookie.test.ts`.

**What NOT to Mock:**
- Current tests call pure functions and Zod schemas directly without mocking internal collaborators, as shown by `app/server/src/lib/tests/scoring.test.ts`, `app/server/src/schemas/tests.test.ts`, and `app/web/components/tests/telemetry.test.ts`.
- Database, HTTP, browser, React, and Express behavior are not exercised by the current test files, so there is no established boundary-mocking pattern for those systems.

## Fixtures and Factories

**Test Data:**
```typescript
// app/server/src/schemas/tests.test.ts
const basePayload = {
	topicId: '11111111-1111-4111-8111-111111111111',
	title: 'Черновик теста',
	isPublished: false,
	showCorrectAnswer: true,
	questions: undefined,
}
```

**Location:**
- Fixtures are inline constants inside each `*.test.ts` file, such as `builtinTypesMap` in `app/server/src/lib/tests/scoring.test.ts`, `basePayload` in `app/server/src/schemas/tests.test.ts`, and `initial` in `app/web/components/tests/telemetry.test.ts`.
- No shared fixture directory, factory module, seeded test database, or global test setup file is detected.
- Production helper `createDefaultTestScoringRules` from `app/server/src/lib/tests/scoring.ts` is reused by `app/server/src/schemas/tests.test.ts`; it is application code in the tests domain rather than a test fixture factory.

## Coverage

**Requirements:** None enforced. No threshold, include/exclude policy, instrumentation dependency, or coverage artifact configuration appears in `package.json`, workspace package manifests, or `turbo.json`.

**View Coverage:**
```bash
# Not configured in package.json, app/server/package.json, app/web/package.json, or packages/rbac/package.json
```

## Test Types

**Unit Tests:**
- Pure scoring behavior is covered in `app/server/src/lib/tests/scoring.test.ts`.
- Runtime question-type validation is covered in `app/server/src/lib/tests/question-type-resolver.test.ts`.
- Zod payload validation is covered in `app/server/src/schemas/tests.test.ts`.
- Telemetry merge/update helpers are covered independently on server and web in `app/server/src/lib/tests/telemetry.test.ts` and `app/web/components/tests/telemetry.test.ts`.
- Auth URL/cookie helpers and MDX normalization are covered in `app/web/lib/auth/loginRedirect.test.ts`, `app/web/lib/auth/sessionCookie.test.ts`, and `app/web/lib/mdx/normalizeSource.test.ts`.
- Admin lifecycle and attempt-review transformations are covered in `app/web/app/(internal)/(protected)/admin/tests/lifecycle.test.ts` and `app/web/components/tests/attempt-review/*.test.ts`.

**Integration Tests:**
- Not used. Current tests do not initialize Express from `app/server/src/app.ts`, connect through `app/server/src/db/index.ts`, call HTTP endpoints under `app/server/src/routes/`, or mount React components from `app/web/components/`.

**E2E Tests:**
- Not used. No Playwright, Cypress, browser harness, or E2E configuration is present in the package manifests or repository configuration.

## Common Patterns

**Async Testing:**
```typescript
// No async test pattern is present in the current *.test.ts files.
// All assertions execute synchronously at module top level.
```

**Error Testing:**
```typescript
// app/server/src/schemas/tests.test.ts
const publishedWithoutQuestions = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [],
})

assert.equal(publishedWithoutQuestions.success, false)
if (publishedWithoutQuestions.success) {
	throw new Error('Published test without questions should be rejected')
}
```

- Use `safeParse` and assert the discriminant before inspecting Zod issues, as in `app/server/src/schemas/tests.test.ts`.
- Use `assert.match` when a validation helper returns an error string, as in `app/server/src/lib/tests/question-type-resolver.test.ts`.
- No rejected-promise or thrown-exception assertion helper is used in the current tests.

---

*Testing analysis: 2026-07-27*

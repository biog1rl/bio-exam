# Plan 003: Make authentication revocable and race-safe

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/{middleware/auth,routes/auth,services/rbac,lib/constants.ts,db} app/web/lib/auth packages/rbac`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001, 002
- **Category**: security
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

Revoked DB roles are unioned back from JWT claims for up to 30 days. Logout
does not revoke the access token, and concurrent refresh calls can rotate the
same token more than once. The Next app also owns a second auth/RBAC
implementation with different policy and another DB pool.

## Current state

- `session.ts` builds `new Set([...dbRoles, ...jwtRoles])`.
- Login signs access JWTs with the full default 30-day session lifetime.
- Refresh validation occurs before its transaction; cookies are set before
  rotation commits and the revoke update is not conditional.
- `app/web/lib/auth/server/getMeData.ts` independently verifies JWT, queries
  users/roles/grants, and creates a PostgreSQL pool while Express `/auth/me`
  already returns the canonical user/permission contract.
- Five failed passwords cause an attacker-triggerable 30-minute user lock.

## Scope

**In scope**: auth/session middleware and routes, refresh-token/session schema
and migrations, RBAC service, Next server auth adapter, auth integration tests.

**Out of scope**: external identity providers, UI redesign, unrelated RBAC
domain changes.

## Steps

1. Run GitNexus impact on every edited auth/RBAC symbol; warn before any
   HIGH/CRITICAL blast radius.
2. Make current DB roles authoritative whenever DB enforcement is active.
3. Introduce short-lived access tokens bound to a revocable server session
   family/version; revoke on logout and support password/admin revocation.
4. Atomically claim single-use refresh tokens, create successors, commit, then
   set cookies. Detect replay at family level.
5. Replace hard account lockout with shared progressive account+IP throttling
   and an operational recovery path.
6. Make Express `/auth/me` the one authorization boundary; remove the duplicate
   Next DB pool/policy after parity tests.

## Test plan and verification

- Integration cases: role removed after token issue; logout invalidates access;
  two concurrent refreshes yield exactly one successor; transaction failure
  sends no access cookie; throttling cannot cheaply lock a victim out; `/auth/me`
  parity for role/user overrides.
- `yarn verify` → exit 0.
- `gitnexus detect-changes --scope all` → only auth/RBAC flows plus tests/docs.

## STOP conditions

- Deployment cannot supply the required shared throttle/session store.
- A compatibility path would preserve 30-day bearer-token access.
- Next/Express auth responses cannot be made contract-compatible without a
  separately approved migration.


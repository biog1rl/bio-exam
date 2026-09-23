# Plan 006: Secure assets and user-directory privacy

> **Drift check**: `git diff --stat 29563ff..HEAD -- app/server/src/routes/docs/assets.ts app/server/src/routes/users packages/rbac app/web`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 001, 003
- **Category**: security
- **Planned at**: commit `29563ff`, 2026-07-27

## Why this matters

Any authenticated user can delete shared images; local fallback accepts textual
`images/` paths without resolved-path containment. Ordinary users also inherit
`users.read` and can enumerate up to 500 records including contact and account
metadata.

## Current state

- Asset delete has session auth only, prefix validation, then joins/deletes the
  unchecked suffix.
- Default `user` role receives `users.read`; the list DTO includes login,
  birthdate, phone, email, Telegram, roles, and state.

## Scope

**In scope**: asset upload/delete authorization and path normalization; RBAC
permission split; minimal/admin user DTOs; dependent screens and tests.

**Out of scope**: media-library redesign, storage-provider migration, public
profile feature work.

## Steps

1. Require explicit content-management permission for upload/delete.
   Normalize object names to `images/<generated-name>` and prove resolved local
   targets remain inside the image root before deletion.
2. Split minimal directory lookup from administrative inspection. Remove
   sensitive fields and broad list permission from ordinary users; migrate
   legitimate selectors to the minimal DTO.
3. Add path traversal, permission matrix, field-level response, and legacy path
   compatibility tests.

## Done criteria

- [ ] `../`, encoded traversal, absolute paths, and foreign storage prefixes
  cannot delete a file.
- [ ] Ordinary directory response contains only approved minimal fields.
- [ ] Admin screens retain required details through an admin permission.
- [ ] `yarn verify` exits 0.

## STOP conditions

- A production legacy path lies outside the normalized image namespace.
- A student workflow truly requires a sensitive field; report the exact caller
  rather than expanding the minimal DTO.


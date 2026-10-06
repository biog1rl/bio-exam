## Deferred Items

- Mobile layout has no visible sidebar trigger (found in 01-09)
  status: acknowledged
  **What:** below 1024 px the sidebar (`components/AppSidebar.tsx`, user menu with Профиль / Выйти in `components/nav-user.tsx`) is a closed Sheet, and `components/AppLayout/AppLayout.tsx` renders no `SidebarTrigger` (it exists only in `components/ui/sidebar.tsx`). A touch-only user cannot reach the profile or log out. The e2e flow 1 on `chromium-mobile` opens the Sheet with the app's own Ctrl+B shortcut (`openUserMenu` in `e2e/tests/auth.spec.ts`, with an `issue` annotation); switch it to the trigger once one exists.

- compare-schema-dump classifier cannot recognise multi-line Supabase function bodies (found in 01-12)
  status: acknowledged
  **What:** `classifyLines` in `scripts/compare-schema-dump.mjs` matches single lines, so the six `extensions.grant_pg_*` / `pgrst_*` / `set_graphql_placeholder` event-trigger functions in the live dump (218 lines of `$$ ... $$` bodies) come out as `реальное отличие` and need a manual reclassification (done in `01-SCHEMA-DIFF.md`). Teach it dollar-quoted spans (or whole-object matching of `CREATE FUNCTION extensions.*`) before reusing the script in Milestone 2.

- AuthProvider legacy cookie-migration effect double-fires /api/auth/refresh (found in 01-11)
  status: acknowledged
  **Closed:** 04-10 — the migration effect is removed from `AuthProvider.tsx` and the `addInitScript` workaround is removed from `newSessionContext` (`e2e/fixtures/exam.ts`).
  **What:** `components/providers/AuthProvider.tsx` runs a one-time "cookie migration" (`auth_refresh_cookie_migrated_v2` in localStorage) that POSTs `/api/auth/refresh` when the key is missing. The effect depends on `[me, refresh]` and re-runs before the key is written, so a profile that has cookies but no localStorage key (cleared storage, or a Playwright context built from a storageState) sends a second refresh with the already rotated refresh token and gets 401; the next write (saving a question) then failed. The e2e helper `newSessionContext` (`e2e/fixtures/exam.ts`) works around it by pre-setting the key with `addInitScript`; remove that once the effect is fixed (set the key before the request, or drop the migration).

- Digit-only answer keys are stored and returned as JSON numbers (found in 01-11)
  status: acknowledged
  **What:** saving `correct: "3142"` (sequence) or `"1"` (radio option id) through `POST/PATCH /api/tests/:id/questions` comes back from `GET /api/tests/by-slug/...` as the number `3142` / `1`. Scoring normalises numbers (`normalizeIdValue`, `normalizeDigitsSequence`), so results are right today, but strict string comparisons on keys would break. `e2e/tests/authoring.spec.ts` and `review.spec.ts` compare through `String(...)`. Decide the canonical storage type when the answer-key schema is reworked.

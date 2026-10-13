# Synthesis Summary

Entry point for `gsd-roadmapper`. Mode: new. Synthesized 2026-10-03.

## Document counts by type
- Total classified: 19
- ADR: 5 (all locked, all manifest precedence 0)
- SPEC: 13 (plans 001-010 precedence 3, plan 011 precedence 1, plans/beget-migration.md precedence 2)
- DOC: 1 (plans/README.md, precedence 4)
- PRD: 0
- UNKNOWN: 0 (plans 009 and 010 are medium confidence, not low, so they are not blockers)

## Decisions locked (5)
Detail: `/Users/kdvornichenko/bio-exam/.planning/intel/decisions.md`
- ADR-0001 Express owns the database and access policy; Next only shows UI (/Users/kdvornichenko/bio-exam/docs/adr/0001-express-owns-data-and-access-policy.md)
- ADR-0002 Exam domain logic lives in `packages/exam-core` (/Users/kdvornichenko/bio-exam/docs/adr/0002-shared-exam-core-package.md)
- ADR-0003 Verification before refactoring: Vitest, `yarn verify`, CI, Yarn only, Drizzle metadata first (/Users/kdvornichenko/bio-exam/docs/adr/0003-verification-before-refactoring.md)
- ADR-0004 File storage: one interface, two adapters (Supabase, local volume) (/Users/kdvornichenko/bio-exam/docs/adr/0004-storage-port-two-adapters.md)
- ADR-0005 Decompose by concept (question content, scored attempt, attempt lifecycle), replaces plan 010 step 3 (/Users/kdvornichenko/bio-exam/docs/adr/0005-decompose-by-concept.md)

## Requirements extracted (0)
Detail: `/Users/kdvornichenko/bio-exam/.planning/intel/requirements.md`. No PRD sources in the set; no REQ-IDs were derived from SPEC "Done criteria". The roadmapper should build scope from the plans' steps and acceptance gates in constraints.md and from plan 011 section 4 phase order.

## Constraints (27 entries)
Detail: `/Users/kdvornichenko/bio-exam/.planning/intel/constraints.md`
- Type breakdown: api-contract 9, nfr 7, protocol 7, schema 4
- Covers plans 001-010, plan 011 (summary of defects D1-D8, candidates C1-C8, section 4 phase order), beget-migration (5 topic entries plus summary), and one tooling-context entry (GitNexus removed 2026-10-02, CodeGraph in use, `codex-trash` replaced by plain deletion, Beget VPS target)
- Recommended sequencing source: plan 011 section 4 (Milestone 1 = phases 1-8, Milestone 2 = Beget migration after phases 4 and 7)

## Context topics (4)
Detail: `/Users/kdvornichenko/bio-exam/.planning/intel/context.md` (plans/README.md: execution order and status table, finding coverage, dependency notes, rejected/deferred findings)

## Cross-reference cycle check
No cycles. Graph built only from cross-refs resolving to one specific classified document; longest dependency chain 3 edges. Directory-level and source-code references (for example `docs/adr/`, `app/server/...`, `package.json`) create no edges.

## Conflicts
- Blockers: 0
- Competing variants (warnings): 0
- Auto-resolved (info): 12 (all ADR-over-SPEC or higher-precedence-SPEC resolutions; no locked-vs-locked contradiction)
- Detail: `/Users/kdvornichenko/bio-exam/.planning/INGEST-CONFLICTS.md`

## Status
READY: no blockers, no competing variants. Items the roadmapper should carry forward from the INFO bucket: plan 009 moves to phase 1 ahead of plan 002; plan 004 includes the scored-attempt module (C2); plan 005 is executed through the lifecycle module (C7); plan 010 step 3 is superseded and the router split follows C2/C3; Next auth files are deleted in phase 4; plan 001 must reconcile its "existing assertion tests" approach with ADR-0003's Vitest mandate.

## Files
- `/Users/kdvornichenko/bio-exam/.planning/intel/decisions.md`
- `/Users/kdvornichenko/bio-exam/.planning/intel/requirements.md`
- `/Users/kdvornichenko/bio-exam/.planning/intel/constraints.md`
- `/Users/kdvornichenko/bio-exam/.planning/intel/context.md`
- `/Users/kdvornichenko/bio-exam/.planning/INGEST-CONFLICTS.md`

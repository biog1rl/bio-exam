## Conflict Detection Report

Mode: new. Sources: 19 classified documents (5 ADR, 13 SPEC, 1 DOC). Checks run: LOCKED-vs-LOCKED ADR contradictions (none), PRD overlap (no PRD sources), SPEC/DOC vs ADR, SPEC vs SPEC by manifest precedence (plan 011 = 1, beget-migration = 2, plans 001-010 = 3, README = 4), UNKNOWN/low-confidence classifications (none; plans 009 and 010 are medium confidence and are not blockers), cycle detection (none). Merge-mode check against existing CONTEXT.md does not apply.

### BLOCKERS (0)

None.

### WARNINGS (0)

None.

### INFO (12)

[INFO] Auto-resolved: ADR-0005 > plan 010 step 3 (TestRunner four hooks) and router-slicing order
  Note: /Users/kdvornichenko/bio-exam/plans/010-module-decomposition.md step 3 splits `TestRunner` into session-persistence, telemetry, answer-state and submit hooks, and step 2 slices the admin router by route group. /Users/kdvornichenko/bio-exam/docs/adr/0005-decompose-by-concept.md (locked) states it replaces step 3 ("TestRunner не делится на четыре хука") and that router slicing happens after the "содержимое вопроса" and "оценённая попытка" modules. ADR wins. Synthesized intel treats plan 010 step 3 as superseded by the attempt-lifecycle module (plan 011 C7) and step 2 as sequenced after C2/C3. /Users/kdvornichenko/bio-exam/plans/README.md and plan 011 section C7 already state the same supersession.

[INFO] Auto-resolved: ADR-0003 + plan 002 step 3 > beget-migration on deleting `package-lock.json`
  Note: /Users/kdvornichenko/bio-exam/docs/adr/0003-verification-before-refactoring.md (locked) says Yarn 4 stays and `package-lock.json` is deleted; /Users/kdvornichenko/bio-exam/plans/002-dependency-security.md step 3 deletes it and adds a CI guard against a second lockfile. /Users/kdvornichenko/bio-exam/plans/beget-migration.md section 5 item 2 ("package-lock.json сохранить") and section 9 ("package-lock.json ... не удалять") keep it. By manifest precedence beget (2) alone would outrank plan 002 (3); the ADR (0) decides it: delete. Beget's keep-instruction is recorded as a preparation-phase scoping statement only.

[INFO] Auto-resolved: ADR-0001 > beget-migration section 3.4 on retaining the Next auth/DB files
  Note: /Users/kdvornichenko/bio-exam/docs/adr/0001-express-owns-data-and-access-policy.md (locked) requires deleting `getMeData`, `app/web/app/api/auth/me/route.ts` and the Next `pg` pool. /Users/kdvornichenko/bio-exam/plans/beget-migration.md section 3.4 allows the old files to be kept "без подключения к production". ADR wins: they are deleted. Ownership of the deletion is itself spread across plan 003 step 6 ("after parity tests"), plan 010 step 4 (final deletion) and plan 011 C6 (phase 4); the ADR plus plan 011 section 4 place it in phase 4 (auth).

[INFO] Auto-resolved: ADR-0004 > beget-migration section 3.5 on streaming ZIP export
  Note: /Users/kdvornichenko/bio-exam/docs/adr/0004-storage-port-two-adapters.md (locked) says streaming ZIP (plan 008) is implemented once inside the storage module, and /Users/kdvornichenko/bio-exam/plans/008-proven-performance.md step 4 requires a streamed archive. /Users/kdvornichenko/bio-exam/plans/beget-migration.md section 3.5 says "streaming добавлять при подтверждённой необходимости" (add only if necessity is confirmed). ADR wins: streaming stays in scope. Plan 008's 30 s / 1 GB Vercel motivation is moot after migration, but the ADR consequence still applies.

[INFO] Auto-resolved: ADR-0003 > plan 009 header, README table and plan 011 section 4 on phase ordering of plan 009 vs plan 002
  Note: ADR-0003 (locked) says plans 001 and 009 become the first phase and Drizzle metadata is restored before any new migration. /Users/kdvornichenko/bio-exam/plans/009-drizzle-metadata.md ("Depends on: plans 001, 002") and /Users/kdvornichenko/bio-exam/plans/README.md (009 depends on 001, 002) place 009 after the dependency upgrade in plan 002; /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md section 4 puts 009 in phase 1 and 002 in phase 2. ADR (and plan 011, precedence 1) win: 009 runs in phase 1 without waiting for 002. Synthesized constraints record the 009 dependency on 002 as overridden; the one-lockfile step moves into phase 1 (ADR-0003) although plan 002 step 3 also deletes `package-lock.json`.

[INFO] Auto-resolved: ADR-0005 > plan 004 "Out of scope" on scoring and attempt-review changes
  Note: /Users/kdvornichenko/bio-exam/plans/004-attempt-session-integrity.md lists "scoring rules, attempt-review presentation" as out of scope and has the STOP "Atomicity requires changing scoring semantics". /Users/kdvornichenko/bio-exam/docs/adr/0005-decompose-by-concept.md (locked) says the "оценённая попытка" module is built together with plan 004 because it changes what the submit transaction writes (scoring facts: key used, errors, per-part verdicts); plan 011 C2 adds a migration for old attempts. ADR wins on scope: the stored-scoring-facts change is in plan 004's phase. Scoring semantics themselves stay unchanged, so the STOP condition should not trigger on this alone.

[INFO] Auto-resolved: ADR-0005 > plan 005 execution path (client draft durability)
  Note: /Users/kdvornichenko/bio-exam/plans/005-client-draft-durability.md describes fixes inside TestRunner persistence helpers (steps 1 and 3) and the STOP "A fix would store answer content outside the existing scoped WAL key". ADR-0005 (locked) assigns the local draft format, telemetry and reset to a client attempt-lifecycle module, and plan 011 C7 says plan 005 steps 1 and 3 are executed through that module. ADR wins on structure. The WAL-key STOP condition remains a plan 005 gate and should be re-checked when the module defines the draft format.

[INFO] Auto-resolved: ADR-0003 > plan 001 on test runner and test-file count
  Note: /Users/kdvornichenko/bio-exam/docs/adr/0003-verification-before-refactoring.md (locked) mandates Vitest in all workspaces, root `yarn verify` and CI per pull request, and counts 12 `*.test.ts` files. /Users/kdvornichenko/bio-exam/plans/001-project-operating-baseline.md says "11 executable tests", wraps "existing top-level assertion tests without changing their semantics" and has the STOP "Any proposed test runner requires rewriting the existing test corpus". /Users/kdvornichenko/bio-exam/plans/beget-migration.md also counts 12 and says "Не придумывать root yarn verify без реализации". ADR wins: Vitest and `yarn verify` are required and the count is 12 (plan 001 was planned at 29563ff, 2026-07-27, earlier than the ADR). The plan 001 STOP condition may need revisiting when the existing node:assert scripts are adapted to Vitest; beget's CI gates become valid once `yarn verify` exists.

[INFO] Auto-resolved: ADR-0004 > beget-migration section 3.2 wording ("replace Supabase") and plan 006 placement of path containment
  Note: /Users/kdvornichenko/bio-exam/docs/adr/0004-storage-port-two-adapters.md (locked) requires one storage module with two adapters (Supabase now, local volume for VPS), with key normalization and containment inside the module and routes not touching `fs`. /Users/kdvornichenko/bio-exam/plans/beget-migration.md section 3.2 says "Заменить Supabase-вызовы локальным файловым provider-модулем" and section 1 assumption A1 targets full removal of Supabase at runtime; /Users/kdvornichenko/bio-exam/plans/006-assets-user-privacy.md step 1 implements containment in the asset routes while listing "storage-provider migration" as out of scope. ADR wins: both adapters exist behind one interface, the migration is enabling the second adapter, and containment (plan 006) is implemented once inside the module (plan 011 phase 7: C4 + C3 + plan 006). Beget's end state (no runtime Supabase use) is compatible once the local adapter is enabled.

[INFO] Auto-resolved: plan 011 (precedence 1) > README and per-plan "Depends on" headers on execution ordering
  Note: /Users/kdvornichenko/bio-exam/plans/README.md says "Execute in order unless dependencies say otherwise", lists 011 as depending only on 001, and plans 007 and 008 depend on 001-003 and 001-002. /Users/kdvornichenko/bio-exam/plans/011-architecture-deepening.md section 4 sets an 8-phase order (for example exam-core in phase 3 before auth in phase 4; plan 008 and the rest of plan 010 after phase 8) and sequences beget-migration as Milestone 2 after phases 4 and 7. Higher manifest precedence (1 vs 4 and 3) wins; hard "Depends on" prerequisites that are not overridden by an ADR remain valid.

[INFO] Note: factual discrepancy on router size, ADR value used
  Note: /Users/kdvornichenko/bio-exam/plans/010-module-decomposition.md states `routes/tests/index.ts` is 2,723 lines; /Users/kdvornichenko/bio-exam/docs/adr/0005-decompose-by-concept.md states 2 732 lines. The ADR figure takes precedence; neither affects any decision. Plan 011 itself asks that line numbers be re-verified before phase planning.

[INFO] Note: no PRD sources and no cross-reference cycles
  Note: The set contains 0 PRD-classified documents, so no competing-acceptance-variant check applied and 0 requirements were extracted (requirements.md is intentionally empty). The cross-reference graph (edges only between specific classified documents) is acyclic; the longest dependency chain is 3 edges (for example plan 010 to 009 to 002 to 001). Textual references between ADRs and plans (ADR-0001 to plan 003, ADR-0004 to plans 006/008, ADR-0005 to plan 010, ADR-0003 to plans 001/009) were also checked and form no cycle with plan 011 or the README.

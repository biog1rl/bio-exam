---
phase: 09-result-foundation-and-readers
plan: 01
subsystem: database
tags: [adr, postgres, foreign-keys, user-deletion]
requires: []
provides:
  - "ADR-0007: правило удаления пользователя для новых таблиц вехи"
  - "Тест-каталог внешних ключей на users по pg_constraint с LEGACY_EXCEPTIONS"
affects: [09-05, phase-10, phase-12, phase-13, phase-14, phase-15]
tech-stack:
  added: []
  patterns: ["каталог ограничений по pg_constraint вместо списка таблиц"]
key-files:
  created:
    - docs/adr/0007-user-deletion-rule.md
    - app/server/src/db/user-deletion-rule.test.ts
  modified:
    - AGENTS.md
    - .agents/skills/bio-exam-data/SKILL.md
decisions:
  - "Правило: данные ученика cascade, авторство для других SET NULL, историю сохраняет отключение пользователя"
  - "users.created_by записан единственным временным исключением до миграции 0026 (план 09-05)"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 12000
  tasks: 2
  commits: 0
---

# Phase 9 Plan 01: Правило удаления пользователя Summary

ADR-0007 и тест-каталог внешних ключей на `users` по `pg_constraint`: каждый ключ `cascade` или `set null`, единственное названное исключение `users.created_by` снимет миграция 0026 (09-05).

## Что сделано

- Task 1 (tracer): `app/server/src/db/user-deletion-rule.test.ts` строит каталог запросом к `pg_constraint` (`confrelid = 'users'`, `contype = 'f'`), проверки: (а) `confdeltype` из `c`/`n` вне `LEGACY_EXCEPTIONS`; (б) столбец с `n` допускает NULL; (в) запись исключения, ставшая соответствовать правилу, требует удаления из списка; (г) ключи на `test_attempts` и `test_sessions` тоже `c`/`n` (`test.each`).
- Task 2: поведенческий `describe` на `startAuthApp('test_user_deletion')`: удаление ученика с попыткой, сессией (создаются HTTP-кодом), назначением, группой и ролью стирает строки ученика; удаление администратора-автора обнуляет `tests.created_by` и `test_assignments.assigned_by`, тест и назначение остаются. ADR-0007, строка в таблице Routing `AGENTS.md`, раздел «Удаление пользователя» в навыке `bio-exam-data`.

## Каталог внешних ключей на users (после 0025)

| таблица | столбец | confdeltype |
| --- | --- | --- |
| answer_keys | created_by | n |
| auth_sessions | user_id | c |
| invites | created_by | n |
| invites | user_id | c |
| question_drafts | owner_id | c |
| question_types | created_by, updated_by | n |
| rbac_page_rules | updated_by | n |
| rbac_role_grants | updated_by | n |
| rbac_user_grants | updated_by | n |
| rbac_user_grants | user_id | c |
| refresh_tokens | user_id | c |
| student_groups | created_by, owner_id | n |
| teacher_topics | assigned_by | n |
| teacher_topics | teacher_id | c |
| test_assignments | assigned_by | n |
| test_assignments | user_id | c |
| test_attempts | user_id | c |
| test_question_type_overrides | created_by, updated_by | n |
| test_scoring_settings | updated_by | n |
| test_sessions | user_id | c |
| test_timer_settings | updated_by | n |
| tests | created_by, updated_by | n |
| topics | created_by | n |
| user_groups | user_id | c |
| user_roles | user_id | c |
| users | created_by | a (исключение LEGACY_EXCEPTIONS) |

## codegraph affected

`codegraph affected app/server/src/db/user-deletion-rule.test.ts` -> `app/server/src/db/user-deletion-rule.test.ts` (1 файл). `codegraph impact` символов не требовался: существующие символы не менялись.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/user-deletion-rule.test.ts`: 7 passed.
- `node scripts/check-docs-commands.mjs`: OK.
- `yarn verify`: `yarn verify: OK` (все 8 шагов passed).
- `09-plan-files.cjs check 09-01`: `09-01 changed only its files`.

## Deviations from Plan

None - plan executed exactly as written. Коммиты не создавались по правилу пользователя (коммитит ведущая сессия), поэтому `commits: 0`, а `plan_head_before` / `plan_head_after` не заполнены; изменения лежат в рабочем дереве.

## Known Stubs

None.

## Threat Flags

None.

## Файлы к коммиту

- `docs/adr/0007-user-deletion-rule.md` (новый)
- `app/server/src/db/user-deletion-rule.test.ts` (новый)
- `AGENTS.md`
- `.agents/skills/bio-exam-data/SKILL.md`

`docs/adr/0006-enforce-authorization-by-construction.md` не тронут (чужой неотслеживаемый файл).

## Self-Check: PASSED

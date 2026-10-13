---
phase: 05-attempt-integrity
plan: 01
subsystem: testing
tags: [vitest, characterization, known-defects, express, postgres, react]
status: complete
deferred_human_gate: false

requires:
  - phase: 04
    provides: "startAuthApp, call, seedUser (test-support/auth-app.ts), sessionCookieFor (test-support/http.ts)"
  - phase: 07-01
    provides: "порт хранилища и in-memory адаптер (services/storage/index.ts, adapters/memory.ts)"
  - phase: precondition
    provides: "services/access-policy/scope.ts (canReadTest, canReviewAttempt, testScope)"
provides:
  - "Помощник app/server/src/test-support/attempt-world.ts для тестов попытки через настоящий app.ts на test_*"
  - "attempt-known-defects.test.ts: семь ожидаемо падающих проверок D-21 с зелёной подготовкой и обычный тест повтора submit без утечки ключа"
  - "runnerResultCard — карточка результата вопроса TestRunner в чистой функции, красная проверка SCORE-04-zero-points-status"
affects: [05-04, 05-05, 05-06, 05-08, 05-09]

actuals:
  tokens: 5900
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "KNOWN_DEFECTS = new Set<string>([...]) + defectTest(id, title, fn): test.fails, пока id в множестве"
    - "Каждая красная проверка готовит свои тест и вопрос сама и имеет обычный тест той же подготовки"

key-files:
  created:
    - app/server/src/test-support/attempt-world.ts
    - app/server/src/routes/tests/attempt-known-defects.test.ts
    - app/web/components/tests/runner-result-card.ts
    - app/web/components/tests/runner-result-card.test.ts
  modified:
    - app/web/components/tests/TestRunner.tsx

key-decisions:
  - "Пакеты @bio-exam/rbac и @bio-exam/exam-core собраны в worktree (dist, в .gitignore) перед одиночным запуском vitest: без dist сервер не резолвит @bio-exam/rbac"
  - "В TestRunner карточка вычисляется один раз: const card = questionResult ? runnerResultCard(questionResult) : null, условие рендера questionResult && card (решение исполнителя, автономно; разметка и классы те же)"
  - "requirements-completed пуст: план только закрепляет дефекты, требования закрывают 05-04…05-09"

requirements-completed: []

duration: 15min
completed: 2026-10-04
---

# Phase 5 Plan 01: Характеризация попытки до изменений Summary

Семь ожидаемо падающих проверок ATT-01/ATT-02/ATT-04/SCORE-03 через настоящий `app.ts` на `test_*` с in-memory хранилищем 07-01, обычный тест повтора submit без утечки скрытого ключа и вынос карточки результата `TestRunner` в `runnerResultCard` с красной проверкой SCORE-04.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

- `app/server/src/test-support/attempt-world.ts` (новый)
- `app/server/src/routes/tests/attempt-known-defects.test.ts` (новый)
- `app/web/components/tests/runner-result-card.ts` (новый)
- `app/web/components/tests/runner-result-card.test.ts` (новый)
- `app/web/components/tests/TestRunner.tsx` (изменён)

## Предусловие

`scope ok`: `services/access-policy/scope.ts` есть, `index.ts` реэкспортирует `canReadTest`, `canReviewAttempt`, `testScope`; `services/storage/index.ts` и `adapters/memory.ts` есть. Отпечаток дерева до правок: `.planning/commit-snapshots/before-05-01/fingerprint.json` (0 путей, дерево было чистым).

## Задачи

### Task 1 (tracer): attempt-world и ATT-01-unassigned-start

- `attempt-world.ts` экспортирует `ATTEMPT_QUESTIONS` (radio, checkbox, matching, short_answer, sequence; ключи 'b', ['a','c'], {l1:r1,l2:r2,l3:r3}, 'Митоз', '2314'; `points: 1`), тип `AttemptWorld`, `seedAttemptWorld`, `seedStudent`, `createAttemptTest`, `addQuestion` (POST `/api/tests/:id/questions` от администратора, ожидает 201), `assignTest`, `insertOpenSession`, `startSession`, `saveDraft`, `submitAttempt`, `adminReview`, `countRows`.
- Без `vi.mock`, без оболочки `services/storage/storage`, без `DATABASE_URL`: файлы вопросов пишет и читает сам `app.ts` через in-memory адаптер.
- Tracer-гейт: файл тестов зелёный (1 passed, 1 expected fail) — неназначенный пользователь получает 200 на `/start`, сессия создаётся.

### Task 2: остальные шесть проверок и повтор submit

Итог файла: `Tests 8 passed | 7 expected fail (15)`.

Тело каждого submit — конверт `{ sessionId, clientAttemptId, answers }`; текущая `SubmitAnswersSchema` лишний `sessionId` отбрасывает.

Обычный тест «повтор submit с тем же clientAttemptId отдаёт то же тело и не раскрывает скрытый ключ» (sequence, ключ '2314', ответ '2315', `showCorrectAnswer: false`) зелёный: оба 200, тела равны, `"2314"` в кавычках не встречается, строка `test_attempts` одна.

### Task 3 (TDD): runnerResultCard

- RED: `runner-result-card.test.ts` написан первым, запуск падал на отсутствии модуля `./runner-result-card`.
- GREEN: `runner-result-card.ts` повторяет ветки TestRunner дословно; `TestRunner.tsx` рисует карточку через `card.className` и `card.label`. Итог: `Tests 3 passed | 1 expected fail (4)`.
- REFACTOR: не потребовался.

## KNOWN_DEFECTS

`attempt-known-defects.test.ts`: `ATT-01-unassigned-start`, `ATT-01-unassigned-patch`, `ATT-01-unassigned-submit`, `ATT-02-expired-restart`, `ATT-02-no-session`, `ATT-04-double-attempt`, `SCORE-03-d1-key-change` (проверка `known defects: 7`).

`runner-result-card.test.ts`: `SCORE-04-zero-points-status`.

Кто снимает: 05-04 — ATT-01 (три id), 05-05 — ATT-02-expired-restart, 05-06 — ATT-02-no-session и ATT-04-double-attempt, 05-08 — SCORE-03-d1-key-change, 05-09 — SCORE-04-zero-points-status.

## Проба «test.fails → test»

Каждый id по очереди убран из множества, файл запущен с `-t <id>`: подготовка прошла, упало утверждение о целевом поведении (строки по исходному файлу). Множество восстановлено, файл сверен с копией (`cmp`).

| id | Упавшее утверждение | Сообщение |
|----|---------------------|-----------|
| ATT-01-unassigned-start | `assert.equal(reply.status, 403)` (стр. 92) | Expected 403, Received 200 |
| ATT-01-unassigned-patch | `assert.equal(reply.status, 403)` (стр. 117) | Expected 403, Received 200 |
| ATT-01-unassigned-submit | `assert.equal(reply.status, 403)` (стр. 153) | Expected 403, Received 200 |
| ATT-02-expired-restart | `assert.notEqual(second.body.sessionId, firstSessionId)` (стр. 183) | Expected "actual" to be strictly unequal |
| ATT-02-no-session | `assert.equal(reply.status, 404)` (стр. 202) | Expected 404, Received 200 |
| ATT-04-double-attempt | `assert.equal(second.status, 409)` (стр. 239) | Expected 409, Received 200 |
| SCORE-03-d1-key-change | `assert.deepEqual(afterAttempt.results, beforeAttempt.results)` (стр. 286) | correctAnswer: 'a' вместо 'b' |
| SCORE-04-zero-points-status | `assert.equal(runnerResultCard(result).label, reviewLabel)` (стр. 43) | actual 'Верно', expected 'Без оценки' |

## CodeGraph (D-23)

- `codegraph impact startAuthApp`: auth-characterization.test.ts, auth-known-defects.test.ts, login-throttle.test.ts, me-requirePerm-parity.test.ts, refresh-rotation.test.ts, session-revocation.test.ts, access-routes.test.ts, storage-memory-default.test.ts. `startAuthApp` не менялся.
- `codegraph impact sessionCookieFor`: exam-flow.test.ts, uploads.test.ts. `sessionCookieFor` не менялся.
- `codegraph impact TestRunner`: TestPageClient (`app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx`), TestPage (`.../start/page.tsx`).
- `codegraph affected` по пяти файлам плана: attempt-known-defects.test.ts, TestRunner.tsx, runner-result-card.test.ts, runner-result-card.ts (индекс построен по основному дереву, новые файлы в нём ещё не учтены).

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-known-defects.test.ts`: `Tests 8 passed | 7 expected fail (15)`.
- `yarn workspace @bio-exam/server typecheck`: код 0, без `error TS`; `yarn workspace @bio-exam/web typecheck`: код 0.
- `rg` по оболочке хранилища и `vi.mock`: `no storage shell in phase 5 tests`.
- Acceptance по `vi.mock|DATABASE_URL` в `attempt-world.ts`: код 0.
- Проверка множества: `known defects: 7`.
- `yarn workspace @bio-exam/web vitest run components/tests/runner-result-card.test.ts`: `Tests 3 passed | 1 expected fail (4)`.
- `yarn verify`: первый прогон `FAILED at lint-typecheck-test` — таймаут 5000 мс в `src/routes/auth/session-revocation.test.ts` («смена пароля … password_change») при load average около 10 (параллельно идёт фаза 7); отдельный прогон этого файла — 11 passed; второй прогон `yarn verify: OK` (server `532 passed | 7 expected fail (539)`, web `457 passed | 1 expected fail (458)`). Запись в `deferred-items.md`.
- `yarn e2e --grep "@flow2"`: `6 passed` (setup ×4, chromium-desktop и chromium-mobile).
- Отпечаток: `05-01 changed only its files`.
- Комментариев в новых и изменённых файлах нет.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Сборка пакетов workspace в worktree**
- **Found during:** Task 1
- **Issue:** одиночный `vitest run` сервера падал с `Failed to resolve entry for package "@bio-exam/rbac"`: в свежем worktree нет `packages/*/dist`.
- **Fix:** `yarn workspace @bio-exam/rbac build` и `yarn workspace @bio-exam/exam-core build`; `dist` в `.gitignore`, в `git status` не виден.
- **Files modified:** нет (артефакты сборки).

**2. Решение исполнителя (автономно): форма вызова в TestRunner**
- `const card = questionResult ? runnerResultCard(questionResult) : null` рядом с `questionResult`, условие рендера `questionResult && card`. Разметка, классы и подписи те же.

## Known Stubs

Нет.

## Threat Flags

Нет: план добавляет только тесты, тестовый помощник и вынос чистой функции.

## Deferred human verification

- Только коммит пяти файлов плана; исполнитель не коммитил и не одобрял (правило пользователя).

## Self-Check: PASSED

- Пять файлов плана существуют в worktree (`git status`: 4 новых, 1 изменён).
- Коммиты: не выполнялись по правилу пользователя.

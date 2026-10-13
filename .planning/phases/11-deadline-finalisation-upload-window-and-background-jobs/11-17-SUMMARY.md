---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 17
subsystem: web/providers, web/attempt-lifecycle, web/lib/drafts, web/lib/session
tags: [PLAT-04, D-20, SEC-02, localStorage, logout, pagehide]
requires: [11-16, 11-13]
provides:
  - "Модуль user-storage.ts: префиксы ключей попытки, EnumerableStorage, clearUserAttemptStorage(storage, userId)"
  - "CLIENT_ATTEMPT_KEY_PREFIX в client-attempt-id.ts; attemptStorageKeys строит ключи от констант user-storage.ts"
  - "forgetUserQuestionDraftCopies(storage, userId) в question-draft-copy.ts"
  - "AuthProvider: явный выход стирает ключи пользователя, запись bio-exam:session-refresh и повторяет очистку на pagehide; другие вкладки делают то же по событию storage logout"
  - "SessionClient: после успешного logout 401 больше не уводит на /login?callbackUrl"
  - "e2e: выход со страницы теста оставляет localStorage без ключей шести префиксов пользователя и без bio-exam:session-refresh"
affects: [phase-11-verification]
tech-stack:
  added: []
  patterns: ["очистка по окончанию -${userId} с обходом storage.length/key(i) с конца, ошибки хранилища глотаются"]
key-files:
  created:
    - app/web/components/tests/attempt-lifecycle/user-storage.ts
    - app/web/components/tests/attempt-lifecycle/user-storage.test.ts
  modified:
    - app/web/components/tests/attempt-lifecycle/storage-keys.ts
    - app/web/components/tests/client-attempt-id.ts
    - app/web/lib/drafts/question-draft-copy.ts
    - app/web/lib/drafts/question-draft-copy.test.ts
    - app/web/components/providers/AuthProvider.tsx
    - app/web/lib/session/client.ts
    - app/web/lib/session/client.test.ts
    - e2e/tests/auth.spec.ts
key-decisions:
  - "Досылка неотправленных ответов перед выходом не делается: PLAT-04 требует очистки, а запрос после выхода всё равно уходит без сессии (POST /api/auth/logout отзывает её раньше pagehide); ответы, которые очередь успела отправить до выхода, на сервере, остальное стирается вместе с ключами. Если досылка понадобится, её место — шаг перед sessionClient.logout() в AuthProvider"
  - "Функция очистки вынесена в отдельный файл user-storage.ts без тяжёлых импортов (только ../client-attempt-id): AuthProvider входит в оболочку всех страниц, а storage-keys.ts тянет attempt-submit-flow с exam-core и слоем запросов"
  - "После успешного sessionClient.logout() клиент сессии помечает себя как ушедший (navigated = true): 401 запроса, который ушёл после выхода, не уводит на /login?callbackUrl и не перебивает переход на /login?loggedOut=1"
  - "id пользователя для очистки берётся из ref, обновляемого при смене me.id, и снимается до setMe(null)"
requirements-completed: [PLAT-04]
status: complete
metrics:
  duration: "~35 мин"
  completed: 2026-10-06
actuals:
  tokens: 2400
  tasks: 3
  commits: 0
plan_head_before: e74e42b117f505d54b7428da66bc7b8335311499
plan_head_after: e74e42b117f505d54b7428da66bc7b8335311499
---

# Phase 11 Plan 17: Очистка ключей пользователя при выходе (PLAT-04) Summary

Явный выход стирает в браузере WAL, кэш сессии, замороженные ответы, clientAttemptId, test-unsent и копии черновиков вопросов этого ученика (ключи с окончанием `-<userId>`) и запись `bio-exam:session-refresh`; очистка повторяется на `pagehide` и в других вкладках по событию `logout`; выход по 401 ключи не трогает.

## Решения плана

1. **Досылка перед выходом не делается.** PLAT-04 требует очистки, а запрос после выхода всё равно уходит без сессии: `POST /api/auth/logout` отзывает её раньше `pagehide`. Ответы, которые очередь успела отправить до выхода, на сервере; остальное стирается вместе с ключами (T-11-54, accept). Если досылка понадобится, её место — шаг перед `sessionClient.logout()` в `AuthProvider.logout`.
2. **Очистка в отдельном лёгком модуле.** `components/tests/attempt-lifecycle/user-storage.ts` импортирует только `../client-attempt-id`; `AuthProvider` берёт его прямым путём, не через `index.ts`. `storage-keys.ts` (тянет `attempt-submit-flow` с exam-core) в оболочку не попадает.

## Что сделано

- `client-attempt-id.ts`: `CLIENT_ATTEMPT_KEY_PREFIX = 'test-client-attempt-'`, `clientAttemptIdKey` строится от него.
- `user-storage.ts` (новый): `ATTEMPT_SESSION_KEY_PREFIX`, `ATTEMPT_WAL_KEY_PREFIX`, `ATTEMPT_FROZEN_KEY_PREFIX`, `ATTEMPT_UNSENT_KEY_PREFIX`, `EnumerableStorage`, `clearUserAttemptStorage(storage, userId)` — удаляет ключи пяти префиксов попытки с окончанием `-${userId}`, обход с конца, ошибки хранилища глотаются. Литералы префиксов теперь только здесь и в `client-attempt-id.ts`; `storage-keys.ts` своих литералов не держит.
- `question-draft-copy.ts`: `forgetUserQuestionDraftCopies(storage, userId)` — ключи `question-draft-wal-…-${userId}`.
- `AuthProvider.tsx`: `userIdRef` по `me?.id`; `clearUserBrowserStorage(id)` — `clearUserAttemptStorage`, `forgetUserQuestionDraftCopies`, `removeItem(SESSION_REFRESH_RECORD_KEY)` в `try`. В `logout` после успешного `sessionClient.logout()` и до `setMe(null)` и события `logout` — очистка и `window.addEventListener('pagehide', …, { once: true })`. Обработчик `storage` для ключа `logout` делает то же для id своей вкладки, затем `refresh()`. `redirectToLogin` (выход по 401) не тронут.
- `client.ts`: после успешного `logout()` — `navigated = true` (см. отклонение 1).
- Тесты: `user-storage.test.ts` (`test.each` по 10 ключам, включая `test-answers-wal-t1-u12` против `u1`, хранилище, бросающее на `key()`, прежние строки `attemptStorageKeys('t1','u1')`); `question-draft-copy.test.ts` (`test.each` `-u1`/`-u12`/`-u2`/чужой префикс, бросающее хранилище); `client.test.ts` (`test.each`: после успешного выхода 401 без навигации, после неудачного — навигация на `/login?callbackUrl=…`).
- e2e `auth.spec.ts`: «Студент для входа» входит через форму, админ (storageState) создаёт тест `logout-clear-<p>` с вопросом `short_answer`; ученик на `/start` вводит ответ, ждёт PATCH 200 и ключ `test-answers-wal-<testId>-<userId>`; тест дописывает ключи `test-frozen-`, `test-client-attempt-`, `test-unsent-`, `question-draft-wal-` с `-<userId>`, запись `bio-exam:session-refresh` и чужой ключ `…-<userId>0`; выход через меню; на `/login` нет ключей шести префиксов с `-<userId>`, нет `bio-exam:session-refresh`, чужой ключ на месте; `finally` — `deleteOwnTest`.

## Ключи localStorage в e2e (chromium-mobile, прогон 1 после правки)

До выхода:
```
bio-exam:session-refresh
question-draft-wal-e2e-<userId>
test-answers-wal-<testId>-<userId>
test-answers-wal-<testId>-<userId>0
test-client-attempt-<testId>-<userId>
test-frozen-<testId>-<userId>
test-session-<testId>-<userId>
test-unsent-<testId>-<userId>
```
После выхода на `/login`:
```
test-answers-wal-<testId>-<userId>0
```
На desktop то же. `test-session-` и `test-answers-wal-` пишет сама страница теста, остальные ключи e2e дописывает, чтобы проверка шести префиксов и записи координации не была пустой.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Выход со страницы теста уводил на /login?callbackUrl вместо /login?loggedOut=1**
- **Found during:** Task 1 (tracer e2e, chromium-mobile)
- **Issue:** `setMe(null)` в `logout` размонтирует `AttemptRunner` (`TestRunner.tsx:93`, `if (!me) return …`), его очистка досылает телеметрию. Трейс: `15:25:12.901 POST /api/auth/logout 200` → `12.916 GET /login?loggedOut=1` (отменён, статус −1) → `12.918 PATCH …/answers 401` (тело `{"telemetry":…}`) → `12.924 POST /api/auth/refresh 401` → `redirectToLogin` → `window.location.assign('/login?callbackUrl=%2Ftests%2F…%2Fstart')`. Второй переход перебивает переход выхода: нет «Вы вышли из аккаунта», а следующий ученик после входа попадает на тест предыдущего. На desktop в первом прогоне гонку выиграл переход выхода. Ошибка была до плана, её открыл tracer-сценарий плана.
- **Fix:** `createSessionClient.logout()` после успешного ответа ставит `navigated = true`; 401 после выхода бросает `AuthExpiredError` без навигации. Порядок теперь: очистка → `setMe(null)` → размонтирование модуля попытки (перезапись WAL, PATCH 401 без перехода) → `assign(LOGGED_OUT_PATH)` → `pagehide` → повторная очистка слушателем `once` (слушатель модуля к этому моменту снят при размонтировании).
- **Files modified:** `app/web/lib/session/client.ts`, `app/web/lib/session/client.test.ts` — вне `files_modified` плана; сверка `11-plan-files.cjs check 11-17` у ведущей сессии покажет эти два файла.
- **Verification:** `client.test.ts` 45 passed; `yarn e2e tests/auth.spec.ts` два прогона подряд 24 passed.

**2. Режим worktree**
- `codegraph impact`/`affected` запускались по индексу основного checkout (в worktree нет `.codegraph/`), только чтение.
- `11-plan-files.cjs check 11-17` не запускался (правило режима worktree); коммитов нет.

`scripts/editor-bundle-budget.json` не менялся.

## Проверки

| Проверка | Итог |
|---|---|
| `node --test scripts/draft-durability-guards.test.mjs` | 7 pass, 0 fail |
| `yarn workspace @bio-exam/web typecheck` | OK |
| `yarn workspace @bio-exam/web lint` | OK (только прежние предупреждения в чужих файлах) |
| `yarn workspace @bio-exam/web vitest run …/user-storage.test.ts lib/drafts/question-draft-copy.test.ts` | 2 files, 25 passed |
| `yarn workspace @bio-exam/web vitest run lib/session/client.test.ts` | 45 passed |
| `yarn workspace @bio-exam/web test` | до: 98 files / 1545 tests; после: 99 files / 1563 tests, все passed |
| `yarn workspace @bio-exam/web build && yarn editor:budget` | OK (числа ниже) |
| `yarn e2e tests/auth.spec.ts` | до правки client.ts: 23 passed, 1 failed (mobile, отклонение 1); после: 24 passed ×2 |
| `yarn e2e tests/auth.spec.ts tests/session.spec.ts tests/answer-durability.spec.ts tests/question-draft-durability.spec.ts` | 58 passed |
| `yarn format:check` | OK |
| `yarn verify` | `yarn verify: OK` (все шаги passed) |

### Бюджет редактора (первая загрузка, оба маршрута одинаково)

| | raw | gzip |
|---|---|---|
| Бюджет | 2 732 396 | 769 896 |
| До плана | 2 607 846 | 730 056 |
| После плана | 2 609 586 | 730 268 |
| Прирост | +1 740 | +212 |

### codegraph

- `impact logout`: `AuthProvider::logout` → `AuthProvider`, `AppLayout`, `editor.ssr.test.ts`; `createSessionClient::logout` → `createSessionClient`, `client.test.ts`.
- `impact attemptStorageKeys`: 18 символов — `testing.ts` (`KEYS`, `presentKeys`, `seededStorage`, `setupLifecycle`…), `lifecycle*.test.ts`, `wal.test.ts`.
- `impact clientAttemptIdKey`: `client-attempt-id.test.ts`, `storage-keys.ts`, `testing.ts`, `lifecycle.ts`.
- `impact createSessionClient`: `sessionClient`, `apiFetch`, `AuthProvider.tsx`, `client.test.ts`, `refresh-coordinator.test.ts`.
- `affected` по `storage-keys.ts`, `client-attempt-id.ts`, `question-draft-copy.ts`: 13 файлов (`lib/drafts/*.test.ts`, `test-editor-api.test.ts`, `scroll-memory.test.ts`, `unsavedChanges.store.test.ts` и др.); с `AuthProvider.tsx` и `client.ts` — 183, из них 60 в `app/web` (через `apiFetch`). Весь web-набор и `yarn verify` прогнаны.

## Threat Flags

Нет новой поверхности: правки только в клиентском хранилище и навигации после выхода.

## Файлы к коммиту

```
 M app/web/components/providers/AuthProvider.tsx
 M app/web/components/tests/attempt-lifecycle/storage-keys.ts
 M app/web/components/tests/client-attempt-id.ts
 M app/web/lib/drafts/question-draft-copy.test.ts
 M app/web/lib/drafts/question-draft-copy.ts
 M app/web/lib/session/client.test.ts
 M app/web/lib/session/client.ts
 M e2e/tests/auth.spec.ts
?? app/web/components/tests/attempt-lifecycle/user-storage.test.ts
?? app/web/components/tests/attempt-lifecycle/user-storage.ts
?? .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-17-SUMMARY.md
```

## Self-Check: PASSED

- Созданные файлы на месте: `user-storage.ts`, `user-storage.test.ts`, `11-17-SUMMARY.md`.
- Коммитов нет по правилу фазы (HEAD = e74e42b).

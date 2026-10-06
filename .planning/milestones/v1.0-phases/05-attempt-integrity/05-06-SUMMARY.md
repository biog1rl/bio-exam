---
phase: 05-attempt-integrity
plan: 06
subsystem: api
tags: [express, drizzle, postgres, attempts, idempotency, concurrency, exam-core, nextjs, vitest]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-03
    provides: "миграция 0022: closed_at, close_reason, test_attempts.session_id, уникальность одной попытки на сессию; 0023: results_version"
  - phase: 05-04
    provides: "checkAttemptAccess на submit"
  - phase: 05-05
    provides: "sessions.ts: условие просрочки в SQL, атомарный /start, startAuthApp(prefix, { env })"
  - phase: 07-01
    provides: "in-memory адаптер хранилища в тестах"
provides:
  - "exam-core: SubmitAttemptRequestSchema, SubmitAttemptErrorSchema, SUBMIT_ERROR_CODES, ATTEMPT_GRACE_PERIOD_MINUTES, типы SubmitAttemptRequest, SubmitAttemptError"
  - "services/attempt-sessions/submit.ts: precheckSubmit, closeExpiredSession, submitAttempt"
  - "services/scored-attempt/index.ts: readSubmittedResult"
  - "web: client-attempt-id.ts (clientAttemptIdKey, resolveClientAttemptId, forgetClientAttemptId); submitPublicTestAnswers(testId, request)"
  - "attempt-submit.test.ts; строки submit в attempt-races.test.ts и attempt-time-limit.test.ts"
affects: [05-07, 05-09, 05-10, 05-11, 07]

estimate:
  tokens: 100000
  tasks: 4
actuals:
  tokens: 15100
  tasks: 4
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Submit: SubmitAttemptRequestSchema → checkAttemptAccess → precheckSubmit (без блокировок, просрочка от now() момента прихода) → оценка вне транзакции → submitAttempt (FOR UPDATE, проверка только сдачи и закрытия, INSERT … ON CONFLICT DO NOTHING, UPDATE ровно этой сессии) → readSubmittedResult"
    - "Конфликт (user_id, client_attempt_id) с попыткой другой сессии: внутренний ClientAttemptConflict откатывает транзакцию, снаружи { kind: 'conflict', attemptId }"
    - "Ответ 200 всегда читается из сохранённой строки test_attempts, и при первой отправке, и при повторе"
    - "Клиент: clientAttemptId хранится в localStorage под test-client-attempt-<testId>-<userId> вместе с sessionId"

key-files:
  created:
    - app/server/src/services/attempt-sessions/submit.ts
    - app/server/src/services/scored-attempt/index.ts
    - app/server/src/routes/tests/attempt-submit.test.ts
    - app/web/components/tests/client-attempt-id.ts
    - app/web/components/tests/client-attempt-id.test.ts
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/attempt-result.test.ts
    - scripts/check-exam-core-dist.mjs
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/server/src/services/attempt-sessions/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/routes/tests/attempt-races.test.ts
    - app/server/src/routes/tests/attempt-time-limit.test.ts
    - app/server/src/routes/tests/attempt-known-defects.test.ts
    - app/web/lib/tests/api.ts
    - app/web/components/tests/TestRunner.tsx

key-decisions:
  - "Task 1 (tracer): submitAttempt сразу умеет replayed (сданная сессия с тем же clientAttemptId), иначе гейт Task 1 с повтором в exam-flow.test.ts был бы красным; конфликт, закрытие и предпроверка добавлены в Task 2"
  - "Нормализация close_reason (NULL или иное значение → expired) сделана в модуле submit.ts (closeReasonOf), маршрут отображает superseded → 404, остальное → 422 одной функцией rejectClosedSession"
  - "sessionExpired из sessions.ts экспортирован для submit.ts (не через index.ts модуля): одно условие просрочки на /start и submit"
  - "Сданная сессия без attempt_id: предпроверка даёт 409 с attemptId null, транзакция даёт conflict с attemptId null"

requirements-completed: [ATT-02, ATT-04]

duration: 25min
completed: 2026-10-04
---

# Phase 5 Plan 06: Конверт submit, атомарная и идемпотентная отправка попытки Summary

Submit принимает конверт `{ sessionId, clientAttemptId, answers, telemetry? }` из `exam-core` и сдаёт ровно указанную сессию одной транзакцией с `FOR UPDATE`. Просрочку решает предпроверка на входе. Повтор с тем же `clientAttemptId` отдаёт тело, прочитанное из сохранённой строки. Другой `clientAttemptId` получает 409 `ATTEMPT_ALREADY_SUBMITTED` с id первой попытки. Web шлёт конверт с одним `clientAttemptId` на сессию.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

Новые:
- `app/server/src/services/attempt-sessions/submit.ts`
- `app/server/src/services/scored-attempt/index.ts`
- `app/server/src/routes/tests/attempt-submit.test.ts`
- `app/web/components/tests/client-attempt-id.ts`
- `app/web/components/tests/client-attempt-id.test.ts`

Изменённые:
- `packages/exam-core/src/attempt-result.ts`
- `packages/exam-core/src/index.ts`
- `packages/exam-core/src/attempt-result.test.ts`
- `scripts/check-exam-core-dist.mjs`
- `app/server/src/services/attempt-sessions/sessions.ts`
- `app/server/src/services/attempt-sessions/index.ts`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/routes/tests/exam-flow.test.ts`
- `app/server/src/routes/tests/attempt-races.test.ts`
- `app/server/src/routes/tests/attempt-time-limit.test.ts`
- `app/server/src/routes/tests/attempt-known-defects.test.ts`
- `app/web/lib/tests/api.ts`
- `app/web/components/tests/TestRunner.tsx`

Ровно 18 файлов плана.

## Предусловие и отпечаток

Отпечаток до правок: `.planning/commit-snapshots/before-05-06/fingerprint.json` (`fingerprint 05-06: 0 paths`, дерево чистое после f1f9c68).

## Задачи

### Task 1 (tracer): конверт, web, захват сессии

- `exam-core/attempt-result.ts`:
  - `ATTEMPT_GRACE_PERIOD_MINUTES = 2`;
  - `SUBMIT_ERROR_CODES` с кодами `ATTEMPT_ALREADY_SUBMITTED` и `TIME_EXPIRED`;
  - `SubmitAttemptRequestSchema`: `sessionId` uuid, `clientAttemptId` uuid, `answers` с ключами uuid, `telemetry` необязательна;
  - `SubmitAttemptErrorSchema` и типы `SubmitAttemptRequest`, `SubmitAttemptError`.
- Экспорт из `index.ts`; четыре имени добавлены в `EXPECTED_EXPORTS`, всего 61.
- Тесты пакета:
  - полный конверт принимается, `telemetry` необязательна, лишние поля отбрасываются;
  - отказ без `sessionId`, без `clientAttemptId`, без `answers`, с не-uuid в `sessionId`, `clientAttemptId` или ключе `answers`;
  - схема ошибки принимает оба кода и `attemptId: null` и отклоняет `TIME_EXPIRED_ALREADY_SUBMITTED`.
- `sessions.ts`: локальная `GRACE_PERIOD_MINUTES` заменена импортом `ATTEMPT_GRACE_PERIOD_MINUTES`, реэкспорт из `index.ts` модуля убран. Условие просрочки не менялось, `sessionExpired` экспортирован для `submit.ts`.
- `submit.ts`, `submitAttempt` в `db.transaction`:
  - выборка сессии по `id`, `testId`, `userId` с `.for('update')`;
  - для открытой сессии `INSERT test_attempts` с `sessionId`, `clientAttemptId`, `resultsVersion` и телеметрией `mergeTelemetryMaps(черновик строки, telemetry)` (NULL при пустой карте);
  - затем `UPDATE` ровно этой сессии: `submitted_at = now()`, `attempt_id`, черновик NULL.
- `scored-attempt/index.ts`: `readSubmittedResult(attemptId)` читает строку `test_attempts` и возвращает `SubmitResultSchema.parse(...)` (прежняя форма ответа).
- `public.ts`, POST `/tests/:id/submit`: разбор конверта, затем `checkAttemptAccess`, затем блок оценки (перенесён без изменения расчёта), затем `submitAttempt` с `resultsVersion: 1`, затем `readSubmittedResult`. Удалены:
  - `SubmitAnswersSchema` и `GRACE_PERIOD_MINUTES`;
  - поиск последней сессии пары и ветка «без сессии принимается»;
  - проверка лимита на JS-часах и `TIME_EXPIRED_ALREADY_SUBMITTED`;
  - вставка с `onConflictDoNothing`, выборка повтора, закрытие всех открытых сессий пары;
  - неиспользуемые импорты: `mergeTelemetryMaps`, `SubmitResultSchema`, `isNull`, `testSessions`, `ApiError`.
- `exam-flow.test.ts`:
  - помощник `submit` без `sessionId` сначала вызывает `/start`, `clientAttemptId` по умолчанию `crypto.randomUUID()`;
  - идемпотентность сравнивает тела целиком, проверяет одну строку по `clientAttemptId` и одну по `session_id`;
  - сквозной тест и тест черновика проверяют `session_id` попытки;
  - шапка с `vi.hoisted`/`vi.mock` не тронута.
- Web:
  - `client-attempt-id.ts` и тест (7 случаев: та же сессия, другая сессия, битый JSON, запись без id, `forget`, uuid по умолчанию, ключ);
  - `api.ts`: `submitPublicTestAnswers(testId, request: SubmitAttemptRequest)`, генерация id удалена;
  - `TestRunner.tsx`, `doSubmit`: без сессии вызывает `startTestSession`, `setSession` и запись `sessionKey`, без `hydrateFromServerSession`, поэтому черновик сервера не подмешивается в ответы экрана;
  - `clientAttemptId` через `resolveClientAttemptId`, `forgetClientAttemptId` после успеха и в `handleRetake`;
  - 409 сравнивается с `SUBMIT_ERROR_CODES.alreadySubmitted`, тексты диалога прежние.
- Гейт Task 1:
  - exam-core: `Tests 33 passed`, `exam-core dist OK … 61 экспортов`;
  - `exam-flow` и матрица доступа: `Test Files 2 passed`, `Tests 85 passed (85)`;
  - web: `client-attempt-id` 7 passed, typecheck код 0, без `error TS`;
  - acceptance: `crypto.randomUUID` в `api.ts` нет, `TIME_EXPIRED_ALREADY_SUBMITTED` в `public.ts` нет.
- Tracer-гейт: проверки пройдены повторно, расширение продолжено.

### Task 2 (TDD): идемпотентность, 409, 422, предпроверка

- RED: тесты написаны до `precheckSubmit`, `closeExpiredSession` и исходов `conflict`/`closed`. Прогон четырёх файлов дал `Tests 8 failed | 31 passed | 1 expected fail (40)`. Упали:
  - 409 той же сессии с другим `clientAttemptId`;
  - 409 при повторе `clientAttemptId` в новой сессии (500 на уникальном индексе);
  - 422 для сессии, закрытой как expired;
  - 422 на 13 минутах;
  - две строки «между предпроверкой и транзакцией» (`precheckSubmit is not a function`);
  - `ATT-04-double-attempt`;
  - гонка с разными `clientAttemptId`.
- `ATT-02-no-session` позеленел уже в Task 1: случайный `sessionId` даёт 404.
- GREEN:
  - `precheckSubmit` читает сессию пары с `leftJoin` попытки и условием `sessionExpired(timeLimitMinutes)`. Порядок исходов: `not_found` → `submitted` (`sameClient` по `client_attempt_id` попытки) → `closed` → `expired` → `open`.
  - `closeExpiredSession` выполняет условный `UPDATE` открытой сессии.
  - `submitAttempt` после `FOR UPDATE`: `not_found`; сдана → `replayed` или `conflict`; закрыта → `closed` с `reason`. Условия по времени в транзакции нет.
  - `INSERT … ON CONFLICT DO NOTHING` без строки ищет попытку по `(user_id, client_attempt_id)`: найдена → `ClientAttemptConflict` (откат) → `conflict`, не найдена → `Error`.
- Маршрут:
  - `not_found` → 404 `{ error: 'Session not found' }`;
  - `submitted` и `sameClient` → 200 из сохранённой строки без оценки;
  - иначе `submitted` → 409;
  - `closed` → `rejectClosedSession`: superseded → 404, иначе 422;
  - `expired` → `closeExpiredSession` и 422;
  - исходы `submitAttempt` отображаются теми же функциями.
- Тесты:
  - `attempt-submit.test.ts` (`test_attempt_submit`): 400 ×3; 404 на случайную сессию, сессию одноклассника (назначен, чтобы ответ шёл не из доступа) и свою сессию другого теста; повтор с равными телами, состояние сессии, черновик NULL, `session_id`, `client_attempt_id`, `results_version = 1`; 409 той же сессии; 409 при `clientAttemptId` s1 в s2, s2 открыта; superseded → 404; закрытая expired → 422.
  - `attempt-time-limit.test.ts`: 11 минут → 200; 13 минут → 422, `closed_at`, `close_reason = 'expired'`, попытки нет, повторный submit → 422, `/start` → новая сессия; без лимита 10 дней → 200. На уровне модуля: «оценка дольше остатка льготы» → `created`, `close_reason` NULL; «закрыта параллельным /start» → `{ kind: 'closed', reason: 'expired' }`, попытки нет.
  - `attempt-races.test.ts`: 8 параллельных submit с одним id × 5 раундов — все 200, тела равны, одна попытка; 8 с разными id × 5 раундов — один 200, семь 409 с его `attemptId`, одна попытка.
- `KNOWN_DEFECTS = ['SCORE-03-d1-key-change']`.
- Проверки Task 2:
  - `src/routes/tests`: `Test Files 7 passed (7)`, `Tests 163 passed | 1 expected fail (164)`;
  - `known defects: 1`;
  - `no storage shell in phase 5 tests`;
  - `expiry decided at entry`.

### Task 3: гейты

- `codegraph affected` — ниже.
- `yarn verify: OK`, все шаги `passed`:
  - server `587 passed | 1 expected fail (588)`;
  - web `509 passed | 1 expected fail (510)`;
  - exam-core `510 passed`;
  - rbac `2 passed`.
- `yarn e2e`: `132 passed`, код 0. `✘` только у `review.spec.ts:303` «D1 — fixed in Phase 5 (SCORE-03) … @known-defect» на chromium-desktop и chromium-mobile. Это ожидаемое падение `test.fail` (D-24).
- Отпечаток: `05-06 changed only its files`.
- Форматирование: `yarn oxfmt` по 18 файлам плана, `oxfmt --check` чистый.

### Task 4: [Deferred] подтверждение контракта

Не выполнялась, перенесена в `## Deferred human verification`.

## Требования

- ATT-02 закрыт: submit без точной открытой сессии отклоняется, в том числе для теста с лимитом.
- ATT-04 закрыт: одна транзакция захватывает ровно эту сессию, повторы и параллельные отправки дают одну попытку и одинаковый ответ, `clientAttemptId` живёт весь цикл повторов.
- ATT-06 закрыт в части submit: контракт, гонки и лимит идут на `test_*` в `yarn verify`. Остаток ATT-06 закрывает 05-11.

## KNOWN_DEFECTS

`attempt-known-defects.test.ts`: только `SCORE-03-d1-key-change`. `ATT-02-no-session` и `ATT-04-double-attempt` стали обычными зелёными тестами.

## Затронутые символы `public.ts` (для слияния с фазой 7)

- Импорты:
  - из `@bio-exam/exam-core` убраны `mergeTelemetryMaps` и `SubmitResultSchema`, добавлены `SUBMIT_ERROR_CODES` и `SubmitAttemptRequestSchema`;
  - из `drizzle-orm` убран `isNull`, из `db/schema.js` — `testSessions`, удалён импорт `ApiError`;
  - из `services/attempt-sessions/index.js` добавлены `closeExpiredSession`, `precheckSubmit`, `submitAttempt`, `type SessionCloseReason`;
  - новый импорт `readSubmittedResult` из `services/scored-attempt/index.js`.
  - Импорт `storageService` из `services/storage/storage.js` не тронут.
- Удалены константы `SubmitAnswersSchema` и `GRACE_PERIOD_MINUTES`.
- Новые функции рядом с `denyAttemptAccess`: `sessionNotFound`, `attemptAlreadySubmitted`, `timeExpired`, `rejectClosedSession`.
- Обработчик POST `/tests/:id/submit` переписан:
  - последовательность: разбор конверта → доступ → `precheckSubmit` → оценка → `submitAttempt` → `readSubmittedResult`;
  - блок оценки с чтением пояснения перенесён без изменения расчёта;
  - `buildQuestionMarkdownCandidates` и `readFirstMarkdown` не тронуты.
- Не тронуты: остальные маршруты, `SaveDraftAnswerSchema`, предупреждение линтера о неиспользуемом `appSettings` (было до плана).

## CodeGraph (D-23)

В worktree нет `.codegraph/`, поэтому команды выполнены в основном дереве по индексу, собранному до фазы 5. Новых файлов плана в индексе нет.

- `codegraph impact submitPublicTestAnswers`: `api.ts:118`; `TestRunner.tsx` (`doSubmit:463`, `TestRunner:145`, `handleSubmit:600`).
- `codegraph impact SubmitResultSchema`: `attempt-result.ts:15`, `attempt-result.test.ts`, `exam-core/index.ts`, `routes/tests/public.ts`, `routes/index.ts`. После плана схема используется в `scored-attempt/index.ts`, а не в `public.ts`.
- `codegraph impact TestRunner`: `TestRunner.tsx:145`; `start/TestPageClient.tsx` (`TestPageClient:14`); `start/page.tsx` (`TestPage:7`).
- `codegraph affected` по 13 файлам плана, которые есть в индексе, дал 21 файл:
  - server: `question-type-resolver.ts`, `attempt-known-defects`, `attempt-races`, `attempt-time-limit`, `exam-flow`, `public.ts`;
  - web: `QuestionEditorPageClient.tsx`, `QuestionEditor.tsx`, `question-validation.ts`, `admin/tests/types/index.ts`, `TestRunner.tsx`, `QuestionAnswerReview.tsx`, `attempt-review-utils.ts`, `lib/tests/api.ts`, `lib/tests/types.ts`;
  - exam-core: `answer.test.ts`, `attempt-result.test.ts`, `authoring.test.ts`, `invariants.test.ts`, `review.test.ts`, `scoring.test.ts`.
  - Все тесты из этого списка прогнаны в `yarn verify` и зелёные; web-компоненты покрыты typecheck и `yarn e2e`.

## Deviations from Plan

### Решения исполнителя (автономно)

1. **`replayed` в Task 1.** План относит исходы кроме `created` к Task 2, но гейт Task 1 запускает обновлённый тест идемпотентности `exam-flow.test.ts`. Поэтому `submitAttempt` в Task 1 уже возвращал `replayed` для сданной сессии с тем же `clientAttemptId`, остальные состояния давали `not_found` (404). Конфликт, закрытие и предпроверка добавлены в Task 2. RED Task 2 остался красным (8 тестов).
2. **Нормализация `close_reason` в модуле.** NULL и неизвестное значение превращаются в `expired` в `submit.ts` (`closeReasonOf`). Тип исхода — `'expired' | 'superseded'`. Маршрут отображает его одной функцией `rejectClosedSession`. Итог совпадает с планом: всё, кроме superseded, даёт 422.
3. **Дополнительные экспортируемые типы:** `PrecheckSubmitParams`, `PrecheckSubmitResult`, `ScoredAttemptFacts`, `SessionCloseReason`, `SubmitAttemptOutcome`, `SubmitAttemptParams`, `ClientAttemptStorage`. На поведение не влияют.
4. **Сданная сессия без `attempt_id`** (попытку удалили, FK `SET NULL`): 409 с `attemptId: null`. Схема ошибки это допускает.
5. **`clientAttemptIdKey` строится от `userId` компонента** (`me?.id ?? 'anonymous'`), как `sessionKey` и `walKey`.
6. **Дополнительные проверки в тестах:**
   - повторный submit в сессию, закрытую на 13 минутах, — снова 422;
   - `results_version = 1` и `client_attempt_id` у попытки;
   - гонка с разными `clientAttemptId` тоже идёт 5 раундов.

### Наблюдение

Ответ 200 при первой отправке теперь читается из строки, поэтому `earnedPoints`, `totalPoints` и `scorePercentage` приходят с точностью `real` (float4), как раньше приходили только при повторе. Без этого тела первого ответа и повтора различались бы. Существующие тесты на точное значение процента не покраснели.

Других отклонений нет.

## TDD Gate Compliance

Порядок соблюдён по сути, без коммитов (правило пользователя):
1. RED: тесты Task 2 и `KNOWN_DEFECTS` без двух id, прогон `8 failed | 31 passed | 1 expected fail`.
2. GREEN: `precheckSubmit`, `closeExpiredSession`, исходы `conflict`/`closed`, маршрут, прогон `src/routes/tests` `163 passed | 1 expected fail`.
3. REFACTOR не понадобился.

## Known Stubs

Нет. `resultsVersion: 1` и прежняя форма ответа — по плану (D-23 п. 2), их заменяют 05-07 и следующие планы.

## Threat Flags

Нет: новых маршрутов нет, путь submit прежний.
- T-5-15: сессия ищется по `id`, `test_id`, `user_id`; на чужую и несуществующую одинаковый 404, есть тесты.
- T-5-16: `FOR UPDATE`, уникальные индексы; 8 × 5 параллельных с одним и с разными id.
- T-5-17: ответ из сохранённой строки; повтор при `showCorrectAnswer=false` без ключа (SCORE-02) зелёный.
- T-5-18: `sessionId` обязателен; просрочка от `now()` на входе; закрытая параллельным `/start` сессия отклоняется.
- T-5-19: хранилище читается только на этапе оценки, до транзакции.
- T-5-20: 409 при повторе `clientAttemptId` в другой сессии.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Подтвердить контракт D-03 и поведение D-09:
   - `sessionId` и `clientAttemptId` обязательны для всех тестов;
   - 409 `ATTEMPT_ALREADY_SUBMITTED` вместо второй попытки той же сессии с другим `clientAttemptId`;
   - 422 `TIME_EXPIRED` для сессии, просроченной на входе, и для закрытой как expired;
   - `TIME_EXPIRED_ALREADY_SUBMITTED` удалён.
2. Перед выбором окна деплоя выполнить read-only SQL из CONTEXT `<specifics>` п. 1:
   ```sql
   SELECT count(*) AS active_open_sessions
   FROM test_sessions
   WHERE submitted_at IS NULL
     AND coalesce(draft_updated_at, started_at) > now() - interval '3 hours';
   ```
   Порядок выкатки: web, сразу за ним server, одно тихое окно; откат парой server → web. Подробно — в runbook 05-11 (D-25).
3. Согласиться с поведением старой вкладки. Вкладка, открытая до деплоя, без `sessionId` получает 400 и восстанавливается перезагрузкой: ответы есть в WAL и в черновике сервера.
4. Подтвердить уточнение D-08 п. 3 по ревью R2 (текст D-08 в CONTEXT не правился). Просрочку решает только предпроверка по часам БД на момент прихода запроса. Транзакция после оценки повторно проверяет лишь сдачу и закрытие, поэтому отправка, принятая на входе, не получает 422 из-за долгой оценки.
5. Подтвердить уточнение D-03/D-08 по ревью R3. Сессия, закрытая миграцией 0022 как `superseded`, на submit даёт 404 `Session not found`, а не 422. Это поведение UI-SPEC «404 на отправку»: WAL сохраняется, `sessionKey` снимается, после перезагрузки ответы уходят в открытую сессию.
6. Коммит 18 файлов плана делает пользователь (оркестратор).

## Self-Check: PASSED

- Новые файлы существуют: `submit.ts`, `scored-attempt/index.ts`, `attempt-submit.test.ts`, `client-attempt-id.ts`, `client-attempt-id.test.ts`. Ещё 13 файлов изменены (`git status`: 18 путей).
- В новых и изменённых строках нет комментариев. Удалён один старый комментарий в `TestRunner.tsx` (`// Check for TIME_EXPIRED_ALREADY_SUBMITTED`) и комментарии удалённых блоков `public.ts`.
- Коммитов нет по правилу пользователя.

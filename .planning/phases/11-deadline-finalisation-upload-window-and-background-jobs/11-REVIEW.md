---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
reviewed: 2026-10-13T14:03:32Z
depth: deep
files_reviewed: 111
files_reviewed_list:
  - app/server/README.md
  - app/server/drizzle/0030_attempt_upload_window.sql
  - app/server/drizzle/meta/0030_snapshot.json
  - app/server/drizzle/meta/_journal.json
  - app/server/drizzle/migrations-manifest.json
  - app/server/package.json
  - app/server/route-inventory.txt
  - app/server/src/db/schema.ts
  - app/server/src/index.ts
  - app/server/src/lib/db-errors.ts
  - app/server/src/lib/shutdown.test.ts
  - app/server/src/lib/shutdown.ts
  - app/server/src/routes/tests/attempt-deadline.test.ts
  - app/server/src/routes/tests/attempt-time-limit.test.ts
  - app/server/src/routes/tests/public.ts
  - app/server/src/schemas/tests.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/scripts/jobs-run.ts
  - app/server/src/services/attempt-sessions/access.ts
  - app/server/src/services/attempt-sessions/commands.test.ts
  - app/server/src/services/attempt-sessions/commands.ts
  - app/server/src/services/attempt-sessions/deadline.ts
  - app/server/src/services/attempt-sessions/draft-answers.ts
  - app/server/src/services/attempt-sessions/explanations.ts
  - app/server/src/services/attempt-sessions/index.ts
  - app/server/src/services/attempt-sessions/outcome.ts
  - app/server/src/services/attempt-sessions/sessions.ts
  - app/server/src/services/attempt-sessions/submit.ts
  - app/server/src/services/attempt-sessions/upload-window.test.ts
  - app/server/src/services/attempt-sessions/upload-window.ts
  - app/server/src/services/background-jobs/background-jobs.test.ts
  - app/server/src/services/background-jobs/index.ts
  - app/server/src/services/background-jobs/jobs.ts
  - app/server/src/services/background-jobs/registry.ts
  - app/server/src/services/question-content/move.ts
  - app/server/src/services/question-content/relocate.test.ts
  - app/server/src/services/question-content/relocate.ts
  - app/server/src/services/question-content/write.ts
  - app/server/src/services/scored-attempt/outcome.test.ts
  - app/server/src/services/scored-attempt/outcome.ts
  - app/server/src/services/scored-attempt/read.ts
  - app/server/src/services/scored-attempt/view.ts
  - app/server/src/test-support/attempt-world.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/TestSettingsPanel.tsx
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/photo-window.test.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/photo-window.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-utils.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.test.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-view.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.test.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-settings-form.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
  - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
  - app/web/components/providers/AuthProvider.tsx
  - app/web/components/tests/QuestionInput.tsx
  - app/web/components/tests/TestRunner.tsx
  - app/web/components/tests/attempt-lifecycle/lifecycle-outcomes.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
  - app/web/components/tests/attempt-lifecycle/lifecycle.ts
  - app/web/components/tests/attempt-lifecycle/outcome-rules.test.ts
  - app/web/components/tests/attempt-lifecycle/outcome-rules.ts
  - app/web/components/tests/attempt-lifecycle/server-clock.ts
  - app/web/components/tests/attempt-lifecycle/storage-keys.ts
  - app/web/components/tests/attempt-lifecycle/testing.ts
  - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
  - app/web/components/tests/attempt-lifecycle/user-storage.test.ts
  - app/web/components/tests/attempt-lifecycle/user-storage.ts
  - app/web/components/tests/attempt-lifecycle/wal-reconcile.test.ts
  - app/web/components/tests/attempt-lifecycle/wal-reconcile.ts
  - app/web/components/tests/attempt-result/DeadlinePanel.tsx
  - app/web/components/tests/attempt-result/UnsentTextNote.tsx
  - app/web/components/tests/attempt-result/UploadWindowLine.tsx
  - app/web/components/tests/attempt-submit-flow.test.ts
  - app/web/components/tests/attempt-submit-flow.ts
  - app/web/components/tests/client-attempt-id.ts
  - app/web/lib/drafts/question-draft-copy.test.ts
  - app/web/lib/drafts/question-draft-copy.ts
  - app/web/lib/drafts/save-queue.test.ts
  - app/web/lib/drafts/save-queue.ts
  - app/web/lib/session/client.test.ts
  - app/web/lib/session/client.ts
  - app/web/lib/session/refresh-coordinator.test.ts
  - app/web/lib/session/refresh-coordinator.ts
  - app/web/lib/session/transport.ts
  - app/web/lib/tests/api.test.ts
  - app/web/lib/tests/api.ts
  - app/web/lib/tests/upload-window.test.ts
  - app/web/lib/tests/upload-window.ts
  - e2e/fixtures/accounts.ts
  - e2e/fixtures/seed.json
  - e2e/playwright.config.ts
  - e2e/tests/auth.spec.ts
  - e2e/tests/deadline-finalised.spec.ts
  - e2e/tests/session.spec.ts
  - e2e/tests/test-editor.spec.ts
  - e2e/tests/timed-attempt.spec.ts
  - packages/exam-core/src/attempt-result.test.ts
  - packages/exam-core/src/attempt-result.ts
  - packages/exam-core/src/attempt-session.test.ts
  - packages/exam-core/src/attempt-session.ts
  - packages/exam-core/src/index.ts
  - packages/exam-core/src/upload-window.ts
  - scripts/api-routes-have-callers.test.mjs
  - scripts/check-exam-core-dist.mjs
  - scripts/check-migrations.mjs
  - scripts/draft-durability-guards.test.mjs
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-10-13T14:03:32Z
**Depth:** deep
**Files Reviewed:** 111
**Status:** issues_found

## Summary

Проверен дифф `638af9f^..dev` по `app`, `e2e`, `packages`, `scripts`: финализация по дедлайну (`services/attempt-sessions`), окно фото, фоновые задачи и остановка, судьба сессии и сверка WAL в web, координатор обновления сессии, очистка ключей при выходе. Решения D-04, D-07, D-21 приняты как заданные.

Что сделано правильно: одна попытка на сессию держится на `FOR UPDATE` строки сессии плюс уникальных индексах `session_id` и `(user_id, client_attempt_id)`, гонка двух финализаций и ручной сдачи даёт ровно одну попытку. Изменение черновика между чтением и записью ловит `expectedDraft` (`IS NOT DISTINCT FROM`). Время дедлайна везде считается в SQL (`now()`), web берёт смещение часов из `serverNow`. Миграция 0030 корректна: `ADD COLUMN ... DEFAULT 15 NOT NULL` без перезаписи таблицы, `CHECK` совпадает со схемой, `lock_timeout` как в 0022/0026/0027, манифест и журнал согласованы.

Главная проблема: любая ошибка финализации, кроме ошибок базы, навсегда закрывает сессию как `expired`. Сбой хранилища при чтении пояснений во время дедлайна лишает ученика попытки (CR-01). Остальное — узкие гонки на границе грейса у ленивых путей, удержание соединения пула задачей и мелкие расхождения web и сервера.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Временный сбой хранилища при финализации навсегда закрывает сессию без попытки

**File:** `app/server/src/services/attempt-sessions/deadline.ts:158-165` (классификатор `app/server/src/lib/db-errors.ts:33-40`)
**Issue:** `finalizeDraft` вызывает `scoreSubmission` с `explanationReaderFor` (`explanations.ts:4-15`). Тот читает пояснения из хранилища через `readQuestionMarkdown` → `storage.readText`. Адаптер Supabase после исчерпания повторов бросает `StorageUnavailableError` (`storage/port.ts:52`, 503, сообщение «Хранилище недоступно», без SQLSTATE). `isTransientDbError` распознаёт только ошибки базы, поэтому `catch` в `finalizeOnce` считает это «ошибкой данных»: пишет `logger.error`, вызывает `closeSessionAsExpired` и возвращает `expired`. Сессия получает `closed_at`, и все следующие вызовы (`/start`, судьба, задача) видят `closedAt` → `expired`. Попытка не создаётся, восстановить её штатно нельзя. Ручная сдача при той же ошибке отдаёт 500, клиент повторяет, ответы не теряются. Сервер превращает временный сбой в окончательную потерю попытки.
Воспроизведение: тест с лимитом 1 мин, у вопроса есть `explanationPath`; ученик сохраняет черновик и закрывает вкладку; на время прогона `finalize-deadlines` хранилище недоступно (Supabase 5xx/таймаут). Через 3 мин сессия `closed_at IS NOT NULL, close_reason='expired'`, в `test_attempts` строки нет, страница показывает «Время вышло, ответы не засчитаны».
**Fix:** закрывать сессию только при доказанной ошибке данных, а всё прочее пробрасывать (задача отложит сессию через `failures`, ленивые пути ответят 5xx и повторятся):
```ts
} catch (error) {
	if (isTransientDbError(error) || error instanceof StorageUnavailableError) throw error
	...
}
```
Надёжнее перевернуть правило: закрывать только при явном классе ошибки данных (неизвестный тип вопроса, `answers invalid after filter`), а не при любом исключении.

## Warnings

### WR-01: Ленивая финализация на границе грейса перехватывает вовремя начатую ручную сдачу

**File:** `app/server/src/services/attempt-sessions/commands.ts:56-75`, `app/server/src/services/attempt-sessions/deadline.ts:150-159`
**Issue:** `submitSession` проверяет дедлайн в `precheckSubmit` вне транзакции, потом оценивает (`scoreSubmission` читает ключи и пояснения, с повторами хранилища это секунды) и только потом берёт `FOR UPDATE` в `submitAttempt`. У фоновой задачи запас `FINALIZE_SETTLE_SECONDS = 60`, а у ленивых путей (`GET .../sessions/:id`, `PATCH .../answers` → `not_written` → финализация, `/start`) запаса нет: они финализируют сразу после `deadline + grace`. Если такой запрос придёт, пока идёт оценка ручной сдачи, он первым берёт строку. С непустым черновиком ручная сдача получает 409 `finalized`, и в попытку идут ответы черновика вместо присланных. С пустым черновиком сессия закрывается, ручная сдача получает 422 `TIME_EXPIRED` и ответы теряются, хотя запрос пришёл в пределах грейса.
Воспроизведение: лимит 1 мин; `POST /submit` в момент `started_at + 2:59.9` с медленным чтением пояснений; параллельно из второй вкладки `GET /sessions/:id` в `started_at + 3:00.1` → вторая вкладка видит `submitted/deadline`, первая получает 409 с ответами черновика (или 422 при пустом черновике).
**Fix:** дать ленивым путям тот же запас, что у задачи: в `finalizeOnce` считать сессию готовой к финализации по `sessionExpired(limit, FINALIZE_SETTLE_SECONDS)`, а между `expired` и `expired + settle` возвращать `open`/`not_written` (PATCH и так отказывает по `sessionExpired`). Либо в `submitAttempt` для `source='client'` передавать признак «precheck прошёл до дедлайна» и не отдавать строку финализации, пока такая сдача в полёте.

### WR-02: Задача держит соединение пула на весь прогон: истощение пула в dev и взаимная блокировка при `PG_POOL_MAX=1`

**File:** `app/server/src/services/background-jobs/registry.ts:69-76`, `app/server/src/db/index.ts:52`
**Issue:** `runLocked` открывает `db.transaction` ради `pg_try_advisory_xact_lock` и внутри него выполняет `job.runOnce`. Работа задачи (`closeStale`, `find`, `finalizeSessionByDeadline` с собственной `db.transaction`) идёт через глобальный `db`, то есть на других соединениях. Соединение с замком простаивает в транзакции до 20 с (`FINALIZE_RUN_BUDGET_MS`). В dev `max` по умолчанию 2: во время прогона задача занимает оба соединения, HTTP-запросы ждут и через `connectionTimeoutMillis` 5 с падают. При `PG_POOL_MAX=1` внутренний запрос ждёт соединение, которое держит сама задача, и падает по таймауту на каждом прогоне. Тесты задач уже поднимают пул до 12, e2e до 4, то есть давление на пул заметили, но не устранили.
Воспроизведение: `yarn dev` без `PG_POOL_MAX`, создать 50 просроченных сессий с черновиком и одновременно открыть каталог тестов: запросы API висят до 5 с и падают `timeout exceeded when trying to connect`.
**Fix:** держать замок сессионным `pg_try_advisory_lock` на отдельном выделенном клиенте (`pgPool.connect()`, `pg_advisory_unlock` в `finally`) или выполнять работу задачи через `lockTx`. Как минимум не запускать задачи при `max < 3` и написать это в README сервера.

### WR-03: `/start` молча сдаёт прошлую сессию и начинает новую попытку с таймером, web об этом не узнаёт

**File:** `app/server/src/services/attempt-sessions/commands.ts:11-20`, `app/web/components/tests/attempt-lifecycle/lifecycle.ts:579-593`, `:887-901`
**Issue:** `startAttemptSession` при просроченной сессии с черновиком финализирует её и сразу возвращает новую открытую сессию. Ответ `/start` не говорит, что прошлая сессия стала попыткой. Web доходит до `/start` с кэшированной сессией в двух случаях: чтение судьбы упало и `restoreLocally` по часам устройства решило, что время не вышло; или судьба ответила `open` за мгновение до конца грейса. Тогда `runStart` видит другой `sessionId`, показывает тост «сессия заменена», запускает новый таймер (с `frozen` — сразу `fresh-start`), а принятая сервером попытка ученику не показывается. Неподтверждённый текст уходит в `test-unsent-` с `certain:false`.
Воспроизведение: тест 10 мин, черновик сохранён; перезагрузить страницу через 13 мин при отказе `GET /sessions/:id` (DevTools → block request URL) и часах устройства, отстающих на 5 мин: новая сессия, таймер 10:00, в «Моих попытках» уже есть попытка `deadline`.
**Fix:** возвращать из `/start` факт финализации (например, `{ ...session, previous: { attemptId, submitSource: 'deadline' } }`) и в `runStart` при `cached.sessionId === previous.sessionId` уходить в `applyAccepted` вместо `applyServerSession`. Либо при `cached` и таймере вызывать `/start` только после успешной судьбы.

### WR-04: `closeSessionAsExpired` отдаёт `expired`, даже если ничего не закрыла

**File:** `app/server/src/services/attempt-sessions/deadline.ts:75-78`, `:152-155`, `:163-164`
**Issue:** `closeSessionsAsExpired` обновляет только строки с `submitted_at IS NULL AND closed_at IS NULL` и возвращает список id, но `finalizeOnce`/`finalizeDraft` список игнорируют и всегда возвращают `{ kind: 'expired' }`. Если между чтением строки и закрытием ручная сдача успела её сдать, маршрут судьбы ответит `{ state: 'expired' }` по сданной сессии. Web тогда покажет «Время вышло, ответы не засчитаны» (`applyTimeExpired`) или «Начать тест?» и сотрёт ключи, хотя попытка принята; отчёт задачи посчитает её в `expired`.
Воспроизведение: то же окно, что в WR-01, с пустым черновиком: ручная сдача коммитит первой, параллельный `GET /sessions/:id` получает `expired`.
**Fix:** при пустом результате закрытия перечитывать строку, например вернуть `draft_changed`, чтобы `untilDraftSettles` повторил `finalizeOnce`:
```ts
const closed = await closeSessionAsExpired(sessionId)
if (closed.length === 0) return { kind: 'draft_changed' }
return { kind: 'expired' }
```

### WR-05: Запись `test-unsent-` пишется, но нигде не читается: после перезагрузки пометка о недошедшем тексте пропадает

**File:** `app/web/components/tests/attempt-lifecycle/storage-keys.ts:69`, `:117`, `:131`; `app/web/components/tests/attempt-lifecycle/lifecycle.ts:745-757`, `:770-782`
**Issue:** при `accepted` эффект `wal: 'to-unsent'` пишет текст в `test-unsent-<testId>-<userId>` и удаляет WAL. Ни один модуль эту запись не читает (поиск по `keys.unsent` даёт только запись и удаление). Снимок `unsent` живёт только в памяти вкладки. После перезагрузки страницы кэша сессии нет, `init` идёт в `awaitingStart`, пометки нет, WAL уже удалён. Следующий `/start` (`started` → `unsent: true`) стирает и запись. D-14 требует, чтобы ученик видел текст, а не чтобы он лежал невидимым в хранилище.
Воспроизведение: попытка финализирована сервером с расходящимся текстом → «Ответ принят» с пометкой → F5 → пометки нет, текст доступен только через DevTools → «Начать тест» стирает его.
**Fix:** в `init` читать `keys.unsent` и, если запись относится к этому тесту, выставлять `unsent` в снимке (а «К результатам» в `TestRunner` вести на страницу, где пометка видна). Либо не удалять WAL при `to-unsent`, пока пометку не закроет сам ученик.

### WR-06: `reconcile-outcomes` отчитывается о расхождении по всем проверенным учителем попыткам

**File:** `app/server/src/services/background-jobs/jobs.ts:69-88`
**Issue:** задача вызывает `reconcileOutcomes` с `loadLatestScores: async () => new Map()`. Для попыток `graded`/`pending` пересчёт без оценок учителя всегда расходится с сохранённой проекцией, поэтому они попадают в `mismatched`, в `log.warn` и в итоговый отчёт `jobs:run`. Тест это закрепляет: `mismatched: 2` при одной реальной порче. Оператор, запустивший `jobs:run reconcile-outcomes` на проде, увидит сотни ложных расхождений и не отличит настоящие от ложных.
**Fix:** при `repairOnly` пропускать строки других статусов до сравнения, а не только до починки (в `scored-attempt/outcome.ts:197` перенести `continue` до проверки расхождения), либо отдавать отдельное поле `skipped` и в `mismatched` считать только строки `none`.

## Info

### IN-01: Экспорт настроек теста не включает окно фото

**File:** `app/server/src/services/question-content/export.ts:87-103`
**Issue:** `settingsEntry` не пишет `photoUploadWindowMinutes`, архив теста теряет значение автора (перенос `move.ts:106` поле копирует).
**Fix:** добавить `photoUploadWindowMinutes: test.photoUploadWindowMinutes` в `settings.json`.

### IN-02: `uploadWindowState` для несданной сессии не учитывает открытые вопросы и правило D-04

**File:** `app/server/src/services/attempt-sessions/upload-window.ts:37-40`
**Issue:** для открытой сессии окно считается открытым до `started_at + limit + window` независимо от наличия вопроса `open` (D-08) и от того, создастся ли попытка вообще (пустой черновик закроется без попытки). Маршруты фото фазы 12 будут принимать файлы в такие сессии.
**Fix:** передавать в `uploadWindowState` признак наличия вопроса `open` и для просроченной несданной сессии отвечать `no_window`, пока финализация не создала попытку с `upload_closes_at`.

### IN-03: Пропуск по чужому замку логируется как событие каждые 30 с

**File:** `app/server/src/services/background-jobs/registry.ts:45-47`, `:77`
**Issue:** `isEventful({ skipped: 'locked' })` даёт `true` (`'locked' !== 0`), второй экземпляр API во время выкатки пишет `background job run` раз в 30 с.
**Fix:** `if ('skipped' in result) return false` в `isEventful`.

### IN-04: Восстановление без судьбы сессии судит о дедлайне по часам устройства

**File:** `app/web/components/tests/attempt-lifecycle/lifecycle.ts:613-618`, `:887-901`; `server-clock.ts:8`
**Issue:** смещение `serverClock` не сохраняется между загрузками и до первого ответа сервера равно 0. Если чтение судьбы упало, `isAbandonedExpired` и затем таймер `runStart` (при отказе `/start` — с кэшем) идут по часам устройства. Это вход в WR-03.
**Fix:** сохранять последнее смещение рядом с кэшем сессии и применять его до первого ответа сервера.

### IN-05: Остановка по истечении 25 с завершается кодом 0

**File:** `app/server/src/lib/shutdown.ts:55-64`
**Issue:** при `timedOut` соединения рвутся, незавершённые запросы и прогон задачи обрываются, но процесс выходит с `exit(0)`. В логах оркестратора это неотличимо от чистой остановки.
**Fix:** `exit(timedOut ? 1 : 0)`.

---

_Reviewed: 2026-10-13T14:03:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

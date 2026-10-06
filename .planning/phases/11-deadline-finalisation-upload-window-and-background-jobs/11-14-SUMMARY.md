---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 14
subsystem: web
tags: [attempt-lifecycle, session-fate, wal, d-04, d-13, d-14, d-21, time-06, pitfall-4]
requires: [11-07, 11-13]
provides:
  - readTestSession(testId, sessionId) в lib/tests/api.ts — GET судьбы сессии с разбором SessionFateSchema
  - AttemptLifecycleApi.readSession (необязательный) и чтение судьбы до /start в init для теста с лимитом
  - общие обработчики applyAccepted, applyTimeExpired(current, { certain }), applyAlreadySubmitted в lifecycle.ts
  - перенос pending-текстов заменённой сессии в test-unsent- (attemptId null, certain false) в applyServerSession
  - fakeAttemptApi(starts, { fates }) — шаги судьбы в фейке
affects: [11-15, 11-17, 11-18]
actuals:
  tokens: 11000
  tasks: 3
  commits: 0
plan_head_before: 26efcdb3634ff1f39a752b1c4a37f9df5f8d558b
plan_head_after: 26efcdb3634ff1f39a752b1c4a37f9df5f8d558b
tech-stack:
  added: []
  patterns: [чтение судьбы сессии до /start с проверкой generation, сбой чтения ведёт на прежний путь]
key-files:
  created: []
  modified:
    - app/web/lib/tests/api.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts
key-decisions:
  - "Признак текста в WAL для expired и запасного пути читает WAL из хранилища (walHasText), а не память: в запасном пути он решает, загружать ли черновик в память"
  - "Без api.readSession init идёт прежним кодом (restoreLocally), поэтому существующие тесты без фейка судьбы не меняются"
  - "Перенос текста при замене сессии — одна проверка до удаления WAL: WAL с sessionId, отличным от сессии /start, покрывает и кэш другой сессии, и WAL чужой сессии без кэша"
  - "keepUnsent и keepExpiredUnsent больше не обнуляют снимок unsent при пустой сверке: пустая своя сверка оставляет перенесённую пометку"
status: complete
---

# Phase 11 Plan 14: Судьба сессии до /start Summary

При открытии страницы теста с лимитом и сохранённой сессией модуль попытки сначала читает судьбу сессии `GET /api/tests/public/tests/:id/sessions/:sessionId` и только потом решает, звать ли `/start`: сданная сервером по дедлайну попытка сразу показывает «Ответ принят» со сверкой WAL, сданная клиентом — диалог «Попытка уже сдана», закрытая без попытки с набранным текстом — диалог «Время вышло» с пометкой. Замена сессии переносит неподтверждённый текст старой сессии в `test-unsent-…`, а не стирает его молча.

## Что сделано

- `lib/tests/api.ts`: `readTestSession(testId, sessionId)` через `fetchAttemptJson` с `parse: SessionFateSchema.parse`; невалидное тело — исход `malformed` модуля запросов, `fetchAttemptJson` бросает `RequestError` (не `AttemptRequestError`), модуль идёт прежним путём.
- `use-attempt-lifecycle.ts`: `readSession: readTestSession` в API модуля.
- `lifecycle.ts`:
  - `AttemptLifecycleApi.readSession?`.
  - `applyAccepted(accepted, current)` — тело прежней ветки `finalized`; её вызывают 409 `deadline` и судьба `submitted` + `deadline`.
  - `applyAlreadySubmitted(current, attemptId)` и `applyTimeExpired(current, { certain })` (общая часть — `closeSession`); 422 зовёт `applyTimeExpired(…, { certain: true })`, поведение 11-13 не изменилось.
  - `init()`: после ветки повтора сдачи, если у теста есть лимит и `api.readSession` — `loadLocal(cached)`, фаза `starting`, асинхронный `restoreFromFate` с проверкой `generation`. Иначе `restoreLocally` — прежний код (брошенная просроченная → `awaitFreshStart`, иначе `runStart(cached, { frozen })`), плюс ветка R2: брошенная просроченная с текстом в WAL → `applyTimeExpired(cached, { certain: false })`.
  - `restoreFromFate`: `serverClock.observe(fate.serverNow)` при любом ответе; ветки по таблице ниже; 403 → `blockStart`; прочие ошибки → `restoreLocally`.
  - `walHasText(sessionId)`: `unsentTexts({ local: wal.answers, stored: [], textQuestionIds, questionOrder, pending })` по WAL этой сессии или отвязанному WAL; пустой `textQuestionIds` → ложь.
  - `applyServerSession`: сразу после `removeStoredUnsent()` — `carryReplacedText(readWal(…), server.sessionId)`: WAL с другим `sessionId` → `unsentTexts({ stored: null, pending })` (только неподтверждённые) → `writeUnsent({ v: 1, testId, attemptId: null, certain: false, entries })` и `unsent` в снимке; затем прежние удаления (`clearAttemptKeys(…, 'session-replaced')`, `safeRemove` WAL чужой сессии).
  - `keepUnsent` и `keepExpiredUnsent(certain)` при пустой сверке не трогают снимок `unsent`.
- `testing.ts`: `fakeAttemptApi(starts, { fates })` — `readSession` в API только при переданных шагах (значение `SessionFate` или ошибка), мок `readSession` в результате.
- `lifecycle-restore.test.ts`: два новых `describe` (только добавленные строки, существующие тесты и ожидания не менялись).

## Судьба → что делает модуль → что видит ученик

| Ответ чтения судьбы | Модуль | Ключи | Что видит ученик |
| --- | --- | --- | --- |
| `open` | `runStart(cached, { frozen })` | как раньше | восстановление, тост «Сессия восстановлена»; если дедлайн прошёл — «Время вышло» и автосдача |
| `submitted` + `deadline` | `applyAccepted` с `fate.attempt`, `uploadClosesAt`, `serverNow`; сверка WAL D-14 | `session`, `frozen`, `clientAttemptId` стёрты; WAL стёрт при совпадении или после записи `unsent` | «Ответ принят» с результатом, строкой окна и пометкой о недошедшем тексте при расхождении; `/start` не вызывается |
| `submitted` + `client` | `applyAlreadySubmitted` | все ключи по событию `already-submitted` | диалог «Попытка уже сдана»; `/start` не вызывается |
| `expired`, в WAL нет непустого текста текстовых вопросов | `awaitFreshStart` | `frozen` стёрт | диалог «Начать тест?» с полным временем |
| `expired`, в WAL есть текст (R2) | `applyTimeExpired(cached, { certain: true })` | `session`, `frozen`, `clientAttemptId` стёрты, WAL остаётся | диалог «Время вышло, ответы не засчитаны» с пометкой «не дошла»; «Начать заново» стирает WAL и `unsent`, затем «Начать тест?» |
| сеть, 5xx, 404, невалидное тело; часы в пределах льготы | `restoreLocally` → `runStart` | как раньше | как раньше |
| то же, часы за льготой, текста нет | `awaitFreshStart` | как раньше | «Начать тест?» |
| то же, часы за льготой, текст в WAL (R2) | `applyTimeExpired(cached, { certain: false })` | WAL остаётся | «Время вышло» с пометкой «могла не дойти» |
| 403 | `blockStart` | `session`, `clientAttemptId` стёрты, WAL отвязан | `start-not-assigned` |
| тест без лимита или сохранённый `clientAttemptId` | чтение не вызывается | как раньше | как раньше (повтор сдачи первым) |
| замена сессии (`/start` вернул другую сессию при кэше или при WAL чужой сессии) | перенос `pending`-текста в `test-unsent-` до удаления WAL | запись `{ attemptId: null, certain: false }` | 200 новой сессии — пометка «могла» в панели результата (ключ стирает `success`, снимок живёт до `reset`/`init`); `finalized`/`time-expired` с непустой своей сверкой заменяют её, с пустой — оставляют |

Ключ WAL общий на тест и пользователя: если запись `unsent` при замене сессии не удалась, `persistAll` новой сессии перезапишет WAL и тексты теряются, как до плана.

## Трассер (Task 1)

Тест `трассер: submitted + deadline, текст WAL совпал с попыткой → «Ответ принят» без /start, ключей нет` вместе со случаями Task 2 прошёл с первого прогона: `vitest run components/tests/attempt-lifecycle` — 8 файлов, 194 теста зелёные; `node --test scripts/draft-durability-guards.test.mjs` — 7 pass, 0 fail; `typecheck` — exit 0. Трассер проверен, после этого начат Task 3. Случаи Task 2 написаны в том же шаге (поведение уже было в `restoreFromFate`), ни один не упал, правок `lifecycle.ts` после них не понадобилось.

## TDD Task 3: красный и зелёный прогоны

Шаг 1 — семь случаев `<behavior>` (судьба `expired` с текстом, сбой чтения и отсутствие `readSession` с текстом за льготой, замена сессии с `pending`-текстом, 200 после переноса, 409 `deadline` с пустой сверкой после переноса, WAL чужой сессии без кэша). Случай «`expired` только с ответом выбора» уже покрыт таблицей Task 2. Красный:

```
     × 'expired' с текстом в WAL → диалог «Время вышло» с пометкой, WAL до «Начать заново», без /start
     × сбой сети чтения, часы за льготой, текст в WAL → «Время вышло» с пометкой «могла», без /start
     × без readSession, часы за льготой, текст в WAL → «Время вышло» с пометкой «могла», без /start
     × замена сессии: pending-текст s1 переносится в test-unsent- до удаления WAL
     × после переноса: ручная сдача s2 → 200, пометка «могла» остаётся в снимке, ключ стёрт; retake обнуляет
     × после переноса: 409 deadline с пустой своей сверкой оставляет перенесённую пометку и запись
     × WAL чужой сессии без кэша: «Начать тест?» → /start s2 → pending-текст s1 в test-unsent-
 Test Files  1 failed | 7 passed (8)
      Tests  7 failed | 194 passed (201)
```

Шаг 2 — `applyTimeExpired`, `walHasText`, ветки R2 в `restoreFromFate` и `restoreLocally`, `carryReplacedText`, пустая сверка не обнуляет снимок. Зелёный: `vitest run components/tests/attempt-lifecycle components/tests/attempt-submit-flow.test.ts` — 9 файлов, 239 тестов (каталог модуля — 8 файлов, 201 тест). Существующие тесты `lifecycle-restore.test.ts` без `textQuestionIds` прошли без правок ожиданий; закрепления 11-13 (`unsent === null` после 409/422 без расхождений, полный список `removeItem` в `lifecycle.test.ts`) не сменились.

## Проверка в браузере (временный e2e, удалён)

Временный `e2e/tests/zz-fate-probe.spec.ts` (после прогона удалён), тест с лимитом 30 минут, текстовым вопросом и вопросом выбора, оба проекта (`chromium-desktop`, `chromium-mobile`), 22 passed (14 setup + 8):

- `open` (настоящий сервер): после перезагрузки ответ чтения `state: 'open'`, текст «митоз» в поле, диалога «Начать тест?» нет.
- `submitted` + `client` (настоящий сервер: сессия сдана `page.request` в обход страницы): после перезагрузки ответ `submitted`/`client`, диалог «Попытка уже сдана», `POST /start` не было.
- `submitted` + `deadline` (тот же ответ сервера, `submitSource` подменён через `page.route`): заголовок «Ответ принят» в фокусе, строка «Время вышло, ответы приняты автоматически.», пометка «Часть ответа, набранная без связи, не дошла до сервера» видна (попытка сдана с пустыми ответами, локальный текст «митоз» расходится), `POST /start` не было.
- `expired` (ответ подменён): диалог «Время вышло, ответы не засчитаны» с пометкой и текстом «митоз», в `localStorage` один ключ `test-answers-wal-`; «Начать заново» → диалог «Начать тест?», ключей WAL нет, `POST /start` не было.

Первый прогон упал в случае `client` на ошибке самой пробы: искал `alertdialog`, а «Попытка уже сдана» — `dialog`. После правки локатора все случаи зелёные. Разметка и тексты в этом плане не менялись, поэтому замеры контраста не повторялись.

## CodeGraph

- `codegraph impact runStart`: 9 символов — `lifecycle.ts` (`runStart`, `resubmit`, `reset`, `createAttemptLifecycle`), `testing.ts` (`setupLifecycle`), `use-attempt-lifecycle.ts` (`createBrowserAttemptLifecycle`), `index.ts`.
- `codegraph impact applyServerSession`: 5 символов — `applyServerSession`, `runStart`, `resubmit`, `createAttemptLifecycle`, `reset` в `lifecycle.ts`.
- `codegraph affected` по `api.ts`, `lifecycle.ts`, `use-attempt-lifecycle.ts`, `testing.ts` вернул только сами файлы (индекс построен по основному checkout, файлы worktree в нём не видны). Набор тестов выбран по `impact`: каталог `attempt-lifecycle`, `attempt-submit-flow.test.ts`, охранник, весь web-набор, e2e плана.

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle`: 8 файлов, 201 тест зелёные.
- `node --test scripts/draft-durability-guards.test.mjs`: 7 pass, 0 fail.
- `yarn workspace @bio-exam/web test`: до плана (замер на чистом HEAD) 97 файлов, 1495 тестов; после — 97 файлов, 1520 тестов (+25 в `lifecycle-restore.test.ts`).
- `yarn workspace @bio-exam/web typecheck`: exit 0. `yarn workspace @bio-exam/web lint`: exit 0, в файлах плана предупреждений нет.
- `yarn e2e tests/timed-attempt.spec.ts tests/answer-durability.spec.ts tests/submit-retry.spec.ts`: 26 passed (14 setup + 12 тестов на двух проектах), с первого прогона.
- `yarn verify`: `yarn verify: OK` (все восемь шагов passed, с первого прогона, после последней правки кода).
- `11-plan-files.cjs check 11-14` не запускался (режим worktree, сверку делает ведущая сессия).

## Acceptance

- `grep -c "readSession" lifecycle.ts` = 6; `grep -c "readTestSession" use-attempt-lifecycle.ts` = 2; `grep -c "applyTimeExpired" lifecycle.ts` = 4 (объявление, 422, `restoreFromFate`, `restoreLocally`).
- `git diff HEAD -- lifecycle-restore.test.ts`: 335 добавленных строк, 0 удалённых (типы из exam-core — отдельной строкой `import type`, чтобы не менять существующий импорт).
- В `lifecycle-restore.test.ts` есть случаи судьбы `'client'`, `'expired'`, `'open'`, проверка, что `readSession` не вызван для теста без лимита и при сохранённом `clientAttemptId`, случаи `expired` с текстом, сбоя чтения с текстом и замены сессии с `pending`-текстом (`session-replaced`, `test-unsent-`).

## Deviations from Plan

### Auto-fixed Issues

None.

### Прочие отклонения

- Случаи Task 2 написаны вместе с трассером и сразу зелёные: логика всех состояний судьбы уже была в `restoreFromFate` после Task 1, красного прогона у Task 2 нет.
- Кроме `applyAccepted` и `applyTimeExpired` вынесены `applyAlreadySubmitted` и `closeSession`: ветку `client` судьбы и 409 `client` ведёт одна функция.
- Признак текста читает WAL из хранилища, а сверка в `applyTimeExpired` — память модуля (как в 11-13); перед `applyTimeExpired` память всегда загружена `loadLocal(cached)`, поэтому они совпадают.
- Ветка R2 запасного пути срабатывает и без `api.readSession` (план: «сбой чтения или нет `readSession`»); в браузере `readSession` есть всегда.
- Дополнительный случай: после переноса 409 `deadline` с пустой своей сверкой оставляет перенесённую пометку и запись (truth плана, в `<behavior>` не было).
- Охранник `scripts/draft-durability-guards.test.mjs` не дополнялся `readTestSession`: файл вне `files_modified`; `TestRunner.tsx` не менялся, чтение вызывает модуль.
- Временный e2e-файл для проверки в браузере создан и удалён; в рабочем дереве его нет.
- `11-plan-files.cjs check 11-14` не запускался (режим worktree).

## Known Stubs

None.

## Threat Flags

None. Митигации реализованы: T-11-43 — 404 и любой сбой чтения ведут на прежний путь (тест-таблица сбоев); T-11-44 — сбой чтения, кроме 403, не блокирует страницу; T-11-45 — судьба до `/start`, «Ответ принят» со сверкой WAL (трассер, проверка в браузере); T-11-65 — `expired` и запасной путь с текстом → `applyTimeExpired`, перенос `pending`-текстов в `test-unsent-` до удаления WAL (тесты Task 3).

## Файлы к коммиту

- `app/web/lib/tests/api.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`
- `app/web/components/tests/attempt-lifecycle/testing.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-restore.test.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-14-SUMMARY.md`

## Self-Check: PASSED

`git status --short` содержит только пять файлов плана и SUMMARY, HEAD = `26efcdb` (коммитов нет по правилам фазы 11), временный e2e удалён.

---
phase: 06-draft-durability
plan: 02
subsystem: exam-core, web-drafts
tags: [exam-core, zod, save-queue, keepalive, life02, life04, life05]
status: complete
deferred_human_gate: false

requires:
  - phase: 05
    provides: "PATCH черновика попытки со слиянием под блокировкой строки, checkAttemptAccess, toSessionInfo"
provides:
  - "packages/exam-core/src/attempt-session.ts: SaveAttemptDraftRequestSchema, AttemptSessionSchema, типы SaveAttemptDraftRequest, AttemptSession"
  - "app/web/lib/tests/api.ts: saveAttemptDraft, KEEPALIVE_BODY_LIMIT_BYTES, AttemptDraftSaveResult"
  - "app/web/lib/drafts/save-queue.ts: createSaveQueue, SaveOutcome, SaveQueueClock, SaveQueueOptions, SaveQueueState, FlushResult, SaveQueue, SAVE_RETRY_DELAYS_MS"
affects: [06-03, 06-04, 06-05, 06-07, 06-09]

actuals:
  tokens: 9500
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Очередь сохранения: состояние в замыкании, шов часов now/setTimer/clearTimer, флаг due на ключ, глобальный счётчик версий, метки первого неподтверждённого изменения"
    - "Web-функция сохранения возвращает исход вместо исключения: response со статусом, network, too-large"

key-files:
  created:
    - packages/exam-core/src/attempt-session.ts
    - packages/exam-core/src/attempt-session.test.ts
    - app/web/lib/tests/attempt-draft-save.test.ts
    - app/web/lib/drafts/save-queue.ts
    - app/web/lib/drafts/save-queue.test.ts
  modified:
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
    - scripts/exam-core-no-private-copies.test.mjs
    - app/server/src/routes/tests/public.ts
    - app/server/src/services/attempt-sessions/sessions.ts
    - app/web/lib/tests/api.ts

key-decisions:
  - "Решение исполнителя (автономно): отправка идёт по флагу due на ключ. Дебаунс, наибольшее ожидание, таймер повтора, retryNow, resume и flush помечают due все pending, кроме ключа, чья последняя версия сейчас в полёте; после исхода очередь продолжает отправлять помеченные ключи без нового дебаунса. Изменение ключа во время его отправки снимает due только у новой версии: она ждёт дебаунс или наибольшее ожидание"
  - "Решение исполнителя (автономно): срабатывание дебаунса во время паузы повтора снимает таймер повтора и отправляет сразу; при успехе failure и счётчик повторов сбрасываются"
  - "Решение исполнителя (автономно): flush разрешается { ok: false, outcome } на любой исход, кроме ok, включая reject; ok — когда подтверждены все версии, бывшие в pending в момент вызова flush (изменения после вызова flush не задерживают его). Повторный flush присоединяется к ожиданию без второй отправки"
  - "Решение исполнителя (автономно): discard и close разрешают ждущие flush как { ok: true } (неподтверждённые значения владелец отбросил сам: после submit или «Сохранить вопрос»); dispose разрешает их как { ok: false, outcome: { kind: 'retry' } }; flush после close — { ok: true }, после dispose — { ok: false, retry }"
  - "Решение исполнителя (автономно): drain отправляет мимо слота «одна запись в полёте». Исход ok досланной записи подтверждает её версию; иной исход возвращает ключу due, и очередь отправит его обычным порядком. Исход stop у досланной записи не останавливает очередь: stop фиксирует только обычная отправка"
  - "Решение исполнителя (автономно): при stop ключ остаётся в pending, таймеры снимаются, set копит значения без таймеров; retryNow при stopped ничего не делает, resume снимает stopped и отправляет pending сразу"
  - "Решение исполнителя (автономно): reject старой версии при уже поставленной новой не переводит ключ в rejected: новая версия остаётся в pending"
  - "requirements-completed пуст: план закладывает основания (контракты, saveAttemptDraft, очередь); LIFE-02, LIFE-04, LIFE-05 закрывают 06-08 и 06-09"
  - "Решение исполнителя (автономно): saveAttemptDraft ловит любое исключение apiFetch, включая AuthExpiredError, и возвращает { kind: 'network' }; тело ответа не читается"

requirements-completed: []

duration: 12min
completed: 2026-10-04
---

# Phase 6 Plan 02: Контракты попытки в exam-core, saveAttemptDraft и очередь сохранения Summary

**Тело PATCH черновика и ответ /start объявлены в exam-core и используются сервером без смены поведения; web получил saveAttemptDraft с исходом и keepalive (лимит 60000 байт UTF-8) и чистый примитив очереди сохранения с дебаунсом, наибольшим ожиданием, версиями, одной записью в полёте, повторами 1/2/5/10/30 с, flush, drain, discard, close и dispose под 26 тестами на поддельных таймерах**

коммит: не выполнялся (правило пользователя), изменения в рабочем дереве

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-04T16:48:34Z
- **Completed:** 2026-10-04T17:00:10Z
- **Tasks:** 3
- **Files modified:** 11 (5 новых, 6 изменённых)

## Accomplishments

- `SaveAttemptDraftRequestSchema` перенесена из `public.ts` в `packages/exam-core/src/attempt-session.ts` без изменения полей, `superRefine` и текста «Provide questionId with value, telemetry, or both»; рядом `AttemptSessionSchema` по форме `toSessionInfo`. Обе схемы и типы экспортируются из `index.ts`, имена стоят в `EXPECTED_EXPORTS` (72 экспорта) и в группе «Phase 6 D-14» проверки приватных копий.
- Сервер: обработчик PATCH черновика вызывает `SaveAttemptDraftRequestSchema.safeParse(req.body)`; `SessionInfo = AttemptSession`, `toSessionInfo` не тронут. Тесты гонок, отправки и лимита времени (26) зелёные без правок.
- `saveAttemptDraft(testId, sessionId, body, { keepalive })` в `app/web/lib/tests/api.ts`: PATCH через `apiFetch` с `keepalive`, исход `response`/`network`/`too-large`; `saveAnswer`, `saveSessionTelemetry`, `startTestSession` не изменены.
- `app/web/lib/drafts/save-queue.ts`: интерфейс дословно по плану; без React, `window`, `document`, `setInterval`.

## Правки public.ts (для слияния с фазой 7)

1. Блок импорта из `@bio-exam/exam-core` (был строки 4-9, многострочный): теперь одна строка `import { SaveAttemptDraftRequestSchema, SUBMIT_ERROR_CODES, SubmitAttemptRequestSchema } from '@bio-exam/exam-core'`; `AnswerValueSchema` и `TelemetryMapSchema` убраны.
2. Удалён `import { z } from 'zod'` (строка 13): `z` использовался только в локальной схеме.
3. Удалено объявление `const SaveDraftAnswerSchema = z.object(...).superRefine(...)` (было 529-544); строка-комментарий `// PATCH /api/tests/public/tests/:id/sessions/:sessionId/answers ...` над `router.patch` осталась.
4. В обработчике PATCH черновика `SaveDraftAnswerSchema.safeParse(req.body)` → `SaveAttemptDraftRequestSchema.safeParse(req.body)` (теперь строка 534).

Импорты `services/question-content`, `services/storage`, `buildQuestionMarkdownCandidates`, `readFirstMarkdown` не тронуты; соседний код не переформатирован (oxfmt только по изменённым файлам).

## TDD: сначала красный

Коммитов RED/GREEN нет (правило пользователя); порядок соблюдён по сути:

| Тест | Красный прогон до реализации | Зелёный |
|------|------------------------------|---------|
| `packages/exam-core/src/attempt-session.test.ts` | `Error: Cannot find module './attempt-session'`, `Tests no tests` | 6 passed |
| `app/web/lib/tests/attempt-draft-save.test.ts` | `Failed Tests 7`: `TypeError: saveAttemptDraft is not a function`, `KEEPALIVE_BODY_LIMIT_BYTES` undefined | 7 passed |
| `app/web/lib/drafts/save-queue.test.ts` | `Error: Cannot find module './save-queue'`, `Tests no tests` | 26 passed |

В тесте `oldestPendingSince` первоначальное ожидание `START + 100` было ошибкой теста: к моменту проверки q2 уже подтверждён (очередь отправляет его сразу после q1), в pending остаётся q1 с первой неподтверждённой правкой на +750 мс. Ожидание исправлено на `START + 750` с проверкой `pending = ['q1']`; так тест проверяет переход метки после подтверждения старой версии.

Тест размера тела использует 31000 символов «я»: `JSON.stringify(body).length` меньше 60000, байт UTF-8 больше 60000, поэтому реализация по `string.length` тест не прошла бы.

## codegraph impact (D-29)

Индекс основного дерева `/Users/kdvornichenko/bio-exam` (в worktree `.codegraph/` нет).

`codegraph impact SaveDraftAnswerSchema`:
- `constant SaveDraftAnswerSchema` — `app/server/src/routes/tests/public.ts:529` (1 символ, других пользователей нет)

`codegraph impact toSessionInfo` (5 символов):
- `function toSessionInfo` — `app/server/src/services/attempt-sessions/sessions.ts:72`
- `function startAttemptSession` — `sessions.ts:82`
- `route POST /api/tests/public/tests/:id/start` — `app/server/src/routes/tests/public.ts:514`
- `app/server/src/services/attempt-sessions/index.ts`

`codegraph impact saveAnswer` (5 символов):
- `function saveAnswer` — `app/web/lib/tests/api.ts:140`
- `function TestRunner` — `app/web/components/tests/TestRunner.tsx:139`
- `function TestPageClient` — `app/web/app/(internal)/(protected)/tests/[topicSlug]/[testSlug]/start/TestPageClient.tsx:14`

`saveAnswer` и `toSessionInfo` план не меняет; `SessionInfo` сохранил форму, `TestRunner` продолжает использовать прежние функции до 06-09.

## codegraph affected

`codegraph affected` по 11 файлам плана, вывод дословно:

```
Affected test files (6):

  app/server/src/routes/tests/public.ts
  app/web/lib/drafts/save-queue.test.ts
  app/web/lib/tests/api.ts
  app/web/lib/tests/attempt-draft-save.test.ts
  packages/exam-core/src/attempt-session.test.ts
  scripts/exam-core-no-private-copies.test.mjs
```

## Verification

| Проверка | Итог |
|----------|------|
| `yarn workspace @bio-exam/exam-core vitest run src/attempt-session.test.ts` | 6 passed |
| `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` | `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 72 экспортов в ESM и CJS` |
| `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run attempt-races, attempt-submit, attempt-time-limit` | 3 файла, 26 passed |
| `yarn workspace @bio-exam/server typecheck` | exit 0 |
| `draft schema from exam-core` (acceptance Task 1) | печатает |
| Трассер Task 1 | три `<automated>` Task 1 выполнены после реализации и зелёные до начала Task 2; повторно покрыты `yarn verify` |
| `yarn workspace @bio-exam/web vitest run lib/tests/attempt-draft-save.test.ts` | 7 passed |
| `yarn workspace @bio-exam/web typecheck` | exit 0 |
| `node --test scripts/exam-core-no-private-copies.test.mjs` | pass 5, fail 0 |
| `yarn workspace @bio-exam/web vitest run lib/drafts/save-queue.test.ts` | 26 passed |
| `queue is pure` (acceptance Task 3) | печатает |
| `yarn verify` | `yarn verify: OK` (exam-core 605, web 620, server 1119 тестов; все 8 шагов passed) |
| Сверка по отпечатку `before-06-02` | `06-02 changed only its files` |

## Task Commits

Коммиты не выполнялись (правило пользователя): изменения в рабочем дереве worktree `gsd/phase-06`.

## Файлы к коммиту

- `packages/exam-core/src/attempt-session.ts`
- `packages/exam-core/src/attempt-session.test.ts`
- `packages/exam-core/src/index.ts`
- `scripts/check-exam-core-dist.mjs`
- `scripts/exam-core-no-private-copies.test.mjs`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/services/attempt-sessions/sessions.ts`
- `app/web/lib/tests/api.ts`
- `app/web/lib/tests/attempt-draft-save.test.ts`
- `app/web/lib/drafts/save-queue.ts`
- `app/web/lib/drafts/save-queue.test.ts`

## Семантика очереди для 06-03, 06-04, 06-05, 06-07

- `set` пишет значение с новой глобальной версией, перезапускает дебаунс и ставит таймер наибольшего ожидания, если его нет; при stopped таймеры не ставятся; set после close или dispose игнорируется; set снимает ключ из rejected.
- Отправка: в полёте не больше одной обычной записи; ok снимает ключ из pending только при совпадении версии; retry (и исключение send, синхронное или асинхронное) оставляет ключ и ставит паузу `retryDelaysMs[min(attempt-1, last)]`; stop останавливает очередь до `resume`; reject переводит ключ в rejected.
- `flush`: стоп → сразу `{ ok: false, outcome: { kind: 'stop', status } }`; пусто → `{ ok: true }`; иначе снимает дебаунс и паузу повтора и ждёт подтверждения версий на момент вызова.
- `drain({ keepalive })`: все pending сразу; с keepalive включает ключ последней версии в полёте, без keepalive его пропускает; при stopped ничего не шлёт.
- `discard`: поколение +1, всё очищено, поздние ответы игнорируются без onChange; после discard очередь работает заново.
- `close`: closed, таймеры и pending сняты, промис разрешается после исхода записи в полёте; дальнейшие set игнорируются.
- `dispose`: таймеров нет, send больше не вызывается, поздние ответы игнорируются.
- `getState()` возвращает один и тот же объект до следующей смены состояния; `onChange` вызывается на set, начало отправки, исход, drain, resume, discard, close.

## Deviations from Plan

Отклонений по содержанию нет. Исправлено одно собственное ожидание теста `oldestPendingSince` (см. «TDD»), реализация под тест не подгонялась.

## Issues Encountered

- `codegraph` не инициализирован в worktree: `impact` и `affected` выполнены по индексу основного дерева.
- В выводе `yarn verify` есть лог `relation "users" does not exist` от серверного теста без БД и предупреждения lint `DashboardClient.tsx` — существовали до плана, шаги passed.

## Known Stubs

Нет.

## Threat Flags

Нет: маршруты, коды ответов, тела сервера, миграции и env-ключи не менялись.

## Deferred human verification

Нет. Коммит файлов плана делает ведущая сессия.

## Next Phase Readiness

- 06-03 и 06-04 импортируют `createSaveQueue` и типы из `app/web/lib/drafts/save-queue.ts`, `saveAttemptDraft` и `AttemptDraftSaveResult` из `app/web/lib/tests/api.ts`, `AttemptSession` и `SaveAttemptDraftRequest` из `@bio-exam/exam-core`.
- 06-09 снимает `saveAnswer`, `saveSessionTelemetry` и, при переходе на модуль, может заменить `SessionInfo` web на `AttemptSession`.

## Self-Check: PASSED

- FOUND: все 11 файлов плана (`git status`: 6 M, 5 ??)
- FOUND: .planning/commit-snapshots/before-06-02/fingerprint.json
- Коммиты: не выполнялись по правилу пользователя

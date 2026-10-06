---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 15
subsystem: web/attempt-lifecycle, web/lib/drafts
tags: [CR-03, CR-05, DEBT-08, TIME-06, save-queue, bfcache]
requires: [11-14]
provides:
  - "Повтор /start на месте у теста без лимита (события online/visible и таймер SAVE_RETRY_DELAYS_MS)"
  - "Опция provisional у SaveQueueOptions.send и предварительная досылка в drain"
  - "Событие visible на pageshow из bfcache в browserVisibility"
affects: [app/web/lib/drafts/question-draft-autosave.ts]
tech-stack:
  added: []
  patterns: ["предварительная досылка без подтверждения и повтор последнего значения после ответа старого запроса"]
key-files:
  created: []
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
    - app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
    - app/web/lib/drafts/save-queue.ts
    - app/web/lib/drafts/save-queue.test.ts
decisions:
  - "provisional ставится в drain при любом keepalive, если по ключу в полёте другая версия; объект опций без provisional остаётся { keepalive }, чтобы прежние deepEqual-ассерты не менялись"
  - "Модуль попытки не передаёт provisional в api.saveDraft: опция влияет только на confirm"
  - "Повтор /start запускается из ветки runStart без лимита; после неудачной сдачи (failSubmit) таймер не взводится, повтор идёт по событиям online/visible"
status: complete
metrics:
  duration: "~25 мин"
  completed: 2026-10-06
actuals:
  tokens: 5200
  tasks: 2
  commits: 0
plan_head_before: e3e1a75b769ec3db2164c5d51713588c00df4b75
plan_head_after: e3e1a75b769ec3db2164c5d51713588c00df4b75
---

# Phase 11 Plan 15: CR-03 и CR-05 в модуле попытки Summary

Попытка без сессии у теста без лимита сама повторяет `/start` (события `online`/`visible` и таймер с паузами `SAVE_RETRY_DELAYS_MS`) и применяет сессию без лишнего визита; досылка `drain` по ключу со старой версией в полёте уходит как `provisional` и не подтверждает WAL, а очередь после ответа старого запроса отправляет последнее значение ещё раз; `pageshow` из bfcache даёт событие `visible`.

## Закрытые записи 06-REVIEW

- **CR-05** (`.planning/milestones/v1.0-phases/06-draft-durability/06-REVIEW.md`, попытка без сессии не повторяет `/start`): в `lifecycle.ts` добавлены `needsStartRetry`, `scheduleStartRetry`, `retryStart`, `stopStartRetry`. Условие повтора — `initialized && phase === 'active' && session === null && !timeLimitMinutes`, проверяется до запроса и после ответа (вместе с `generation`). Флаг `startRetryInFlight` не даёт параллельных `/start` от таймера и событий. Успех — `applyServerSession(server, null)`, `enqueuePending()`, `emit()` без `enterActive`, счётчик визитов не растёт. Текущий вопрос сохраняется: `resolveRestoredDraft` для WAL без сессии берёт позицию из черновика сервера или первый вопрос, поэтому `retryStart` возвращает прежнюю позицию и пишет её в WAL новой сессии через `recordPosition`. Неудача — следующая пауза (последняя повторяется), 403 — `blockStart(null)`. `init`, `reset`, `dispose` снимают таймер.
- **CR-03** (там же, досылка при `pagehide` параллельно запросу в полёте): в `save-queue.ts` `drain` помечает досылку ключа, у которого в полёте другая версия, и вызывает `send(key, value, { keepalive, provisional: true })`; в `settleDrained` при `ok` для такой досылки `acknowledge` не вызывается, запись снова `due`, затем `pump` (или `kick` при таймере повтора). Пока старый запрос в полёте, `pump` ничего не шлёт; после его ответа `settle` → `pump` отправляет последнее значение обычным запросом. Работают оба порядка ответов. В `lifecycle.ts` `send` при `provisional` не вызывает `confirm` и передаёт в `api.saveDraft` только `{ keepalive }`. В `use-attempt-lifecycle.ts` подписка на `pageshow`: при `event.persisted` вызывается `listener('visible')`, отписка рядом с остальными.

## Задачи

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | CR-05: попытка без сессии сама получает сессию при возврате связи (tracer) | не коммитится (правила фазы) | lifecycle.ts, lifecycle.test.ts |
| 2 | CR-03: досылка при запросе в полёте не подтверждает старое значение; pageshow; ворота | не коммитится (правила фазы) | save-queue.ts, save-queue.test.ts, lifecycle.ts, lifecycle.test.ts, use-attempt-lifecycle.ts |

## Красные и зелёные прогоны

Задача 1, шаг 1 (красный), `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle`:
```
× CR-05: первый /start упал, событие online даёт сессию s1, ответ уходит PATCH, индикатор offline → saved, визит не растёт
× CR-05: без событий повтор /start через SAVE_RETRY_DELAYS_MS[0], после новой неудачи — через SAVE_RETRY_DELAYS_MS[1]
× CR-05: повтор уже в полёте — второе событие не шлёт ещё один /start
× CR-05: 403 на повтор /start — blocked start-not-assigned, повторов больше нет
Test Files  1 failed | 7 passed (8)
     Tests  4 failed | 204 passed (208)
```
Тесты «dispose снимает таймер», «retake снимает таймер», «у теста с лимитом повтора нет» на старом коде зелёные: это охранники нового таймера.

Задача 1, шаг 3 (зелёный): `Test Files 8 passed (8)`, `Tests 208 passed (208)`. Ворота tracer: `<verify>` задачи 1 прогнан повторно перед задачей 2 — зелёный.

Дополнительно (Rule 1, найдено после зелёного прогона задачи 2): тест «CR-05: после повтора /start текущий вопрос остаётся прежним, позиция в WAL новой сессии» на коде задачи 1 красный (`Expected: Q3`, `Received: Q1`; `Tests 1 failed | 209 passed (210)`), после правки `retryStart` — зелёный.

Задача 2, шаг 1 (красный), `yarn workspace @bio-exam/web vitest run lib/drafts components/tests/attempt-lifecycle`:
```
× CR-03: ответ на предварительную досылку приходит раньше ответа старой версии
× CR-03: ответ старой версии приходит раньше ответа на предварительную досылку
× CR-03: Q1 «ab» в полёте, ответ «abc», pagehide, ответ на «abc» приходит первым — WAL не подтверждён, после ответа «ab» «abc» уходит ещё раз и подтверждается
Test Files  2 failed | 12 passed (14)
     Tests  3 failed | 304 passed (307)
```
Тест «досылка ключа с той же версией в полёте и ключа без запроса идёт без provisional» на старом коде зелёный: закрепляет прежнее поведение.

Задача 2, шаг 5 (зелёный): `Test Files 14 passed (14)`, `Tests 307 passed (307)`, после правки позиции `Tests 308 passed (308)`; `question-draft-autosave.test.ts` входит в набор `lib/drafts` и зелёный без правок; прежние тесты `save-queue.test.ts` зелёные без правок ожиданий (`git diff HEAD -- app/web/lib/drafts/save-queue.test.ts` — только добавленные строки, 0 удалённых).

## Проверки

- `node --test scripts/draft-durability-guards.test.mjs` — `pass 7`, `fail 0`.
- `yarn workspace @bio-exam/web test` — `Test Files 97 passed (97)`, `Tests 1532 passed (1532)`. До плана 1520 (добавлено 12 тестов: 8 CR-05 и 1 CR-03 в `lifecycle.test.ts`, 3 в `save-queue.test.ts`).
- `yarn e2e tests/answer-durability.spec.ts tests/attempt-slow-network.spec.ts tests/question-draft-durability.spec.ts` — `30 passed (26.2s)`, после правки позиции повторно `30 passed (23.5s)`.
- `yarn verify` — все шаги `passed`, `yarn verify: OK` (повторён после правки позиции, снова `OK`).
- Проверки во встроенном браузере не было: видимых изменений интерфейса план не вносит, поведение закреплено юнит-тестами модуля и e2e.
- Критерии приёмки: `grep -c provisional` — `save-queue.ts` 8, `lifecycle.ts` 2; `grep -c pageshow use-attempt-lifecycle.ts` — 2; `lifecycle.test.ts` содержит `CR-05` и `SAVE_RETRY_DELAYS_MS`.
- `yarn exec oxfmt` по пяти файлам плана; `format-check` в `yarn verify` зелёный.

## Impact и affected

`.codegraph/` в worktree нет (индекс не в git), `codegraph init` не запускался. Замена через `rg`:
- Пользователи `createSaveQueue`: `app/web/components/tests/attempt-lifecycle/lifecycle.ts` и `app/web/lib/drafts/question-draft-autosave.ts`. Автосохранение черновика вопроса читает только `sendOptions.keepalive`; при `dispose` очередь сразу закрывается, поэтому предварительная досылка там ничего не меняет, а при `pagehide` без `dispose` значение после старого запроса досылается ещё раз обычным `exchange` со свежей `lockVersion`.
- `runStart` вызывается только внутри `lifecycle.ts` (`init`, `restoreLocally`, `restoreFromFate`, `resubmit`, `reset`, `confirmStart`); новая ветка повтора добавлена только в путь без лимита и без кэша, ветки `applyAccepted`, `applyTimeExpired`, `applyAlreadySubmitted`, `closeSession` и чтение судьбы сессии из 11-14 не тронуты.
- Затронутые тесты: `lifecycle*.test.ts`, `save-queue.test.ts`, `question-draft-autosave.test.ts`, e2e LIFE-02, LIFE-04, LIFE-05 — все прогнаны.

## Deviations from Plan

1. **[Режим worktree] `11-plan-files.cjs check 11-15` не запускался.** Шаг 6 плана требует сверку, но 11-EXEC-RULES (раздел «Режим worktree») запрещает её запуск исполнителю: сверку делает ведущая сессия. Изменены ровно пять файлов из `files_modified` плана.
2. **[Правила фазы] Коммитов нет.** Изменения оставлены в рабочем дереве, `commits: 0` при изменённом коде — по правилу пользователя коммитит ведущая сессия.
3. **`codegraph impact`/`affected` заменены на `rg`** — индекса в worktree нет.
4. **[Rule 1 - Bug] Сброс текущего вопроса после повтора `/start`.** `applyServerSession` для WAL без сессии ставит позицию из черновика сервера или первый вопрос; ученик, ушедший офлайн на Q3, при возврате связи оказался бы на Q1, а время сегмента ушло бы в Q1. `retryStart` сохраняет позицию и пишет её в WAL новой сессии; `restore.ts` не менялся (вне плана, влияет на перезагрузку). Файлы: `lifecycle.ts`, `lifecycle.test.ts`.
5. **Объём provisional.** Помечается досылка с другой версией в полёте и при `keepalive: true`, и при `keepalive: false` (план формулирует условие без привязки к `keepalive`). При `keepalive: false` (`dispose`) очередь сразу закрывается, видимого эффекта нет.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых точек и путей доступа нет. T-11-46 закрыт предварительной досылкой и тестом сценария 06-REVIEW; T-11-47 — паузы `SAVE_RETRY_DELAYS_MS` до 30 с, только пока фаза `active` без сессии, снятие при `init`/`reset`/`dispose`.

## Файлы к коммиту

- app/web/components/tests/attempt-lifecycle/lifecycle.ts
- app/web/components/tests/attempt-lifecycle/lifecycle.test.ts
- app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts
- app/web/lib/drafts/save-queue.ts
- app/web/lib/drafts/save-queue.test.ts
- .planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-15-SUMMARY.md

## Self-Check: PASSED

Все пять файлов плана изменены и есть на диске; коммитов по правилам фазы нет, HEAD = e3e1a75.

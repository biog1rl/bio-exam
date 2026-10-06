---
phase: 09-result-foundation-and-readers
plan: 06
subsystem: scored-attempt
tags: [projection, reconcile, attempt-view, open-question, exam-core]
requires: ["09-04", "09-05"]
provides:
  - "attemptResultColumns и attemptResultSql('ta') в services/scored-attempt/columns.ts: единственный набор столбцов результата для читателей (D-16)"
  - "materializeAttemptOutcome(tx, { attemptId, latestScores }) и reconcileOutcomes({ loadLatestScores, repair, batchSize }), тип LoadLatestScores, тип DbTransaction в services/scored-attempt/outcome.ts"
  - "readOutcomeFacts в read.ts: факты для итога (версия 2 с template, версия 1 без) без обращения к базе"
  - "AttemptViewSchema/AdminAttemptViewSchema += reviewStatus, autoEarnedPoints, autoTotalPoints; AttemptSummary и ReadableFact.template"
affects: [09-07, 09-08, 09-09, 09-10, 09-17, phase-12, phase-15]
tech-stack:
  added: []
  patterns:
    - "Читатели берут результат из attemptResultColumns, фактовые столбцы score_percentage/passed в read.ts не выбираются"
    - "Сравнение real-столбцов с double через Math.fround по обеим сторонам"
key-files:
  created:
    - app/server/src/services/scored-attempt/columns.ts
    - app/server/src/services/scored-attempt/outcome.ts
    - app/server/src/services/scored-attempt/outcome.test.ts
  modified:
    - app/server/src/services/scored-attempt/read.ts
    - app/server/src/services/scored-attempt/view.ts
    - app/server/src/services/scored-attempt/view.test.ts
    - app/server/src/services/scored-attempt/index.ts
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/attempt-result.test.ts
    - app/web/components/tests/attempt-lifecycle/testing.ts
decisions:
  - "Итог в materializeAttemptOutcome и reconcileOutcomes считается по фактам через readOutcomeFacts (общий parseResults), а не через readFacts: у открытого и обычного факта нужны только questionId, template, points, earnedPoints, а readFacts для версии 1 ходит в базу за ключами"
  - "Попытка, у которой пересчёт бросает (RangeError оценки или AttemptResultsShapeError), попадает в mismatched с expected { error } и не чинится; сверка не прерывается"
  - "Для сохранённого none, где факты содержат открытый вопрос (пересчёт даёт pending), ожидаемая проекция берётся из пересчёта, а не из фактовых столбцов"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 36000
  tasks: 3
  commits: 0
plan_head_before: 103e0dd63868466f260f620a98a8ed467b3fe920
plan_head_after: 103e0dd63868466f260f620a98a8ed467b3fe920
---

# Phase 9 Plan 06: Чтение результата через проекцию и единственный писатель Summary

`attemptResultColumns` читает результат попытки из проекции (`final_*`), вид попытки несёт `reviewStatus` и автобаллы, `materializeAttemptOutcome` и `reconcileOutcomes` — единственный писатель проекции и сверка с интеграционным доказательством «проекция = пересчёт» для `none`, `pending`, `graded`. `yarn verify: OK`. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия).

## codegraph impact (до правок)

- `buildAttemptView` (11): `readAttemptView`, `readAdminAttemptView`, `view.test.ts` (`viewOf`), маршруты `POST /submit` (`public.ts`) и `GET /admin/attempts/:attemptId`; сигнатура не менялась, `AttemptSummary` расширен.
- `readAttemptView` (5): `public.ts`, `routes/index.ts`, `scored-attempt/index.ts`. `readAdminAttemptView` (4): `admin/attempts.ts`. Сигнатуры не менялись.
- `AttemptViewSchema` (6): `AdminAttemptViewSchema`, `attempt-result.test.ts`, `view.ts`, `read.ts`, `index.ts` пакета. Новые поля обязательные.
- `attemptViewOf` (5): четыре `attempt-lifecycle/lifecycle*.test.ts`; фикстура получила новые поля, тесты не правились.

## Что сделано

- Task 1 (tracer): `columns.ts` (`attemptResultColumns`: `earnedPoints ← final_earned_points`, `scorePercentage ← final_score_percentage`, `passed ← final_passed`, `totalPoints ← total_points`, `autoEarnedPoints ← earned_points`, `autoTotalPoints ← auto_total_points`, `reviewStatus`; `attemptResultSql('ta')` с закрытым набором алиасов, иначе `Error`). `read.ts`: `readAttemptRow` выбирает `...attemptResultColumns`, `summaryOf` переносит новые поля, `readableFromStored` копирует `template`. `view.ts`: `ReadableFact.template`, `AttemptSummary` с `number | null`/`boolean | null`, `buildAttemptView` кладёт `reviewStatus` и автобаллы в `AttemptViewSchema.parse`; `questionStatus(fact)` получает `template` из самого факта. `exam-core`: поля вида обязательные, тест вида с отказом без `reviewStatus`/автобаллов и с неизвестным статусом, сборка `dist`. Web `attemptViewOf` и серверная фикстура `ATTEMPT` обновлены.
- Task 2: `outcome.ts` и `outcome.test.ts` (12 тестов).
- Task 3: три блока в `view.test.ts` (открытый вопрос `pending` без ключа у трёх зрителей, факт версии 1 без `template`, вид несёт `reviewStatus` и автобаллы). Правки `discloseKey` не потребовалось: у открытого факта `key == null`, поэтому `keyVisible: false` у админа уже сейчас.

## Таблица behavior (outcome.test.ts)

| Случай | Результат |
| ------ | --------- |
| Новая сдача по HTTP: ответ несёт `reviewStatus 'none'`; `final_*` равны фактовым столбцам; проекция равна пересчёту | passed |
| Три radio 1, 1, 0 из 1 (none, 66,666…%): строка режима `outcomeFacts`, проекция = пересчёт, сверка пуста | passed |
| Открытый факт с оценкой 1 из 3 (graded, 33,333…%): не представим в float4, сверка пуста | passed |
| radio 1/1 + открытый без оценки: `pending`, итог NULL | passed |
| Засеянная попытка с открытым: `pending`, `final_*` NULL, `graded_at` NULL, `auto_total_points = 1`, `total_points = 4` | passed |
| `readFacts` читает строку режима `outcomeFacts` (шаблоны совпадают) | passed |
| `materializeAttemptOutcome` с оценкой 2: `graded`, итог 3 из 4 (75%), `passed true`, `graded_at` задан; `answers`, `results`, `results_version`, `earned_points`, `total_points`, `score_percentage`, `passed` не изменились | passed |
| Оценка 0: `graded`, 25%, `passed false` | passed |
| Оценка 4 при максимуме 3: `RangeError`, проекция не изменилась (`pending`) | passed |
| Несуществующая попытка: `not found` | passed |
| Ручная порча `final_score_percentage` находится (порции по 2), с `repair: true` `repaired = 1`, значение 75, повторная сверка пуста | passed |
| `none`: смена `tests.passing_score` расхождения не даёт (D-17); порча `final_passed` находится и чинится фактами | passed |
| `UPDATE review_status = 'pending'` при непустом итоге: 23514 | passed |

Мутационная проверка: замена `Math.fround(a) === Math.fround(b)` на строгое равенство роняет случай graded 33,33%.

## Проверки

- `yarn workspace @bio-exam/exam-core build`: ок.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/attempt-submit.test.ts src/routes/tests/attempt-review.test.ts src/routes/tests/attempt-readers-none.characterization.test.ts src/services/scored-attempt`: 5 файлов, 90 тестов passed (характеризация 09-02 без правок); после Task 3 `src/services/scored-attempt`: 3 файла, 78 тестов passed.
- `yarn workspace @bio-exam/server typecheck`, `yarn workspace @bio-exam/web typecheck`: чисто.
- `node --test scripts/attempt-integrity-guards.test.mjs`: 13 pass, 0 fail.
- `yarn format:check`: чисто.
- `yarn verify`: все восемь шагов passed, `yarn verify: OK` (с первого прогона).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-06`: `09-06 changed only its files`.
- Приёмка: `grep -c "testAttempts.scorePercentage\|testAttempts.passed" read.ts` = 0; `computeAttemptOutcome` в `outcome.ts` присутствует; `* 100` в `outcome.ts` нет.

## codegraph affected

`codegraph affected` по `columns.ts`, `outcome.ts`, `read.ts`, `view.ts`, `attempt-result.ts`: 46 строк (серверные маршруты и тесты попытки, web-модули API и lifecycle-тесты); серверный набор плана и `yarn verify` зелёные.

## Deviations from Plan

**1. [Rule 1 - Design] Итог для писателя и сверки строится через `readOutcomeFacts`, а не `readFacts`**
- **Found during:** Task 2
- **Issue:** `readFacts` для версии 1 вызывает `readLegacyFacts`, который ходит в `db` (ключи по истории) вне переданной транзакции; для итога нужны только `questionId`, `template`, `points`, `earnedPoints`.
- **Fix:** в `read.ts` добавлена `readOutcomeFacts` поверх общего `parseResults` (без копии разбора); не экспортируется из `index.ts` модуля. `readFacts` по-прежнему используется только читателями вида.
- **Files modified:** `app/server/src/services/scored-attempt/read.ts`
- **Commit:** нет (коммитит ведущая сессия)

Других отклонений нет. Шаг 2 Task 3 (`discloseKey` для `open`) правки не потребовал.

## Known Stubs

Нет. Ограничение, а не заглушка: `AttemptViewSchema` пока требует `earnedPoints`, `scorePercentage`, `passed` не-null (по плану, nullable-контракт вводит 09-17), поэтому `readAttemptView` для засеянной попытки `pending` выбросит ошибку разбора схемы. HTTP-путь такую попытку до фаз 12 и 15 не создаёт.

## Threat Flags

Нет новых поверхностей сверх `<threat_model>`. T-09-17 (один экспорт `attemptResultColumns`/`attemptResultSql`, у `pending` итог NULL в базе), T-09-18 (`reconcileOutcomes` с `repair`, тест порчи и починки), T-09-19 (алиас из закрытого набора, иначе `Error`) закрыты. Писатель не вызывается маршрутами.

## Файлы к коммиту

```
 M app/server/src/services/scored-attempt/index.ts
 M app/server/src/services/scored-attempt/read.ts
 M app/server/src/services/scored-attempt/view.test.ts
 M app/server/src/services/scored-attempt/view.ts
 M app/web/components/tests/attempt-lifecycle/testing.ts
 M packages/exam-core/src/attempt-result.test.ts
 M packages/exam-core/src/attempt-result.ts
?? app/server/src/services/scored-attempt/columns.ts
?? app/server/src/services/scored-attempt/outcome.test.ts
?? app/server/src/services/scored-attempt/outcome.ts
```

`docs/adr/0006-enforce-authorization-by-construction.md` принадлежит другой сессии и в коммит не входит.

## Self-Check: PASSED

Созданные файлы на месте, `yarn verify: OK`, сверка файлов плана пройдена.

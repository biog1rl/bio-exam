---
phase: 09-result-foundation-and-readers
plan: 03
subsystem: exam-core
tags: [open-question, manual-scoring, registry, adapters, exam-core]
requires: ["09-02"]
provides:
  - "Шаблон open, метрика manual, KeyShape 'none', openAdapter в exam-core"
  - "AUTO_SCORED_TEMPLATES, isAutoScoredTemplate, AutoScoredTemplate"
  - "Встроенный тип open с максимумом 3 баллов; ранний выход scoreQuestionFacts для manual"
affects: [09-04, 09-08]
tech-stack:
  added: []
  patterns: ["мета-тесты с автометрикой перебирают AUTO_SCORED_TEMPLATES", "ранний выход подсчёта по метрике manual до чтения ключа"]
key-files:
  created:
    - packages/exam-core/src/adapters/open.ts
  modified:
    - packages/exam-core/src/registry.ts
    - packages/exam-core/src/scoring.ts
    - packages/exam-core/src/adapters/index.ts
    - packages/exam-core/src/adapters/types.ts
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
    - app/web/app/(internal)/(protected)/admin/tests/types/index.ts
    - app/web/components/tests/attempt-review/review-viewers.test.ts
decisions:
  - "Максимум 3 хранится константой OPEN_QUESTION_MAX_POINTS в registry.ts и не экспортируется из пакета (не входит в EXPECTED_EXPORTS); правило встроенного типа, правило по умолчанию и ранний выход берут её"
  - "Текст ошибки «У открытого вопроса не бывает вариантов ответа» лежит в adapters/open.ts, а не в AUTHORING_MESSAGES: authoring-messages.ts вне files_modified плана, сверка файлов 09-plan-files.cjs его отвергает"
  - "normalizeAnswer открытого шаблона возвращает строку как есть, для не строки null (в отличие от прочих шаблонов число в строку не приводится)"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 26000
  tasks: 3
  commits: 0
plan_head_before: d862a67
---

# Phase 9 Plan 03: Шаблон open в exam-core Summary

Шаблон `open` проходит путь реестр -> адаптер -> `scoreQuestionFacts` (максимум 3, получено 0, без ошибок, ключа и вердиктов) -> собранный `dist` -> мета-тесты и таблицы случаев -> записи web. `yarn verify: OK`.

## Что сделано

- Task 1 (tracer): `registry.ts` — `'open'` последним в `QUESTION_UI_TEMPLATES`, `'manual'` последней в `MISTAKE_METRICS`, `open: ['manual']` последним ключом `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE`; `AutoScoredTemplate`, `AUTO_SCORED_TEMPLATES`, `isAutoScoredTemplate`; встроенный тип `open` (`exact_match` / `manual` / 3); ветка `open` в `createDefaultScoringRuleForTemplate`. `adapters/open.ts` и `KeyShape 'none'`. `scoring.ts` — ранний выход по `manual` в `scoreQuestionFacts` и в `scoreQuestionByType`. Экспорты в `index.ts`, `EXPECTED_EXPORTS` (+`AUTO_SCORED_TEMPLATES`, `isAutoScoredTemplate`, `openAdapter`, 72 -> 75). Случаи `open` в `scoring.test.ts`: без ключа с ответом, без ответа, с ключом по ошибке и fallback 1, с массивом в ключе, повреждённое правило типа.
- Task 2: таблицы и мета-тесты. `registry.test.ts` (строка `manual -> open`, `AUTO_SCORED_TEMPLATES`, `manual` только у `open`, встроенный тип), `cases/answer.cases.ts` (4 строки `open`), `cases/review.cases.ts` (`isAnswered` x4, `readKey` x2), `cases/authoring.cases.ts` (группа `open`: 2 проходящие, 3 отклоняющие, `keyShape 'none'`, `toCanonicalKey`), `invariants.test.ts` (перебор `AUTO_SCORED_TEMPLATES`, отдельный инвариант `open`: 3/0 при 6 ответах x 4 ключах), `review.test.ts`, `answer.test.ts`, `authoring.test.ts`. Ни один прежний `test`/`test.each` не удалён и не ослаблен.
- Task 3: `TEMPLATE_META.open`, `MISTAKE_METRIC_LABELS.manual`, `MISTAKE_METRIC_DESCRIPTIONS.manual`; в `review-viewers.test.ts` таблица `QUESTIONS` и `Row.template` на `AutoScoredTemplate`.

## codegraph impact (до правок)

- `QUESTION_UI_TEMPLATES` (16 символов): `registry.ts` (`TEMPLATE_BY_METRIC`, `templateForMetric`, `QuestionTypeDefinitionSchema`), `attempt-result.ts` (`z.enum`), сервер `routes/tests/admin/question-types.ts`, web страницы `question-types/*` (`QuestionTypesPageClient`, `page.tsx`, `[key]/...`), мета-тесты exam-core.
- `MISTAKE_METRICS` (11): `registry.ts` (`QuestionTypeScoringRuleSchema`, `QuestionTypeDefinitionSchema`), `attempt-result.ts`, `scoring.ts` (`normalizeScoringRule`), сервер `lib/tests/question-type-resolver.ts`, `routes/tests/admin/question-types.ts`, `routes/tests/admin/shared.ts`.
- `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE` (30): `registry.ts`, пять адаптеров, `review.ts` (`computeVerdicts`, `readKey`), `scoring.ts`, web `admin/tests/types/index.ts`, `QuestionTypeScoringRuleEditor.tsx`, сервер `question-type-resolver.ts` (`parseScoringRule`), тесты.
- `scoreQuestionFacts` (19): `scored-attempt/facts.ts` (`scoreSubmission`), `legacy-fact.ts`, `legacy.ts`, `routes/tests/public.ts` (submit), тесты `scored-attempt`, `review-viewers.test.ts`.
- Серверные и web места, выбирающие шаблон и допускающие включение типа (`question-types.ts`, `shared.ts`, страницы типов), — план 09-08.
- Исчерпывающие отображения: `rg "Record<QuestionUiTemplate|Record<MistakeMetric|satisfies Record<..."` — ровно `registry.ts`, `adapters/index.ts`, `admin/tests/types/index.ts` (три записи), `review-viewers.test.ts`; других мест нет.

## Тесты, упавшие до правок мета-тестов

После добавления шаблона в реестр: `authoring.test.ts` (покрытие таблиц), `invariants.test.ts` (две проверки: строки каждого шаблона и mistakes > 0 / === 0), `registry.test.ts` (`templateForMetric` покрывает все метрики), `review.test.ts` (`isAnswered` true и false на шаблон), `answer.test.ts` (покрытие таблицы формы ответа). Итого 6 упавших тестов в 5 файлах. `cases/scoring.cases.ts:32` менять не пришлось: тип `open` попадает в `SCORING_TYPES_MAP`, но таблиц случаев и перебора по нему нет.

## Число тестов exam-core

До плана 609, после 647 (13 файлов).

## Проверки

- `yarn workspace @bio-exam/exam-core test` — 647 passed.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` — `exam-core dist OK ... 75 экспортов`.
- `yarn workspace @bio-exam/web vitest run components/tests/attempt-review/review-viewers.test.ts` — 45 passed.
- `yarn verify` — `yarn verify: OK` (повторён после последних правок).
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-03` — `09-03 changed only its files`.

## codegraph affected

`codegraph affected` по `registry.ts`, `scoring.ts`, `adapters/open.ts`, `admin/tests/types/index.ts`, `review-viewers.test.ts` вернул 183 тестовых файла (практически все серверные интеграционные, так как пакет подключён везде); полный набор покрыт `yarn verify`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Устаревший `app/web/.next/types`**
- **Found during:** Task 3, `yarn typecheck`
- **Issue:** `tsc --noEmit` в web падал на `.next/types/validator.ts(141,39)`: артефакт сборки от 2026-10-06 00:34 ссылается на удалённую страницу `questions/new/page`. Не связан с изменениями плана (`.next` в `.gitignore`).
- **Fix:** каталог `app/web/.next/types` перенесён в scratchpad (`.../scratchpad/stale-next-types`), `next build` пересоздаёт его сам. Отслеживаемые файлы не затронуты.
- **Files modified:** нет (только неотслеживаемый артефакт)

**2. Текст ошибки открытого вопроса вне AUTHORING_MESSAGES**
- План разрешал новый ключ в `AUTHORING_MESSAGES`, но `authoring-messages.ts` не входит в `files_modified`, и сверка файлов плана падает на нём. Текст оставлен константой в `adapters/open.ts`. Если в 09-08 или в web нужен тот же текст, ключ стоит вынести в `AUTHORING_MESSAGES` там.

**3. `authoring.ts` не менялся** — `keyShape 'none'` не требует правок (`toCanonicalKey` оставляет ключ `open` как есть, `validateQuestionForSave` не требует ключа).

**4. Несколько файлов `files_modified` изменены ради сверки** — `answer.test.ts`, `review.test.ts`, `authoring.test.ts` получили по содержательному тесту (пустая строка `open`, разбор вердиктов по `AUTO_SCORED_TEMPLATES` с исключением для `open`, независимость проверки `open` от ключа), чтобы все файлы плана были изменены, как требует сверка. Опциональные `cases/scoring.cases.ts`, `authoring.ts` не менялись.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности сверх плана. T-09-06 закрыт ранним выходом по `manual` и тестом с ключом, переданным по ошибке. T-09-07 (запрет создания кастомного типа с шаблоном `open`) — план 09-08: до него `z.enum(QUESTION_UI_TEMPLATES)` на сервере уже принимает `'open'`.

## Файлы к коммиту

`packages/exam-core/src/{registry,scoring,index}.ts`, `packages/exam-core/src/adapters/{open (новый),index,types}.ts`, тесты и таблицы случаев `packages/exam-core/src/{scoring,registry,answer,review,authoring,invariants}.test.ts`, `packages/exam-core/src/cases/{answer,authoring,review}.cases.ts`, `scripts/check-exam-core-dist.mjs`, `app/web/app/(internal)/(protected)/admin/tests/types/index.ts`, `app/web/components/tests/attempt-review/review-viewers.test.ts`. Неотслеживаемый `docs/adr/0006-...` не трогался.

## Self-Check: PASSED

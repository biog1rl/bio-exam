---
phase: 03-exam-core
plan: 08
subsystem: exam-scoring-server
tags: [exam-core, scoring, registry, drizzle, jsonb, D-11, D-16, D-17, EXAM-04, EXAM-06]
requires: [03-01, 03-04, 03-07, 03-13]
provides:
  - "POST /api/tests/public/tests/:id/submit оценивает scoreQuestionByType из @bio-exam/exam-core"
  - "Реестр шаблонов на сервере только из пакета: question-type-resolver.ts, routes/tests/index.ts, scripts/e2e-seed.ts, import type в schema.ts"
  - "answer_keys.correct_answer на customType jsonbParsedByDriver: без второго JSON.parse, SQL-тип jsonb, миграции нет"
  - "HTTP-строки D-11 в exam-flow.test.ts и переключённый answer-keys-jsonb.test.ts"
affects: [03-09, 03-10, 03-11]
tech-stack:
  added: []
  patterns:
    - "Колонка jsonb, где на верхнем уровне бывает строка, объявляется через customType с dataType 'jsonb', toDriver JSON.stringify и fromDriver без разбора"
key-files:
  created: []
  modified:
    - app/server/src/routes/tests/public.ts
    - app/server/src/lib/tests/scoring.ts
    - app/server/src/lib/tests/question-type-resolver.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/scripts/e2e-seed.ts
    - app/server/src/db/schema.ts
    - app/server/src/db/answer-keys-jsonb.test.ts
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/README.md
  deleted:
    - app/server/src/lib/tests/question-types.ts
    - app/server/src/lib/tests/scoring.test.ts
    - app/server/src/lib/tests/scoring-parity.test.ts
decisions:
  - "D-11 исправлен основным способом плана: customType jsonbParsedByDriver в schema.ts только для answerKeys.correctAnswer; drizzle-kit generate без диффа, запасной вариант через sql не понадобился"
  - "Строки D-11 в exam-flow.test.ts вынесены в отдельный describe со своим тестом: тест «неотвеченный вопрос» обходит все вопросы своего теста, новые вопросы в общем тесте изменили бы его охват"
  - "Сверх behavior добавлены строки ключа '10.0' (ответы '10.0' и '10') и ключей 'false', 'null' — план называет их в том же правиле"
metrics:
  duration: "~6 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 11500
  tasks: 3
  commits: 0
status: complete
deferred_human_gate: true
---

# Phase 3 Plan 08: сервер оценивает пакетом, реестр из пакета, ключи без второго JSON.parse Summary

Submit оценивается `scoreQuestionByType` из `@bio-exam/exam-core`. Серверные копии оценки (`scoring.ts:72-313`) и реестра (`question-types.ts`) удалены. `answer_keys.correct_answer` читается через `customType` без второго `JSON.parse`, ключи `'3142'`, `'1.50'`, `'true'` приходят строками. Миграции нет.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило.

## Выполнено

**Task 1 (tracer): submit оценивается пакетом.**
- Паритет перед удалением копии, последний прогон на настоящем коде: `vitest run src/lib/tests/scoring-parity.test.ts` → `1 passed`. Вывод: `паритет: входов 18394 (sequence_digits 17448, single_choice 28, multi_choice 323, matching 211, short_text 384), конфигов на вход 7, fallbackMaxPoints 3, комбинаций 386274`.
- `public.ts`: `scoreQuestionByType` импортируется из `@bio-exam/exam-core` в общем импорте пакета. Вызов, правило скрытия ключа `correctAnswer: isCorrect || !test.showCorrectAnswer ? null : correctAnswer` и обработка результата не менялись.
- `scoring.ts`: удалены импорт `./question-types.js`, нормализация, шесть счётчиков ошибок, `scoreByMetric`, `clampPoints`, `scoreByRule`, `normalizeRule`, `scoreQuestionByType`, типы `ScoreQuestionResult`, `RuntimeQuestionTypeConfig`, `ScoreQuestionByTypeInput`. Остался только legacy-блок (D-19): `SCORING_FORMULAS`, `QUESTION_TYPES`, `QuestionScoringRuleSchema`, `TestScoringRulesSchema`, `createDefaultTestScoringRules`, `DEFAULT_TEST_SCORING_RULES`, `parseTestScoringRules`, `resolveEffectiveScoringRules`. Файл сократился с 313 до 61 строки, импортирует только `zod`.
- Удалены `scoring.test.ts` (29 сценариев перенесены в таблицы пакета в 03-13, соответствие в 03-13-SUMMARY) и `scoring-parity.test.ts` (D-15).
- Гейт tracer (auto): `<verify>` перезапущен после правки, `exam-flow.test.ts` → `55 passed (55)`, typecheck код 0. `⚡ Tracer verified end-to-end — expanding`.
- sha256 `exam-flow.test.ts` до задачи и после: `693afbc7e23ea24c1c6e91dde187053b5d7b81fd089003d68ae92ba19e0fecdc` / `693afbc7e23ea24c1c6e91dde187053b5d7b81fd089003d68ae92ba19e0fecdc`, совпадают.

**Task 2: реестр из пакета.**
- `question-type-resolver.ts`: оба импорта из `./question-types.js` заменены одним импортом из `@bio-exam/exam-core` (`QuestionTypeScoringRuleSchema`, `QuestionTypeValidationSchema`, `createDefaultScoringRuleForTemplate`, `isMistakeMetricAllowedForTemplate`, типы `MistakeMetric`, `QuestionTypeDefinition`, `QuestionTypeScoringRule`, `QuestionUiTemplate`). `validateByTemplate` и помощники не тронуты (их меняет 03-09).
- `routes/tests/index.ts`: `QuestionTypeDefinitionSchema`, `QuestionTypeScoringRuleSchema`, `QuestionTypeValidationSchema`, `isMistakeMetricAllowedForTemplate` из пакета. Литералы шаблонов и `validateScoringRuleTemplateCompatibility` не тронуты (03-09). Импорт legacy из `scoring.js` остаётся.
- `scripts/e2e-seed.ts`: `getBuiltinQuestionTypeByKey` динамически импортируется из `@bio-exam/exam-core`.
- `schema.ts`: `import type { QuestionTypeScoringRule, QuestionUiTemplate, TelemetryMap } from '@bio-exam/exam-core'` (слито с импортом `TelemetryMap` из 03-12). `import type { TestScoringRules } from '../lib/tests/scoring.js'` остаётся (D-19).
- `question-types.ts` удалён. Перед удалением сверен с `packages/exam-core/src/registry.ts`: отличия только в имени типа `BuiltinQuestionTypeSeed` → `BuiltinQuestionType` и добавленных в пакете `QuestionTypeValidation`, `templateForMetric`. Логика схем и встроенных типов совпадает.
- `app/server/README.md`, раздел «Шаблоны вопросов»: ссылка на `src/lib/tests/question-types.ts` заменена на пакет `packages/exam-core` (`@bio-exam/exam-core`); строка `sequence_digits` описывает метрику: несовпадения позиций и разница длины, соседняя перестановка при длине больше трёх цифр — одна ошибка. Пять идентификаторов шаблонов на месте, новых команд `yarn …` нет.
- После задачи `exam-flow.test.ts` + `answer-keys-jsonb.test.ts` → `69 passed | 6 expected fail (75)`, sha256 характеризации не изменился. Тест «тип с exactChoiceCount меньше minOptions не создаётся: 400» зелёный на схеме пакета.

**Task 3 (TDD): D-11.**
- `schema.ts`: `jsonbParsedByDriver = customType<{ data: unknown; driverData: unknown }>` с `dataType() → 'jsonb'`, `toDriver → JSON.stringify(value)`, `fromDriver → value`. Применён только к `answerKeys.correctAnswer` (`.notNull()` сохранён), остальные jsonb-колонки не тронуты. Объявление в самом `schema.ts`, новых runtime-импортов из модулей приложения нет (`customType` из `drizzle-orm/pg-core`).
- `answer-keys-jsonb.test.ts`: константа `KNOWN_DEFECTS` и ветка `test.fails` удалены; шесть проверок чтения — обычные `test` с прежними утверждениями (`typeof value === 'string'`, `value === key`), без суффикса «исправляется в 03-08».
- `exam-flow.test.ts`: добавлен `describe('D-11: ключи answer_keys читаются как записаны')` с отдельным тестом и вопросами. Существующие строки не менялись: если удалить добавленный блок, sha256 файла снова `693afbc7…0fecdc`. Новый sha256 `a495857d66a082bf2d9e348438b9873f17c028170a6d47b87abb91f7b36d919a`.

| Строка D-11 (HTTP) | До D-11 (RED) | После D-11 |
|---|---|---|
| short_answer ключ `'1.50'`, ответ `'1.50'` | 0 из 1 | 1 из 1, isCorrect true |
| short_answer ключ `'1.50'`, ответ `'1.5'` | 1 из 1 | 0 из 1, isCorrect false |
| short_answer ключ `'1e3'`, ответ `'1e3'` | 0 из 1 | 1 из 1 |
| short_answer ключ `'1e3'`, ответ `'1000'` | 1 из 1 | 0 из 1 |
| short_answer ключ `'10.0'`, ответ `'10.0'` | 0 из 1 | 1 из 1 |
| short_answer ключ `'10.0'`, ответ `'10'` | 1 из 1 | 0 из 1 |
| short_answer ключ `'true'` / `'false'` / `'null'`, ответ тот же | 0 из 1 | 1 из 1 |
| sequence ключ `'3142'`, ответ `'3141'`: `correctAnswer` | `3142` (число) | `'3142'` (строка, `assert.equal`) |

## Выводы CodeGraph (D-17)

`codegraph impact scoreQuestionByType` (до правок, два определения):
- серверная копия `app/server/src/lib/tests/scoring.ts:286` — 6 символов: `scoring.ts`, `scoring-parity.test.ts`, `scoring.test.ts`, `public.ts` (маршрут `POST /api/tests/public/tests/:id/submit:684`), `routes/index.ts`;
- пакет `packages/exam-core/src/scoring.ts:78` — 4 символа: `scoring.ts`, `scoring.test.ts` (`scoreCase:24`), `index.ts`.

`codegraph impact countSequenceMistakes`: только серверная копия `scoring.ts:145`, вызывающие `scoreByMetric:231` → `scoreQuestionByType:286`. Внешних вызовов нет.

`codegraph impact QuestionTypeDefinitionSchema`: серверная копия `question-types.ts:83` → `routes/tests/index.ts`, `routes/index.ts`; пакет `registry.ts:83` → `registry.test.ts`, `index.ts`.

`codegraph impact getBuiltinQuestionTypeByKey`: серверная копия `question-types.ts:215` → `scripts/e2e-seed.ts` (`main:60`); пакет `registry.ts:215` → `index.ts`.

`codegraph impact isMistakeMetricAllowedForTemplate`: серверная копия `question-types.ts:227` → 10 символов: `QuestionTypeDefinitionSchema`, `routes/tests/index.ts` (`validateScoringRuleTemplateCompatibility:117`, маршрут `PUT /api/tests/question-types/tests/:id/overrides/:key:721`), `question-type-resolver.ts` (`parseScoringRule:47`, `toRuntimeFromDb:55`, `upsertTestQuestionTypeOverride:302`), `routes/index.ts`; пакет `registry.ts:227` → `registry.test.ts`, `index.ts`, `review.ts` (`readKey:43`).

`codegraph affected app/server/src/lib/tests/scoring.ts app/server/src/routes/tests/public.ts` (после Task 1): индекс вернул только сами два файла.

`codegraph affected` по `scoring.ts`, `public.ts`, `schema.ts`, `question-type-resolver.ts`, `routes/tests/index.ts` (после Task 3): 25 файлов, среди тестов — `app/server/src/db/answer-keys-jsonb.test.ts`, `app/server/src/db/timestamps.test.ts`, `app/web/lib/auth/getServerMe.test.ts`, `e2e/tests/auth.spec.ts`, `e2e/tests/authoring.spec.ts`, `e2e/tests/review.spec.ts`, `e2e/fixtures/exam.ts`. Серверные и web-тесты прошли в `yarn verify`; e2e прогнан отдельно (`yarn e2e`: 108 passed, код 0; два `✘` — это `test.fails` известных дефектов D2/D1, `@known-defect`).

## Вложенные пути чтения `with: { answerKeys … }`

Проверка плана: `nested answerKeys reads: 0`. В `app/server/src` вне тестов вложенного чтения ключей через relational query нет; все места чтения — `select().from(answerKeys)`. Отдельный случай `db.query.questions.findMany({ with: { answerKeys: true } })` в DB-тест не добавлялся. `db.query.answerKeys.findMany()` (без `with`) уже был в тесте и зелёный.

## TDD Gate Compliance (Task 3)

RED/GREEN-коммиты не выполнялись (правило пользователя), порядок соблюдён по сути.

- **RED.** Тесты изменены до правки `schema.ts`: `answer-keys-jsonb.test.ts` переключён, строки D-11 добавлены в `exam-flow.test.ts`. Прогон обоих файлов: код 1, `Tests 16 failed | 69 passed (85)`. Упали ровно 6 проверок чтения DB-теста (`Expected: "string" Received: "number"` для 3142 и 1.50, `Received: "boolean"` для true) и 10 новых HTTP-строк (`0 !== 1` для ответов как написан ключ, `1 !== 0` для обратного направления, `3142 !== '3142'` для типа `correctAnswer`). Все 55 прежних строк характеризации и 14 прочих проверок DB-теста зелёные. Лог: `scratchpad/red-03-08.log`.
- **GREEN.** После объявления `customType`: `Tests 85 passed (85)`, typecheck код 0.
- **REFACTOR.** Не требовался.

## Проверки

- `yarn workspace @bio-exam/exam-core build && node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/exam-flow.test.ts`: после Task 1 `55 passed (55)`.
- `yarn workspace @bio-exam/server typecheck`: код 0 после каждой задачи.
- `no scoring copies`; `scoring.ts` экспортирует `TestScoringRulesSchema` и `resolveEffectiveScoringRules`; `test ! -e scoring.test.ts && test ! -e scoring-parity.test.ts` → 0.
- `node scripts/check-docs-commands.mjs` → `check-docs-commands: OK`; `node --test scripts/check-docs-structure.test.mjs` → `pass 5, fail 0`.
- `yarn e2e --seed-only` → код 0, `e2e-seed: users=8 tests=8 questions=16 prompts=16`.
- `test ! -e app/server/src/lib/tests/question-types.ts` → 0; `question-types.js` в `app/server/src` не найден; проверка `import type` в `schema.ts` → 0.
- `vitest run src/db/answer-keys-jsonb.test.ts src/routes/tests/exam-flow.test.ts` → `85 passed (85)`; `d11 flipped`; `nested answerKeys reads: 0`.
- `cd app/server && node vercel-build.cjs` → `=== Build completed successfully! ===` (до плана и после Task 3).
- `yarn verify` → `yarn verify: OK`; все восемь шагов `passed`; `migrations`: `generate-no-diff: No schema changes, nothing to migrate`, `drizzle-check: Everything's fine`. Тесты: exam-core 490, rbac 2, server 234 (было 248 + 6 expected fail; −29 `scoring.test.ts`, −1 паритет, +10 строк D-11, 6 expected fail стали обычными), web 170 + 2 expected fail.
- `test -z "$(git status --porcelain --untracked-files=all -- app/server/drizzle)"` → 0.
- `yarn e2e` → `108 passed`, код 0.
- `git status --porcelain -- app/server/src/lib/tests`: ` M question-type-resolver.ts`, ` D question-types.ts`, ` D scoring.test.ts`, ` M scoring.ts` и удаления 03-12 (`submit-result.ts`, `telemetry.test.ts`, `telemetry.ts`). `scoring-parity.test.ts` не отслеживался git, поэтому в статусе его нет.
- Пакет не держит изменяемого состояния модуля: `let`/`var` на верхнем уровне в `packages/exam-core/src` вне тестов не найдено; `scoreQuestionByType` — функция от входа (edge EXAM-04 concurrency, backstop).
- Сохранённые результаты: план не добавил `UPDATE test_attempts` и не менял чтение сохранённых `results`; повтор submit с тем же `clientAttemptId` зелёный в таблице I (D-06).
- Комментариев в коде не добавлено; существующий комментарий в строке `correctAnswer` в `schema.ts` сохранён. `yarn oxfmt` прогнан только по файлам плана.

## Deviations from Plan

**1. [Решение исполнителя (автономно)] Строки D-11 в отдельном `describe`.** План предписывает добавить строки в `exam-flow.test.ts`, не меняя ожиданий. Тест «неотвеченный вопрос» в `describe('оценка submit по шаблонам')` обходит все вопросы своего теста; новые вопросы в нём расширили бы охват существующей проверки. Отдельный `describe` со своим `createTest()` оставляет прежние тесты нетронутыми, что подтверждено sha256.

**2. [Дополнение] Строки `'10.0'`, `'false'`, `'null'`.** Behavior называет их «ведёт себя так же» и «то же для 'false' и 'null'»; закреплены отдельными строками.

**3. [Дополнение] `yarn e2e` полностью.** Не входит в `<verify>` плана; прогнан, потому что `codegraph affected` указал e2e-спеки, а D-11 меняет и чтение ключа в админских маршрутах.

## Known Stubs

Нет.

## Threat Flags

Нет новых сетевых точек и путей доступа. T-3-15: паритет на 386274 комбинациях прогнан последним перед удалением копии, характеризация зелёная без изменения ожиданий. T-3-16: SQL-тип колонки `jsonb`, `generate-no-diff` без диффа, `app/server/drizzle` не изменён. T-3-17: правило скрытия ключа не менялось, таблица H зелёная.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял. Выполнить до деплоя 03-08, read-only на проде.

**1. Ключи `short_text`, похожие на JSON-литерал (CONTEXT `<specifics>` п. 3, D-11).** После 03-08 такие ключи сравниваются как написаны, балл новых сабмитов может измениться. Направление изменения, которое видит автор вопроса: ключ `"1.50"` сейчас читается как 1.5 и засчитывает ответ «1.5», после D-11 засчитывается только «1.50» (то же для `"10.0"` и `"1e3"`); ключи `"true"`, `"false"`, `"null"` сейчас не засчитываются никогда, после D-11 засчитываются как текст. Подтверждено HTTP-строками этого плана (RED до правки, GREEN после).

```sql
SELECT jsonb_typeof(correct_answer) AS kind, count(*) FROM answer_keys GROUP BY 1;

SELECT count(*)
FROM answer_keys ak
JOIN questions q ON q.id = ak.question_id
JOIN question_types qt ON qt.key = q.type
WHERE qt.ui_template = 'short_text'
  AND jsonb_typeof(ak.correct_answer) = 'string'
  AND (ak.correct_answer #>> '{}') ~ '^(-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?|true|false|null)$';
```

Если первый запрос покажет `number`, в данных есть настоящие числовые ключи: их покрывает `readKey` пакета, миграция не нужна. Если счётчик второго запроса больше нуля, выгрузить сами ключи (тот же `WHERE`, вместо `count(*)` — `q.id, ak.correct_answer #>> '{}'`) и решить по ним: оставить как есть или поправить ключи и ответы.

**2. Дважды закодированные ключи (C6).** Второй `JSON.parse` сейчас молча превращает строковое значение, начинающееся с `[` или `{`, в массив или объект. После D-11 такой ключ остаётся строкой и оценивается как ключ неверной формы (максимум ошибок, 0 баллов, D-12).

```sql
SELECT count(*)
FROM answer_keys ak
JOIN questions q ON q.id = ak.question_id
JOIN question_types qt ON qt.key = q.type
WHERE ak.is_active
  AND jsonb_typeof(ak.correct_answer) = 'string'
  AND (
    qt.ui_template IN ('multi_choice', 'matching')
    OR qt.scoring_rule->>'mistakeMetric' = 'compact_text_in_set'
    OR EXISTS (
      SELECT 1
      FROM test_question_type_overrides o
      WHERE o.test_id = q.test_id
        AND o.question_type_key = q.type
        AND o.scoring_rule_override->>'mistakeMetric' = 'compact_text_in_set'
    )
    OR (ak.correct_answer #>> '{}') ~ '^\s*[\[{]'
  );
```

При ненулевом счётчике заменить `count(*)` на `q.id, qt.key, ak.correct_answer #>> '{}'` и выгрузить ключи. Результат не ноль — решение пользователя до деплоя 03-08 (D-12: сохранённые ключи фаза не переписывает).

**3. Legacy `TestScoringRules` (CONTEXT `<specifics>` п. 5, D-19).** Не трогался: legacy-блок `scoring.ts`, маршруты `/scoring-rules/*` и поле `scoringRules` без изменений. Решение пользователя остаётся открытым.

**4. Коммит изменений** — за пользователем (правило пользователя).

## Файлы к коммиту

- `app/server/src/routes/tests/public.ts`
- `app/server/src/lib/tests/scoring.ts`
- `app/server/src/lib/tests/question-type-resolver.ts`
- `app/server/src/routes/tests/index.ts`
- `app/server/src/scripts/e2e-seed.ts`
- `app/server/src/db/schema.ts`
- `app/server/src/db/answer-keys-jsonb.test.ts` (новый в 03-01, не отслеживается)
- `app/server/src/routes/tests/exam-flow.test.ts` (новый в 03-01, не отслеживается)
- `app/server/README.md`
- удалены: `app/server/src/lib/tests/question-types.ts`, `app/server/src/lib/tests/scoring.test.ts`, `app/server/src/lib/tests/scoring-parity.test.ts` (последний не отслеживался git: создан в 03-05 и удалён до коммита)

`public.ts` и `schema.ts` содержат и правки 03-12 (телеметрия, схема результата), `routes/tests/index.ts` и `question-type-resolver.ts` правит 03-09.

## Self-Check: PASSED

- FOUND: все изменённые файлы на месте; `schema.ts` содержит `customType`, `answer-keys-jsonb.test.ts` содержит `jsonb_typeof`; `public.ts` импортирует `scoreQuestionByType` из `'@bio-exam/exam-core'`.
- MISSING как задумано: `question-types.ts`, `scoring.test.ts`, `scoring-parity.test.ts`.
- Коммитов нет по правилу пользователя, HEAD не изменился (7a6f95a).

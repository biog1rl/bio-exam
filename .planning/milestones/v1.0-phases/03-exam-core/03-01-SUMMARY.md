---
phase: 03-exam-core
plan: 01
subsystem: testing
tags: [vitest, characterization, express, drizzle, jsonb, postgres]

requires:
  - phase: 02-dependency-security
    provides: "app/server/src/test-support/http.ts (sessionCookieFor, startTestServer), образец KNOWN_HOLES с test.fails"
  - phase: 01-verification-baseline
    provides: "test-support/test-database.ts, scripts/with-test-db.mjs, yarn verify"
provides:
  - "HTTP-характеризация сохранения вопросов (POST, PATCH, /save) и оценки submit для шести встроенных типов и пользовательского типа через app.ts на test_*"
  - "Ограниченный список D-13: ровно три теста с префиксом «D-13 (меняется в 03-09):»"
  - "DB-доказательство D-11: KNOWN_DEFECTS = '3142', '1.50', 'true', шесть ожидаемо падающих проверок чтения"
affects: [03-08, 03-09, 03-12]

actuals:
  tokens: 8500
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "HTTP-характеризация маршрутов экзамена: vi.mock хранилища с in-memory Map, динамический импорт app.js после подмены TEST_DATABASE_URL, проверки по статусам, баллам и числу строк, без текстов ошибок"
    - "Ключи answer_keys в тестах читаются сырым SQL (jsonb_typeof, correct_answer #>> '{}'), а не через Drizzle, пока действует D-11"
    - "KNOWN_DEFECTS + test.fails для ожидаемо падающих DB-проверок (по образцу KNOWN_HOLES)"

key-files:
  created:
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/db/answer-keys-jsonb.test.ts
  modified: []

key-decisions:
  - "custom_multi_3 создаётся с validationSchema { minOptions: 3, maxOptions: 4, exactChoiceCount: 3 }: схема из плана (exactChoiceCount 2 < minOptions 3) сервером не принимается; отказ закреплён отдельным тестом"
  - "/save характеризуется двумя отказами: sequence '12a4' (отсекает zod) и no_such_type (отсекает validateQuestionWithType по глобальной карте типов)"

patterns-established:
  - "Тесты, ожидания которых разрешено менять плану 03-09, имеют префикс «D-13 (меняется в 03-09):»; других таких тестов нет"
  - "03-08 переключает ровно константу KNOWN_DEFECTS в answer-keys-jsonb.test.ts"

requirements-completed: []

coverage:
  - id: D1
    description: "Сквозной tracer: вопрос-последовательность сохраняется через POST, оценивается submit и сохраняется в test_attempts"
    requirement: EXAM-04
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/exam-flow.test.ts#последовательность: сохранение, submit и сохранённый результат"
        status: pass
    human_judgment: false
  - id: D2
    description: "Сохранение и оценка всех шаблонов, пустой ответ, скрытие ключа, идемпотентность, телеметрия черновика"
    requirement: EXAM-04
    verification:
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/exam-flow.test.ts (55 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Серверная метрика hamming_digits: ключ 1243, ответ 1234 → 1 из 2; ключ 123, ответ 132 → 0 из 2"
    requirement: EXAM-06
    verification:
      - kind: integration
        ref: "app/server/src/routes/tests/exam-flow.test.ts#sequence D2: ключ '1243', ответ '1234' — одна соседняя перестановка → 1 из 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11: jsonb_typeof всех ключей-строк = string, чтение Drizzle возвращает 3142, 1.5, true"
    verification:
      - kind: integration
        ref: "node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/db/answer-keys-jsonb.test.ts (14 passed, 6 expected fail)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 01: Характеризация сохранения и оценки до exam-core Summary

**55 HTTP-тестов через настоящий app.ts на test_* закрепляют сохранение вопросов и оценку submit для всех шаблонов (включая D2 1243/1234 → 1 из 2), а DB-тест доказывает D-11: Drizzle читает jsonb-строки '3142', '1.50', 'true' как 3142, 1.5, true**

## Performance

- **Duration:** около 15 мин
- **Completed:** 2026-10-04
- **Tasks:** 3/3
- **Files created:** 2 (код приложения не менялся)

## Accomplishments

- `app/server/src/routes/tests/exam-flow.test.ts`: tracer и таблицы A–J, 55 тестов. Хранилище подменено `vi.mock('../../services/storage/storage.js')` с in-memory `Map`. Сессии берутся из `sessionCookieFor` и `startTestServer` (`http.ts` не менялся, sha256 `2992ec0b…42b4` совпадает с 02-02-SUMMARY).
- `app/server/src/db/answer-keys-jsonb.test.ts`: 20 тестов. Шесть сырых проверок `jsonb_typeof`, две сопутствующие проверки «чтение вернуло все строки», шесть `test.fails` из `KNOWN_DEFECTS`, две проверки ключа «митоз», четыре проверки массива и объекта.
- `yarn verify: OK`. Оба файла идут в шаге `lint-typecheck-test`: `@bio-exam/server:test` даёт `Tests 248 passed | 6 expected fail (254)`.

## Task Commits

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве.

1. **Task 1 (tracer): сквозной путь последовательности.** Сначала создан файл только с tracer-тестом, его `<verify>` прогнан до расширения: `Tests 1 passed (1)`. Это гейт tracer: `⚡ Tracer verified end-to-end — expanding`.
2. **Task 2: таблицы A–J.** `Tests 55 passed (55)`, проверка формы `exam-flow shape ok`, проверка `DATABASE_URL` выходит с кодом 0.
3. **Task 3 (TDD): DB-тест D-11.** Порядок RED → GREEN описан ниже. `d11 shape ok`, `yarn verify: OK`.

## Таблица фактических статусов и баллов (A–J)

| Таблица | Случай | Факт |
|---|---|---|
| Tracer | sequence `2314`: POST, submit `2314`, test_attempts | 201; 1 активная строка answer_keys; submit 200, 2/2, isCorrect true, correctAnswer null; в test_attempts одна строка с тем же attemptId, сохранённый элемент: earnedPoints 2, isCorrect true |
| A | radio `'b'` / checkbox `['a','c']` / matching `{l1:r1,l2:r2,l3:r3}` / short_answer `'Митоз'` / short_answer_variants `['эксперимент','моделирование']` / sequence `'2314'` | все 201, одна активная строка answer_keys; jsonb_typeof: string / array / object / string / array / string |
| B | radio: ключ вне вариантов; radio: один вариант; checkbox: `[]`; matching: нет пары для l3; short_answer: `''`; short_answer_variants: строковый ключ; short_answer_variants: `['Митоз',' митоз']`; sequence: `'12a4'`; тип `no_such_type` | все 400, число строк questions не изменилось |
| C | custom_multi_3 `{minOptions:3,maxOptions:4,exactChoiceCount:3}`: 2 вар./2 верных; 3/3; 4/3; 5/3; 3/2; 4/4 | 400; 201; 201; 400; 400; 400 |
| C | тип со схемой из плана `{3,4,exactChoiceCount:2}` через POST /api/tests/question-types | 400, строки question_types нет |
| D | D-13: radio с текстом варианта `''`; matching с текстом левого элемента `'  '`; promptText `'   '` | все 201 (ровно три теста с префиксом) |
| E | PATCH sequence `2314` → `4321` | 200, `{ok:true, questionId}`; версии: v1 неактивна `2314`, v2 активна `4321` |
| E | PATCH sequence → `12a4` | 400; одна строка v1, активна, `2314` |
| F | /save: шесть корректных вопросов | 201; 6 вопросов, 6 активных ключей |
| F | /save: тот же набор, вопрос 6 `sequence '12a4'` / тип `no_such_type` | 400 / 400; теста с этим slug нет |
| G | radio `'b'` / `'a'` | 1/1 true / 0/1 false, correctAnswer `'b'` |
| G | checkbox `['a','c']` / `['a']` / `['b']` | 2/2 true / 1/2 false / 0/2 false |
| G | matching три верные / одна неверная / две неверные | 2/2 / 1/2 / 0/2 |
| G | short_answer `' митоз '` / `'мейоз'` | 1/1 true / 0/1 false |
| G | short_answer_variants `'Моделирование'` / `'наблюдение'` | 1/1 true / 0/1 false |
| G | sequence `2314`: `'2314'` / `'2315'` / `'2415'` | 2/2 / 1/2 / 0/2 |
| G | sequence D2: ключ `1243`, ответ `1234` | 1/2, isCorrect false |
| G | sequence: ключ `123`, ответ `132` | 0/2, isCorrect false |
| G | цифровой ключ `3142`: `'3142'` / `'3141'` | 2/2 true / 1/2 false, `String(correctAnswer) === '3142'` (тип значения не закреплён) |
| G | неотвеченный (answers `{}`) | у всех 9 вопросов earnedPoints 0, isCorrect false, userAnswer null |
| H | showCorrectAnswer=false, radio неверный `'a'` | correctAnswer null |
| H | showCorrectAnswer=true, radio верный `'b'` | correctAnswer null |
| I | два submit с одним clientAttemptId | оба 200, attemptId совпадает, `results` равны (`assert.deepEqual`), в test_attempts одна строка с этим clientAttemptId |
| J | start → PATCH telemetry `{100,2,1}` → PATCH `{50,3,1}` → submit telemetry `{300,0,2}` | start 200 со sessionId; оба PATCH 200; draftTelemetry `{100,3,1}`; test_attempts.telemetry `{300,3,2}` |

Что проверяют утверждения. Во всём файле нет сравнения полей `error` и `details` со строками. Закреплены HTTP-статусы, `earnedPoints`, `points`, `isCorrect`, `userAnswer`, `correctAnswer` (null, `'b'`, `String(...) === '3142'`), `ok` и `questionId` ответа PATCH, `attemptId`, число строк (`questions`, `answer_keys`, `test_attempts`, `question_types`, `tests` по slug), версии и активность ключей через сырой SQL, `draftTelemetry` и `test_attempts.telemetry`.

## Расхождения с ожиданиями плана

1. **Таблица C, схема пользовательского типа.** По плану тип создаётся с `validationSchema: { minOptions: 3, maxOptions: 4, exactChoiceCount: 2 }`. Сервер такую схему не принимает: `POST /api/tests/question-types` отвечает 400, причина в `QuestionTypeDefinitionSchema` (`question-types.ts`): правило «exactChoiceCount не может быть меньше minOptions». Факт закреплён отдельным тестом (400, строки `question_types` нет). Границы проверяются на схеме `{ minOptions: 3, maxOptions: 4, exactChoiceCount: 3 }`, ключ `custom_multi_3` и правило оценки те же, что в плане. Покрыты все шесть границ: ниже минимума, минимум, максимум, выше максимума, верных меньше и больше exactChoiceCount. Решение исполнителя (автономно).
2. **Таблица F.** Код маршрута `/save` при успехе возвращает 201, это и закреплено. Для отказа проверены два варианта: `sequence '12a4'`, который отсекает zod `QuestionSchema`, и `no_such_type`, который проходит zod и отсекается `validateQuestionWithType` по глобальной карте типов. В плане был один вариант.
3. Остальные ожидания совпали с фактом, включая D2 (`1243`/`1234` → 1 из 2), `123`/`132` → 0 из 2 и все три случая D-13 (201).

## D-11: что читает Drizzle

Ключи записаны через `db.insert(schema.answerKeys)`. Для всех шести ключей `jsonb_typeof` в базе совпадает с ожидаемым: строки `string`, массив `array`, объект `object`.

| Записанный ключ | jsonb_typeof | `db.select().from(schema.answerKeys)` | `db.query.answerKeys.findMany()` |
|---|---|---|---|
| `'3142'` | string | `3142` (number) | `3142` (number) |
| `'1.50'` | string | `1.5` (number) | `1.5` (number) |
| `'true'` | string | `true` (boolean) | `true` (boolean) |
| `'митоз'` | string | `'митоз'` (string) | `'митоз'` (string) |
| `['эксперимент','моделирование']` | array | без изменений | без изменений |
| `{ l1: 'r1' }` | object | без изменений | без изменений |

Значения взяты из временного прогона, в котором проверка была `assert.deepEqual({ value }, { value: key })` (`+ value: 3142 / - value: '3142'`, `+ value: 1.5 / - value: '1.50'`, `+ value: true / - value: 'true'`). Файл после прогона восстановлен из копии в scratchpad, `cmp` подтвердил совпадение.

## TDD Gate Compliance (Task 3)

- **RED.** Первая версия файла: `KNOWN_DEFECTS` пустой, все проверки чтения обычные. Прогон завершился с кодом 1: `Tests 6 failed | 14 passed (20)`. Упали ровно шесть целевых тестов `чтение ключа 3142|1.50|true через Drizzle возвращает строку`, обе формы чтения. Каждый упал на `assert.equal(typeof value, 'string')` (строка 113): `Expected: "string" Received: "number"` для 3142 и 1.50, `Received: "boolean"` для true. Ошибок подключения или вставки нет: сырые проверки типа и сопутствующие проверки зелёные.
- **GREEN.** `KNOWN_DEFECTS = new Set(['3142', '1.50', 'true'])`, после этого `Tests 14 passed | 6 expected fail (20)`. Код приложения не менялся: план закрепляет дефект, исправление переходит в 03-08.
- **Проба плана «test.fails → test для '3142'».** `KNOWN_DEFECTS` временно сужен до `['1.50', 'true']`. Результат: `Tests 2 failed | 14 passed | 4 expected fail (20)`, упали обе проверки `3142` на типе (`Expected: "string" Received: "number"`). Файл восстановлен.
- **REFACTOR.** Не требовался.
- RED/GREEN-коммиты не делались (правило пользователя). Порядок соблюдён по сути, доказательство RED — лог `scratchpad/red-03-01.log`.

## Deviations from Plan

### Auto-fixed Issues

None: код приложения не менялся. Расхождения с ожиданиями плана описаны выше в разделе «Расхождения с ожиданиями плана» (схема `custom_multi_3`, второй отказ `/save`).

## Issues Encountered

- Предупреждения `oxlint` о неиспользуемых импортах есть в существующих файлах (`backfill-question-search.ts`, `storage.ts`, `rbac.ts`, `app.ts`, `public.ts`). Они были до этого плана и в него не входят. В новых файлах предупреждений нет.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/exam-flow.test.ts src/db/answer-keys-jsonb.test.ts`: `Tests 69 passed | 6 expected fail (75)`.
- `exam-flow shape ok`, `d11 shape ok`, проверка `(^|[^_])DATABASE_URL` по exam-flow.test.ts: код 0.
- `yarn workspace @bio-exam/server typecheck`: код 0. `yarn format:check`: все файлы отформатированы.
- `yarn verify`: `yarn verify: OK`. Последний прогон был после финальной правки названий тестов, `@bio-exam/server:test` дал `Tests 248 passed | 6 expected fail (254)`.
- `git status --porcelain --untracked-files=all -- app/server/src`: новые только `app/server/src/db/answer-keys-jsonb.test.ts` и `app/server/src/routes/tests/exam-flow.test.ts`, остальные строки (`uploads.test.ts`, `test-support/http.ts`, `lib/sharp-runtime.test.ts`) из фазы 2. По `app/server/src/routes/tests` и `app/server/src/db` видны только два файла этого плана.

## Файлы к коммиту

- `app/server/src/routes/tests/exam-flow.test.ts`
- `app/server/src/db/answer-keys-jsonb.test.ts`

Предлагаемое сообщение: `#<ID задачи> - Добавил характеризацию сохранения и оценки вопросов через API и тест чтения ключей answer_keys`. ID задачи спросит основная сессия.

## Next Phase Readiness

- 03-12, 03-08, 03-09 могут менять `public.ts`, `routes/tests/index.ts`, `question-type-resolver.ts`, `schemas/tests.ts`. Характеризация должна остаться зелёной. 03-09 может менять только три теста с префиксом `D-13 (меняется в 03-09):`.
- 03-08 переводит `KNOWN_DEFECTS` в пустое множество, тогда шесть проверок чтения становятся обычными тестами. В exam-flow тип `correctAnswer` для цифрового ключа не закреплён, поэтому 03-08 его не ломает.
- Тест «тип с exactChoiceCount меньше minOptions не создаётся: 400» закрепляет правило `QuestionTypeDefinitionSchema`. По D-03 эта схема переезжает в exam-core. План переноса должен сохранить правило: тест не входит в список D-13 и иначе покраснеет.
- `requirements-completed: []`, хотя у плана `requirements: [EXAM-04, EXAM-06]`. План только характеризует поведение, требования закрывают планы переключения. `requirements.mark-complete` не вызывался по правилам исполнения фазы.
- В `yarn verify` задача `@bio-exam/server:test` выполнялась без кеша (`cache bypass, force executing`).

## Self-Check: PASSED

- FOUND: app/server/src/routes/tests/exam-flow.test.ts
- FOUND: app/server/src/db/answer-keys-jsonb.test.ts
- Коммитов нет по правилу пользователя, HEAD не изменился (7a6f95a).

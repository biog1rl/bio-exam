---
phase: 05-attempt-integrity
plan: 08
subsystem: api
tags: [express, drizzle, postgres, attempts, exam-core, zod, vitest, playwright, access-policy]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-07
    provides: "services/scored-attempt: buildAttemptView, readAttemptView, факты results_version 2"
  - phase: 05-01
    provides: "attempt-world, attempt-known-defects.test.ts, e2e D1 как test.fail"
  - phase: 07-01
    provides: "in-memory адаптер хранилища в тестах"
provides:
  - "exam-core: AdminAttemptViewSchema, тип AdminAttemptView"
  - "services/scored-attempt: legacyFact (legacy-fact.ts), readLegacyFacts (legacy.ts), readFacts и readAdminAttemptView (read.ts)"
  - "GET /api/tests/admin/attempts/:attemptId: canReviewAttempt → readAdminAttemptView, ответ { attempt: AdminAttemptView, questions }"
  - "D1 закрыт: SCORE-03-d1-key-change и e2e D1 — обычные тесты"
affects: [05-09, 05-10, 05-11, 07]

estimate:
  tokens: 95000
  tasks: 3
actuals:
  tokens: 12400
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Чтение строки results версии 1 — чистое правило legacyFact плюс выборка истории answer_keys в legacy.ts"
    - "Ошибка формы results — AttemptResultsShapeError только вокруг zod-разбора; ошибки БД адаптера версии 1 не маскируются"

key-files:
  created:
    - app/server/src/services/scored-attempt/legacy-fact.ts
    - app/server/src/services/scored-attempt/legacy.ts
    - app/server/src/services/scored-attempt/legacy.test.ts
    - app/server/src/routes/tests/attempt-review.test.ts
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/attempt-result.test.ts
    - scripts/check-exam-core-dist.mjs
    - app/server/src/services/scored-attempt/read.ts
    - app/server/src/services/scored-attempt/index.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/routes/tests/attempt-known-defects.test.ts
    - e2e/tests/review.spec.ts
    - e2e/fixtures/exam.ts

key-decisions:
  - "SCORE-03-d1-key-change не удалён, а стал обычным test(...): must_have truth 6 требует обычную проверку, шаг 6 действия — удалить id из множества; выбран консервативный вариант (проверка остаётся)"
  - "readFactsFromRow заменён асинхронной readFacts({ attemptId, testId, results, resultsVersion }); других импортёров не было"
  - "legacyFact: вопрос без настроенного типа считается неизвестным (question null) — ключ через normalizeKeyValue, вердиктов нет"
  - "readLegacyFacts пропускает questionId не в форме uuid (в схеме версии 1 это z.string()), такие элементы читаются без вопроса и без истории"

requirements-completed: [SCORE-02, SCORE-03, SCORE-05]

duration: 15min
completed: 2026-10-04
---

# Phase 5 Plan 08: Разбор администратора через модуль оценённой попытки, D1 закрыт, старые попытки читаются с ключом на момент сдачи Summary

Разбор администратора `GET /api/tests/admin/attempts/:attemptId` проверяет доступ через `canReviewAttempt` и строит попытку функцией `readAdminAttemptView` модуля `scored-attempt`. Подстановки активного ключа (корень D1) больше нет. Попытки версии 2 показывают ключ и вердикты, сохранённые при сдаче. Попытки версии 1 читаются без перезаписи. Ключ берётся из сохранённого `correctAnswer`, иначе из версии `answer_keys` на момент сдачи. Вердикты показываются только если пересчёт совпал с сохранёнными баллами.

## Коммит

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

Новые:
- `app/server/src/services/scored-attempt/legacy-fact.ts`
- `app/server/src/services/scored-attempt/legacy.ts`
- `app/server/src/services/scored-attempt/legacy.test.ts`
- `app/server/src/routes/tests/attempt-review.test.ts`

Изменённые:
- `packages/exam-core/src/attempt-result.ts`
- `packages/exam-core/src/index.ts`
- `packages/exam-core/src/attempt-result.test.ts`
- `scripts/check-exam-core-dist.mjs`
- `app/server/src/services/scored-attempt/read.ts`
- `app/server/src/services/scored-attempt/index.ts`
- `app/server/src/routes/tests/index.ts`
- `app/server/src/routes/tests/attempt-known-defects.test.ts`
- `e2e/tests/review.spec.ts`
- `e2e/fixtures/exam.ts`

Всего 14 файлов, все из списка плана.

## Предусловие и отпечаток

- Предусловие плана: вывод `scope ok`, код 0. `scope.ts` экспортирует `canReviewAttempt`, файлы `services/storage/index.ts` и `services/storage/adapters/memory.ts` на месте.
- Отпечаток до правок: `.planning/commit-snapshots/before-05-08/fingerprint.json` (`fingerprint 05-08: 0 paths`, дерево чистое после 7155fd6).
- Проверка отпечатка после плана: `05-08 changed only its files`.

## Задачи

### Task 1 (tracer): разбор через canReviewAttempt и readAdminAttemptView, D1 версии 2

- `exam-core/attempt-result.ts`: `AdminAttemptViewSchema = AttemptViewSchema.extend({ testId: uuid, userId: uuid, answers: record(string, unknown), telemetry: TelemetryMapSchema.nullable() })` и тип `AdminAttemptView`. Экспорт добавлен в `index.ts`, имя добавлено в `EXPECTED_EXPORTS`, всего 72 экспорта. Тест схемы в `attempt-result.test.ts` проверяет:
  - разбор полного вида и `telemetry: null`;
  - что вид администратора проходит `AttemptViewSchema`;
  - отказ при `testId: 'x'`, без `userId`, без `telemetry` и при `answers: []`.
- `read.ts`: `readAdminAttemptView(attemptId)` возвращает `AdminAttemptView | null`. Строка `test_attempts` превращается в факты, из них `buildAttemptView({ viewer: { kind: 'admin' } })` строит вид, затем `AdminAttemptViewSchema.parse({ ...вид, testId, userId, answers, telemetry ?? null })`. Функция экспортируется из `index.ts` модуля.
- Обработчик `/admin/attempts/:attemptId` в `routes/tests/index.ts` (middleware и путь прежние):
  - `canReviewAttempt(req, attemptId)` вернул false → 403 `{ error: 'Forbidden' }`;
  - `readAdminAttemptView` вернул null → 404 `{ error: 'Attempt not found' }`;
  - выборка вопросов, `getQuestionTypeMapForTest` и `tests.findFirst` берут `review.testId`;
  - удалены прежняя выборка попытки, `answerKeyRows`, `answerKeysMap` и `resultsWithCorrectAnswers`;
  - ответ: `{ attempt: review, questions: questionsWithTexts }`.
- `attempt-review.test.ts` (префикс `test_attempt_review`, без подмены хранилища), сценарий D1 версии 2:
  - radio 'b' (верно) и sequence '2315' при ключе '2314';
  - у radio `keyVisible: true`, `correctAnswer: 'b'`, `verdicts.template === 'single_choice'`, `status: 'correct'`;
  - у sequence `correctAnswer: '2314'`, `mistakes: 1`, `status: 'partial'`;
  - после PATCH ключей на 'a' и '4321' `assert.deepEqual(after.body.attempt, before.body.attempt)`.
- Доступ: роль user → 403, admin с запретом `tests.read` (грант `rbacUserGrants` с `allow: false`) → 403, несуществующий uuid → 404 `{ error: 'Attempt not found' }`.
- `attempt-known-defects.test.ts`: удалены `KNOWN_DEFECTS` и `defectTest`. Все проверки записаны как `test('<id>: <title>', …)` с прежними названиями. `SCORE-03-d1-key-change` теперь обычная зелёная проверка.
- `review.spec.ts`:
  - из шапки убран текст про D1 как ожидаемое падение;
  - удалены два комментария блока D1: про подстановку текущего ключа и про ожидаемое падение;
  - блок называется `D1: admin review keeps the answer key of the submission`;
  - `D1 setup: …` без `@known-defect`;
  - `test.fail(…)` заменён на `test('D1: admin review of an earlier attempt is unchanged', …)`.
- `fixtures/exam.ts`: в `SubmitPayload.results` добавлены `status: string`, `keyVisible: boolean`, `mistakes: number | null`, `verdicts: unknown`.
- Гейт Task 1:
  - `exam-core dist OK … 72 экспортов в ESM и CJS`;
  - `attempt-review` + `attempt-known-defects`: `Test Files 2 passed`, `Tests 19 passed (19)`;
  - `yarn e2e --grep "@flow3|D1"`: `12 passed (24.3s)`, код 0, на chromium-desktop и chromium-mobile;
  - проверка из плана вывела `d1 closed`.
- Tracer-гейт: `<verify>` повторён полностью и зелёный, после этого начато расширение (Task 2).

### Task 2 (TDD): совместимое чтение версии 1

- RED: `legacy.test.ts` написан до модуля. Первый прогон упал, потому что `./legacy-fact.js` не найден (`Test Files 1 failed`, `no tests`).
- `legacy-fact.ts` (без `db`): `legacyFact({ item, question, historyKey })`.
  - Ключ выбирается так: сохранённый `correctAnswer`, если он не null, иначе `historyKey`, иначе null.
  - Если вопрос и ключ известны, вызывается `scoreQuestionFacts`. Каноничный ключ — `scored.key ?? normalizeKeyValue(rawKey)`. Вердикты и `mistakes` берутся из пересчёта, только когда `isCorrect` и `earnedPoints` равны сохранённым.
  - Если вопроса нет: ключ `normalizeKeyValue(rawKey)`, вердикты null.
  - `points`, `earnedPoints`, `isCorrect`, `userAnswer ?? null`, `explanationText ?? null` всегда берутся из строки.
- `legacy.ts`: `readLegacyFacts({ attemptId, testId, items })`.
  - Читает текущие строки вопросов по `questionId` элементов: тип, points, options, matchingPairs. Разбор содержимого идёт через `safeParse`.
  - Вызывает `getQuestionTypeMapForTest({ testId, includeInactive: true })`.
  - Для элементов без сохранённого ключа выбирает `SELECT DISTINCT ON (question_id) … WHERE created_at <= (SELECT submitted_at FROM test_attempts WHERE id = $attemptId) ORDER BY question_id, version DESC`. Сравнение идёт в SQL, в поясе сессии БД.
  - Затем к каждому элементу применяется `legacyFact`.
- `read.ts`:
  - `readFactsFromRow` заменён асинхронной `readFacts({ attemptId, testId, results, resultsVersion })`;
  - zod-разбор по версии обёрнут в `try`, ошибка превращается в `AttemptResultsShapeError`; версия 1 дальше идёт в `readLegacyFacts` вне `try`;
  - `readAttemptView` и `readAdminAttemptView` используют общую выборку строки и `readFacts`;
  - `index.ts` модуля экспортирует `legacyFact`, `LegacyQuestion`, `readLegacyFacts`, `readFacts`; `readFactsFromRow` убран.
- `legacy.test.ts`, 7 строк. Все строки behavior плана и ещё две:
  - пересчёт с ключом из истории дал другой `isCorrect` → вердиктов нет;
  - в строке нет `userAnswer` и `explanationText` → оба null.
- DB-строки в `attempt-review.test.ts`:
  - **версия 1, история ключа.** Попытка вставлена через `ctx.db` с `submitted_at` 2026-09-10. У sequence две версии ключа: v1 '2314' от 2026-09-01 и v2 '4321' от 2026-09-20 (создана PATCH, активна). Разбор показывает `correctAnswer '2314'`, вердикты `sequence_digits`, `mistakes 1`: сохранённые 1 из 2 совпали с пересчётом. В JSON нет `"4321"`.
  - **версия 1, нет версии до сдачи.** У short_answer единственная версия от 2026-09-20. Разбор: `keyVisible false`, `correctAnswer null`, `verdicts null`, `mistakes null`, `status 'correct'` по сохранённым значениям.
  - **R2.** Sequence с сохранёнными 0 баллами и `correctAnswer '2314'` при ответе '2315'. Разбор: ключ '2314', `verdicts` и `mistakes` null, `earnedPoints 0`, `status 'wrong'`.
  - **битая строка.** `results = {"x":1}` при версии 1 → 500, в JSON тела нет `"x"`.
  - Во всех трёх случаях версии 1 строка после чтения не изменилась: `{ results_version: 1, results }` совпадает со вставленным.
- Проверка мутацией: в `legacy.ts` `lte` временно заменён на `gte`. Сценарий истории ключа покраснел (`Expected: "2314"`, `Tests 1 failed | 6 passed`). После возврата файла тест снова зелёный.
- Проверки Task 2:
  - `src/services/scored-attempt`, `attempt-review.test.ts`, `attempt-view-leak.test.ts`: `Test Files 4 passed`, `Tests 70 passed (70)`;
  - `no storage shell in phase 5 tests`;
  - `read only`.

### Task 3: гейты

- `yarn verify: OK`, все восемь шагов `passed`:
  - server: `Tests 658 passed (658)` в 35 файлах, ожидаемых падений нет (до плана было `643 passed | 1 expected fail`);
  - exam-core: `610 passed`;
  - web: `509 passed | 1 expected fail (510)`, это ожидаемое падение web, не D1;
  - rbac: `2 passed`;
  - script-tests: `pass 147`.
- `yarn e2e`: `132 passed (1.6m)`, код 0, ни одного `✘`. В `review.spec.ts` ожидаемых падений нет.
- Отпечаток: `05-08 changed only its files`.

## Затронутый символ `routes/tests/index.ts` (для слияния с фазой 7)

- Изменён только обработчик GET `/admin/attempts/:attemptId`:
  - выборка попытки заменена на `canReviewAttempt` и `readAdminAttemptView`;
  - в трёх местах `attempt.testId` заменён на `review.testId`: выборка вопросов, `getQuestionTypeMapForTest` и `tests.findFirst`;
  - удалён блок `answerKeyRows`, `answerKeysMap` и `resultsWithCorrectAnswers`;
  - ответ `{ attempt: review, questions: questionsWithTexts }`.
- Блок чтения промпта внутри `questionRows.map` (кандидаты путей, `storageService.readFile`) не менялся. Его переводит 07-07 на `readQuestionMarkdown`. Правило слияния: каркас обработчика (доступ, `readAdminAttemptView`, ответ) берётся из фазы 5, блок промпта из 07-07.
- Импорты: добавлены `canReviewAttempt` из `../../services/access-policy/scope.js` и `readAdminAttemptView` из `../../services/scored-attempt/index.js`. Импорты `answerKeys`, `inArray`, `and`, `testAttempts` остались, их используют другие обработчики файла.
- Остальные обработчики (список попыток, авторинг, PATCH ключа, экспорт) не тронуты. `oxfmt` не изменил соседний код: в diff четыре hunk, все в импорте и обработчике разбора.

## CodeGraph (D-23)

В worktree нет `.codegraph/`. Команды выполнены в основном дереве по индексу до фазы 5.

- `codegraph impact answerKeys`: 7 символов. Это `schema.ts` (`answerKeys`, `answerKeysRelations`, `questionsRelations`), `app/server/check-questions.ts`, `routes/tests/index.ts`, `routes/index.ts`, `routes/tests/public.ts`. После плана обработчик разбора `answerKeys` не читает. История ключей читается только в `services/scored-attempt/legacy.ts`, активный ключ — в `facts.ts` (05-07).
- `codegraph impact canReviewAttempt`: два определения. Метод `AccessScope::canReviewAttempt` (`scope-rules.ts:14`) затрагивает `scope.test.ts`. Константа `canReviewAttempt` (`scope.ts:12`) затрагивает `access-policy/index.ts`. Новый вызывающий — обработчик разбора в `routes/tests/index.ts`.
- `codegraph node app/server/src/routes/tests/index.ts`: файл на 2738 строк, 61 символ, используется `routes/index.ts` и `UserProfileAssignmentsPage.tsx`. Вывод обрывается на 1084 строках, строки обработчика `/admin/attempts/:attemptId` в нём нет. Обработчик прочитан из файла worktree: анонимная функция `router.get` в конце файла.
- `codegraph affected` по 10 изменённым файлам плана, которые есть в индексе, дал 21 файл:
  - server: `question-type-resolver.ts`, `attempt-known-defects.test.ts`, `routes/tests/index.ts`, `public.ts`;
  - web: `QuestionEditorPageClient.tsx`, `QuestionEditor.tsx`, `question-validation.ts`, `admin/tests/types/index.ts`, `TestRunner.tsx`, `QuestionAnswerReview.tsx`, `attempt-review-utils.ts`, `lib/tests/api.ts`, `lib/tests/types.ts`;
  - e2e: `fixtures/exam.ts`, `tests/review.spec.ts`;
  - exam-core: `answer.test.ts`, `attempt-result.test.ts`, `authoring.test.ts`, `invariants.test.ts`, `review.test.ts`, `scoring.test.ts`.
  - Все тесты из списка прошли в `yarn verify`. Web-компоненты проверены typecheck и `yarn e2e`: разбор администратора `@flow3` и D1 зелёные без правок web.

## Deviations from Plan

Отклонений от списка файлов и действий нет.

### Решения исполнителя (автономно)

1. **SCORE-03-d1-key-change остался обычной проверкой.** В плане два указания расходятся: шаг 6 действия говорит «удали `SCORE-03-d1-key-change`», must_have truth 6 — «проверка SCORE-03-d1-key-change обычная». Выбран консервативный обратимый вариант: id убран из `KNOWN_DEFECTS`, константа и помощник удалены, сама проверка осталась `test(...)`.
2. **Комментарий подготовки D1 в `review.spec.ts` удалён целиком.** Его вторая половина обосновывала подстановку текущего ключа. Первую половину пришлось бы переписывать, а новых комментариев план не допускает.
3. **Добавлен DB-сценарий R2.** must_have truth 4 называет R2 среди доказательств на `test_*`, а behavior Task 2 — только как строку `legacyFact`. Поэтому R2 проверен в обоих местах.
4. **Тип вопроса не настроен → вопрос считается неизвестным** (ключ через `normalizeKeyValue`, без вердиктов). Не-uuid `questionId` в строке версии 1 `readLegacyFacts` не передаёт в запрос к БД (иначе ошибка приведения к uuid). Сам разбор такой строки всё равно отвечает 500: `AttemptQuestionViewSchema` требует uuid. Это проверяется read-only SQL п. 7 ниже.
5. **`readAdminAttemptView` и `readAttemptView` используют общую выборку строки** с `.limit(1)`. `readAttemptView`, как и раньше, бросает ошибку, если строки нет.

### Наблюдение для 05-10

Web-тип `AttemptReviewData` (`app/web/lib/tests/types.ts`) по-прежнему описывает `id`, а вид отдаёт `attemptId`. Компоненты разбора `attempt.id` не читают (проверено `rg` и e2e). Тип переводит на `AdminAttemptView` план 05-10, файл не входит в список 05-08.

## TDD Gate Compliance

Коммиты не выполнялись (правило пользователя). RED для Task 2 наблюдался: `legacy.test.ts` упал из-за отсутствия `./legacy-fact.js`. GREEN: 7 passed после `legacy-fact.ts`. DB-сценарий истории ключа проверен мутацией `lte` → `gte`: красный, после возврата зелёный. REFACTOR: выборка строки и сводка попытки в `read.ts` вынесены в `readAttemptRow` и `summaryOf` при зелёных тестах.

## Known Stubs

Нет.

## Threat Flags

Новых поверхностей нет: маршрут прежний, middleware прежние.
- T-5-25: ключ берётся из фактов версии 2 или из истории `answer_keys` до `submitted_at`. Подстановка активного ключа удалена. Vitest (`deepEqual` тела attempt) и e2e D1 зелёные.
- T-5-26: `requirePerm('tests','read')` остался, в обработчике добавлен `canReviewAttempt`. user и admin с запретом `tests.read` получают 403.
- T-5-27: `AttemptResultsShapeError` несёт только attemptId. Тест проверяет, что в теле 500 нет `"x"`.
- T-5-28: баллы и статус старых попыток только сохранённые. Вердикты показываются только при совпадении пересчёта (R2 в unit- и DB-тесте).

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. CONTEXT `<specifics>` п. 6: 264 старые попытки не переписываются. Ключ берётся из сохранённого `correctAnswer` или из версии `answer_keys` на момент сдачи. Вердикты показываются только при совпадении пересчёта. Если ключ неизвестен, в разборе нужна пометка (экран — 05-10). Нужно выполнить read-only SQL п. 6 (`key_stored`, `key_from_history`, `key_unknown`, `attempts_with_key_changed_after_submit`) и SQL R2 из `03-11-SUMMARY.md`.
2. CONTEXT `<specifics>` п. 7: форма старых `results` на проде должна приниматься `LegacyAttemptResultsSchema`, иначе разбор такой попытки отвечает 500. Кроме запросов п. 7 нужна read-only проверка типов полей элемента. Ожидается одна комбинация `object`, `string`, `boolean`, `number`, `number`. Любая другая строка результата, в том числе `null` у отсутствующего поля, означает 500 в разборе, и решение нужно принять до выкатки. Также стоит убедиться, что все `questionId` в форме uuid: `AttemptQuestionViewSchema` требует uuid.

   ```sql
   SELECT jsonb_typeof(r) AS item_type,
          jsonb_typeof(r->'questionId') AS question_id_type,
          jsonb_typeof(r->'isCorrect') AS is_correct_type,
          jsonb_typeof(r->'points') AS points_type,
          jsonb_typeof(r->'earnedPoints') AS earned_points_type,
          count(*)
   FROM test_attempts a
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.results) = 'array' THEN a.results ELSE '[]'::jsonb END) r
   GROUP BY 1, 2, 3, 4, 5
   ORDER BY 6 DESC;
   ```

3. Telemetry старых попыток. Раньше обработчик отдавал `telemetry` без проверки. Теперь `AdminAttemptViewSchema` проверяет её через `TelemetryMapSchema`: ключи должны быть uuid, у каждого значения три неотрицательных целых `timeSpentMs`, `focusLossCount`, `visitCount`. Если на проде есть строка другой формы, разбор этой попытки ответит 500. Запросы п. 7 смотрят только `results`, поэтому нужна отдельная read-only проверка. Ожидается одна строка `number, number, number, true`:

   ```sql
   SELECT jsonb_typeof(v->'timeSpentMs') AS time_type,
          jsonb_typeof(v->'focusLossCount') AS focus_type,
          jsonb_typeof(v->'visitCount') AS visit_type,
          k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AS key_is_uuid,
          count(*)
   FROM test_attempts a
   CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.telemetry) = 'object' THEN a.telemetry ELSE '{}'::jsonb END) AS t(k, v)
   GROUP BY 1, 2, 3, 4
   ORDER BY 5 DESC;
   ```

   Не выполнено, ждёт пользователя.
4. Скрипт перевода старых строк в версию 2 — отдельное решение пользователя (Deferred CONTEXT).
5. Коммит 14 файлов плана делает пользователь (оркестратор).

## Self-Check: PASSED

- Новые файлы существуют: `legacy-fact.ts`, `legacy.ts`, `legacy.test.ts`, `attempt-review.test.ts`. Изменены ещё 10 файлов; `git status` показывает 14 путей, все из списка плана.
- В новых и изменённых строках нет комментариев (`git diff -U0` и новые файлы проверены на `//` и `/*`).
- `yarn verify: OK`; `yarn e2e` — 132 passed без падений.
- Коммитов нет по правилу пользователя.

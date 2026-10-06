---
phase: 05-attempt-integrity
plan: 07
subsystem: api
tags: [express, drizzle, postgres, attempts, exam-core, zod, vitest, scoring]
status: complete
deferred_human_gate: true

requires:
  - phase: 05-06
    provides: "submitAttempt с scored.resultsVersion, readSubmittedResult, конверт submit"
  - phase: 05-03
    provides: "колонка test_attempts.results_version (0023)"
  - phase: 07-01
    provides: "in-memory адаптер хранилища в тестах"
provides:
  - "exam-core: QuestionVerdictsSchema, QuestionStatusSchema, questionStatus, ScoredQuestionFactSchema, AttemptFactsSchema, LegacyAttemptResultItemSchema, LegacyAttemptResultsSchema, AttemptQuestionViewSchema, AttemptViewSchema, scoreQuestionFacts и типы"
  - "services/scored-attempt: scoreSubmission (facts.ts), toStorableFact (storable-fact.ts), buildAttemptView (view.ts), readAttemptView, readFactsFromRow, AttemptResultsShapeError (read.ts)"
  - "submit пишет results_version = 2 с фактами оценки, ответ и повтор строятся видом из сохранённой строки"
  - "view.test.ts (таблица 3 × 5 × 3 и toStorableFact без БД), attempt-view-leak.test.ts (утечка ключа на test_*)"
affects: [05-08, 05-09, 05-10, 05-11, 07]

estimate:
  tokens: 100000
  tasks: 3
actuals:
  tokens: 16300
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Оценка попытки: scoreSubmission → scoreQuestionFacts пакета на каждый вопрос → toStorableFact (safeParse с понижением) → submitAttempt(resultsVersion 2) → readAttemptView → buildAttemptView"
    - "Правило скрытия ключа живёт только в view.ts; маршрут передаёт зрителя { kind: 'student', showCorrectAnswer }"
    - "Чтение results по results_version через zod: 2 — AttemptFactsSchema, 1 — LegacyAttemptResultsSchema; несоответствие → AttemptResultsShapeError"

key-files:
  created:
    - app/server/src/services/scored-attempt/facts.ts
    - app/server/src/services/scored-attempt/storable-fact.ts
    - app/server/src/services/scored-attempt/view.ts
    - app/server/src/services/scored-attempt/read.ts
    - app/server/src/services/scored-attempt/view.test.ts
    - app/server/src/routes/tests/attempt-view-leak.test.ts
  modified:
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/scoring.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/attempt-result.test.ts
    - packages/exam-core/src/scoring.test.ts
    - scripts/check-exam-core-dist.mjs
    - app/server/src/services/scored-attempt/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/routes/tests/attempt-submit.test.ts

key-decisions:
  - "Инвариант errorUnits(verdicts) === mistakes проверяется только у sequence_digits, matching и short_text, как в invariants.test.ts (UNITS_EQUAL_TEMPLATES фазы 3); у выбора — errorUnits >= mistakes и равенство нулю одновременно"
  - "attempt-submit.test.ts: ожидание results_version 1 → 2 (вне allow-list плана, иначе гейт красный)"
  - "Зритель-администратор определяется ветвью kind === 'student' первой: сравнение с литералом 'admin' запрещено scripts/auth-no-role-string-checks.test.mjs"
  - "keyVersion факта null, если активного ключа нет; вопросы оцениваются в порядке questions.order"

requirements-completed: [SCORE-01, SCORE-02, SCORE-04]

duration: 25min
completed: 2026-10-04
---

# Phase 5 Plan 07: Оценённая попытка — факты оценки в results версии 2 и вид для зрителя Summary

При submit сервер сохраняет на каждый вопрос факты оценки, посчитанные одним вызовом `scoreQuestionFacts` пакета: баллы, ключ в каноничной форме, `keyVersion`, вердикты, число ошибок, ответ и пояснение. Строка пишется с `results_version = 2`. Ответ первой отправки и повтора строит одна функция `buildAttemptView` из сохранённой строки. При скрытом ключе неверные и частичные ответы приходят без ключа, вердиктов и числа ошибок.

## Коммит

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `wt-phase-05` (ветка `gsd/phase-05`).

## Файлы к коммиту

Новые:
- `app/server/src/services/scored-attempt/facts.ts`
- `app/server/src/services/scored-attempt/storable-fact.ts`
- `app/server/src/services/scored-attempt/view.ts`
- `app/server/src/services/scored-attempt/read.ts`
- `app/server/src/services/scored-attempt/view.test.ts`
- `app/server/src/routes/tests/attempt-view-leak.test.ts`

Изменённые:
- `packages/exam-core/src/attempt-result.ts`
- `packages/exam-core/src/scoring.ts`
- `packages/exam-core/src/index.ts`
- `packages/exam-core/src/attempt-result.test.ts`
- `packages/exam-core/src/scoring.test.ts`
- `scripts/check-exam-core-dist.mjs`
- `app/server/src/services/scored-attempt/index.ts`
- `app/server/src/routes/tests/public.ts`
- `app/server/src/routes/tests/exam-flow.test.ts`
- `app/server/src/routes/tests/attempt-submit.test.ts` (вне списка плана, см. отклонения)

Всего 16 файлов: 15 файлов плана и `attempt-submit.test.ts`.

## Предусловие и отпечаток

Отпечаток до правок: `.planning/commit-snapshots/before-05-07/fingerprint.json` (`fingerprint 05-07: 0 paths`, дерево чистое после fc2820f).

## Задачи

### Task 1 (tracer): схемы, scoreQuestionFacts, факты при submit, ответ через вид

- `exam-core/attempt-result.ts`:
  - схемы частей вердиктов (закрытые в модуле) и `QuestionVerdictsSchema` — `z.discriminatedUnion('template', …)` по пяти шаблонам, `mistakes: int ≥ 0`; совместимость с `QuestionVerdicts` проверяется присваиванием `z.ZodType<QuestionVerdicts>`;
  - `QuestionStatusSchema`, `QuestionStatus`, `questionStatus`: `points === 0` → `ungraded`, иначе `isCorrect` → `correct`, `earnedPoints > 0` → `partial`, иначе `wrong`;
  - `ScoredQuestionFactSchema`, `AttemptFactsSchema`;
  - `LegacyAttemptResultItemSchema` (`.passthrough()`, `userAnswer`, `correctAnswer`, `explanationText` необязательны), `LegacyAttemptResultsSchema`;
  - `AttemptQuestionViewSchema` (поля прежнего элемента плюс `status`, `keyVisible`, `mistakes`, `verdicts`), `AttemptViewSchema`;
  - `SubmitResultSchema` и `SubmitResultItemSchema` оставлены (их читает web, удаляет 05-10).
- `exam-core/scoring.ts`: `scoreQuestionFacts({ typeConfig, rawKey, userAnswer, fallbackMaxPoints, content })`:
  - метрика — `normalizeScoringRule(...).mistakeMetric`;
  - баллы — `scoreQuestionByType` с тем же сырым ключом и картой из одного типа;
  - при `rawKey == null` `key`, `verdicts`, `mistakes` равны null;
  - иначе `key = readKey(...)`, `verdicts = computeVerdicts(...)`, `mistakes = verdicts.mistakes`.
- `index.ts`: 10 новых рантайм-имён и типы; `EXPECTED_EXPORTS` — 71 имя.
- Тесты схем в `attempt-result.test.ts`: принимаемые и отклоняемые значения каждой схемы, `questionStatus` по всем ветвям, включая `{ points: 0, isCorrect: true }` → `ungraded`; `AttemptViewSchema` разбирается и `SubmitResultSchema` (вид аддитивен).
- `storable-fact.ts`: `toStorableFact(candidate, warn)`. Схема пройдена → факт без изменений. Иначе `verdicts` и `mistakes` становятся null. Если и это не проходит, ещё и `key`, `keyVersion` становятся null. При понижении один вызов `warn` с `questionId`, `template`, `dropped` и путями ошибок zod, без значений. Ошибка базовых полей → `Error` с путями без данных. Модуль не импортирует `db` и `logger`.
- `facts.ts`: `scoreSubmission({ testId, answers, passingScore, readExplanation })`:
  - вопросы теста с `orderBy(asc(questions.order))`;
  - `getQuestionTypeMapForTest({ testId, includeInactive: true })`;
  - активные `answer_keys` с `correctAnswer` и `version`;
  - содержимое через `OptionSchema`/`MatchingPairsSchema` с `safeParse`;
  - пояснение через `readExplanation` только при `explanationPath`;
  - каждый факт через `toStorableFact` с `warn = logger.warn({ testId, ...info }, 'scored fact failed schema')`;
  - итоги и `passed` — как в прежнем блоке маршрута.
- `view.ts`: `ReadableFact`, `AttemptViewer`, `AttemptSummary`, чистая `buildAttemptView({ attempt, facts, viewer })` с `AttemptViewSchema.parse`.
- `read.ts`: `AttemptResultsShapeError` (сообщение только с attemptId); `readFactsFromRow({ attemptId?, results, resultsVersion })`; `readAttemptView(attemptId, viewer)`.
- `index.ts` модуля: экспорт новых функций и типов, `readSubmittedResult` удалён.
- `public.ts`: блок оценки заменён `scoreSubmission`, `submitAttempt` получает `resultsVersion: 2`, ответ первой отправки и повтора — `readAttemptView(…, { kind: 'student', showCorrectAnswer })`.
- `exam-flow.test.ts`: сквозной тест проверяет `resultsVersion === 2`, `key === '2314'`, `keyVersion === 1` у сохранённого факта; прежние ожидания `correctAnswer` без изменений; шапка `vi.hoisted`/`vi.mock` не тронута.
- Гейт Task 1:
  - exam-core: `Test Files 11 passed`, `Tests 547 passed`, `exam-core dist OK … 71 экспортов в ESM и CJS`;
  - сервер (`exam-flow`, `attempt-submit`, `attempt-known-defects`): `Test Files 3 passed`, `Tests 96 passed | 1 expected fail (97)`;
  - acceptance: в `public.ts` нет `answerKeys`, `scoreQuestionByType`, `SubmitResultSchema` (код 0).
- Tracer-гейт: проверки пакета повторены (547 passed, dist OK), расширение продолжено.

### Task 2 (TDD): таблицы и тест утечки

- `scoring.test.ts`, 15 строк `scoreQuestionFacts` (radio, checkbox, matching, short_answer, sequence; верно, частично или без ответа, неверно):
  - `points`, `earnedPoints`, `isCorrect` равны `scoreQuestionByType` тех же входов;
  - `mistakes === verdicts.mistakes`, `mistakes === mistakesCount` (если не `MISTAKES_UNSCORABLE`), `isCorrect ⇔ mistakes === 0`, `allPartsCorrect ⇔ mistakes === 0`;
  - повторная оценка с сохранённым каноничным `key` даёт тот же `earnedPoints`;
  - `errorUnits(verdicts) === mistakes` у 9 строк sequence_digits, matching, short_text; у 6 строк выбора `errorUnits >= mistakes` и `errorUnits === 0 ⇔ mistakes === 0`;
  - `rawKey: null` → `key`, `verdicts`, `mistakes` null, баллы как у `scoreQuestionByType`;
  - каждая строка, дополненная `questionId`, `keyVersion` 1, `userAnswer`, `explanationText` null, проходит `ScoredQuestionFactSchema.parse`; то же для строки без ключа с `keyVersion` null;
  - каноничный ключ: числовой ключ последовательности `2314` хранится строкой `'2314'`.
  - Итог: `Tests 170 passed (170)` в `scoring.test.ts`.
- `view.test.ts` (без БД, импортирует только `./view.js`, `./storable-fact.js` и пакет):
  - 45 строк: admin, student_with_key, student_without_key × 15 строк шаблонов, утверждения по behavior;
  - статус одинаков у трёх зрителей; факт с `points: 0` и `isCorrect: true` даёт `ungraded`;
  - студент без ключа при верном ответе без вердиктов: `verdicts` null, `mistakes` 0;
  - ключ неизвестен: `keyVisible` false у администратора и студента с ключом;
  - `toStorableFact`: факт по схеме без изменений; `mistakes: -1` в вердиктах → `dropped ['verdicts', 'mistakes']`, путь `verdicts.mistakes`; ключ `{ value: 2314 }` → ещё и `key`, `keyVersion` null; JSON вызовов `warn` без `2315` и `2314`; результат проходит `ScoredQuestionFactSchema.parse`; ошибка базовых полей бросает без данных.
- `attempt-view-leak.test.ts` (`test_attempt_leak`, без подмены хранилища):
  - `showCorrectAnswer=false`, sequence `'2315'` при ключе `'2314'` и short_answer `'Мейоз'` при ключе `'Митоз'`: первый ответ и повтор 200, тела равны, у обоих вопросов `keyVisible` false, `correctAnswer`, `verdicts`, `mistakes` null, в JSON нет `"2314"` и `"Митоз"`; статусы `partial` и `wrong`; строка `results_version = 2`, факты с `key` `'2314'` и `'Митоз'`, `keyVersion` 1;
  - `showCorrectAnswer=true`: `correctAnswer '2314'`, `keyVisible` true, вердикты `sequence_digits`, `mistakes` 1, `status partial`; верный short_answer — `correctAnswer` null, `status correct`.
- Проверки Task 2:
  - `src/services/scored-attempt` и `attempt-view-leak.test.ts`: `Test Files 2 passed`, `Tests 56 passed (56)`;
  - `no storage shell in phase 5 tests`;
  - `facts stored via safeParse`;
  - `key rule in view.ts`.

### Task 3: гейты

- `yarn verify: OK`, все восемь шагов `passed`:
  - server `643 passed | 1 expected fail (644)`, 33 файла;
  - web `509 passed | 1 expected fail (510)`;
  - exam-core `609 passed`;
  - rbac `2 passed`;
  - script-tests `147 pass`.
- `yarn e2e`: `132 passed (1.4m)`, код 0. `✘` только у `review.spec.ts:303` «D1 — fixed in Phase 5 (SCORE-03) … @known-defect» на chromium-desktop и chromium-mobile. Это ожидаемое падение `test.fail`. Экран результата (`take-test.spec.ts`) и разбор администратора (`review.spec.ts` flow 3) зелёные без правок web.
- Отпечаток: проверка плана вывела один путь `app/server/src/routes/tests/attempt-submit.test.ts` и вышла с кодом 1. Других изменений вне 15 файлов плана нет. Причина — в отклонениях.

## Итог инвариантов scoreQuestionFacts

- Баллы, `isCorrect` и повторная оценка с каноничным ключом совпадают со `scoreQuestionByType` во всех 15 строках. Правила оценки не менялись.
- `isCorrect ⇔ mistakes === 0` и `allPartsCorrect ⇔ mistakes === 0` выполняются во всех строках.
- Все 15 фактов и факты без ключа проходят `ScoredQuestionFactSchema.parse`.
- `errorUnits(verdicts) === mistakes` выполняется у 9 строк sequence_digits, matching, short_text и не выполняется у двух строк выбора (блокер формулировки плана, см. ниже):
  - `radio`, ответ `'a'` при ключе `'b'`: `mistakes` 1 (метрика `boolean_correct`), `errorUnits` 2 (`selected_wrong` a + `missed` b);
  - `checkbox`, ответ `['b','d']` при ключе `['a','c']`: `mistakes` 2 (`set_distance`), `errorUnits` 4.
- У строки short_answer без ответа `scoreQuestionByType` даёт `MISTAKES_UNSCORABLE`, а `mistakes` факта — число по вердиктам (1), как задаёт `resolveMistakes` адаптеров. Поэтому сравнение с `mistakesCount` пропускает такие строки.

## Затронутые символы `public.ts` (для слияния с фазой 7)

- Обработчик POST `/tests/:id/submit`:
  - добавлена константа `viewer = { kind: 'student', showCorrectAnswer: test.showCorrectAnswer }`;
  - повтор `precheck.sameClient` и ответ после `submitAttempt` — `readAttemptView(attemptId, viewer)` вместо `readSubmittedResult`;
  - блок оценки (вопросы, ключи, цикл `scoreQuestionByType`, итоги) заменён вызовом `scoreSubmission({ testId, answers, passingScore, readExplanation })`;
  - `no_questions` → 404 `{ error: 'Questions not found' }`, `type_not_configured` → 500 `{ error: 'Question type is not configured: <type>' }`;
  - пояснение читается в замыкании `readExplanation` маршрута: `readFirstMarkdown(buildQuestionMarkdownCandidates({ storedPath, topicSlug, testSlug, testId, questionId, fileName: 'explanation.md' })).then((text) => text || null)`. Это место фаза 7 переводит на свой модуль, сигнатуры функций прежние;
  - `submitAttempt` получает `scored: { results: facts, resultsVersion: 2, … }`.
- Импорты:
  - из `@bio-exam/exam-core` убран `scoreQuestionByType`;
  - из `drizzle-orm` убран `inArray` (больше не используется);
  - из `db/schema.js` убран `answerKeys`;
  - `readSubmittedResult` заменён на `readAttemptView, scoreSubmission` из `services/scored-attempt/index.js`.
- Не тронуты: `buildQuestionMarkdownCandidates`, `readFirstMarkdown`, импорт `storageService` из `services/storage/storage.js`, обработчики чтения теста, импорт `getQuestionTypeMapForTest` (его используют обработчики чтения), предупреждение линтера о `appSettings` (было до плана).

## CodeGraph (D-23)

В worktree нет `.codegraph/`, команды выполнены в основном дереве по индексу до фазы 5.

- `codegraph impact scoreQuestionByType`: 7 символов — `scoring.ts:78`, `routes/tests/public.ts` (маршрут POST submit), `routes/index.ts`, `scoring.test.ts` (`scoreCase`), `exam-core/index.ts`. После плана маршрут его не вызывает, вызывает `scoreQuestionFacts`.
- `codegraph impact computeVerdicts`: 14 символов — `review.ts:25`, `invariants.test.ts`, `review.test.ts`; web `attempt-review-utils.ts` (`getChoiceOptionReviewRows`, `getSequenceReview`), `QuestionAnswerReview.tsx` (`ChoiceAnswerReview`, `MatchingAnswerReview`, `TextAnswerReview`, `QuestionAnswerReview`), `AttemptQuestionsList.test.ts`, `attempt-review-utils.test.ts`; `exam-core/index.ts`. Сама функция не менялась.
- `codegraph impact readSubmittedResult`: символ не найден (появился в 05-06 после индекса). Вызывался только из `public.ts`, удалён.
- `codegraph affected` по 10 файлам плана, которые есть в индексе, дал 19 файлов:
  - server: `question-type-resolver.ts`, `attempt-submit.test.ts`, `exam-flow.test.ts`, `public.ts`;
  - web: `QuestionEditorPageClient.tsx`, `QuestionEditor.tsx`, `question-validation.ts`, `admin/tests/types/index.ts`, `TestRunner.tsx`, `QuestionAnswerReview.tsx`, `attempt-review-utils.ts`, `lib/tests/api.ts`, `lib/tests/types.ts`;
  - exam-core: `answer.test.ts`, `attempt-result.test.ts`, `authoring.test.ts`, `invariants.test.ts`, `review.test.ts`, `scoring.test.ts`.
  - Все тесты из списка прогнаны в `yarn verify` и зелёные; web-компоненты покрыты typecheck и `yarn e2e`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `attempt-submit.test.ts`: ожидание `results_version` 1 → 2**
- **Found during:** Task 1
- **Issue:** тест 05-06 «повтор с равными телами» проверял `results_version: 1`. План требует версию 2, поэтому тест краснел бы по замыслу плана, хотя файла нет в списке плана.
- **Fix:** одна строка ожидания, `results_version: 2`.
- **Files modified:** `app/server/src/routes/tests/attempt-submit.test.ts`
- **Следствие:** проверка отпечатка Task 3 выводит этот путь и выходит с кодом 1. Allow-list плана не правился.

**2. [Rule 1 - Bug] Сравнение `viewer.kind === 'admin'` запрещено проверкой ролей**
- **Found during:** Task 3, первый прогон `yarn verify` (`FAILED at script-tests`, `auth-no-role-string-checks.test.mjs`: «сравнение с литералом роли» в `view.ts:38`).
- **Fix:** `discloseKey` сначала проверяет `viewer.kind === 'student'`, ветвь администратора — без сравнения с литералом. Правило скрытия ключа осталось в `view.ts` и не изменилось. Таблица вида и тест утечки после правки зелёные (56 passed), второй `yarn verify: OK`.
- **Files modified:** `app/server/src/services/scored-attempt/view.ts`

### Решения исполнителя (автономно)

1. **Инвариант `errorUnits(verdicts) === mistakes` сужен до трёх шаблонов.** План требует его по всем 15 строкам. Для строк выбора он не выполняется (две строки выше), и это решение фазы 3: `invariants.test.ts` проверяет равенство только для `UNITS_EQUAL_TEMPLATES = ['sequence_digits', 'matching', 'short_text']`. Правила оценки, схемы и адаптеры не менялись. Для выбора проверяется `errorUnits >= mistakes` и совпадение нуля. По указанию плана строки описаны как блокер формулировки в разделе «Итог инвариантов».
2. **Дополнительный инвариант** `mistakes === scoreQuestionByType(...).mistakesCount` (если не `MISTAKES_UNSCORABLE`): он сильнее `errorUnits` и описывает сохраняемое значение.
3. **`keyVersion` null при отсутствии активного ключа**, `version` ключа — иначе.
4. **Проверка типов вопросов до оценки.** `type_not_configured` возвращается до чтения ключей и пояснений. Прежний блок выходил на первом таком вопросе внутри цикла, ответ тот же.
5. **`readFactsFromRow` принимает необязательный `attemptId`** для сообщения `AttemptResultsShapeError`. Неизвестная версия тоже даёт `AttemptResultsShapeError`.
6. **Дополнительные экспортируемые типы:** `ScoreQuestionFactsInput`, `ScoreQuestionFactsResult`, `AttemptFacts` (пакет); `ExplanationReader`, `ScoreSubmissionParams`, `ScoreSubmissionResult`, `StorableFactWarning`, `AttemptSummary` (модуль). На поведение не влияют. `toStorableFact` тоже экспортирован из `index.ts` модуля.

### Наблюдение

Разбор администратора (`GET /admin/attempts/:id`) берёт `correctAnswer` из строки, а при его отсутствии — активный ключ. В фактах версии 2 поля `correctAnswer` нет (есть `key`), поэтому разбор по-прежнему показывает текущий ключ. D1 остаётся ожидаемым падением в сервере и e2e, его чинит 05-08.

## TDD Gate Compliance

Коммиты не выполнялись (правило пользователя). Настоящий RED для Task 2 не наблюдался: tracer-задача Task 1 уже реализовала поведение, а таблицы написаны после неё. Чувствительность тестов проверена мутацией: в `view.ts` ветвь «студент без ключа, неверный ответ» временно отдавала ключ, вердикты и ошибки. Прогон `src/services/scored-attempt` и `attempt-view-leak.test.ts` дал `Tests 11 failed | 45 passed (56)`. После возврата файла — `56 passed`. REFACTOR — перестройка ветвей зрителя в `view.ts` (отклонение 2) при зелёных тестах.

## Known Stubs

Нет. Для попыток версии 1 вердикты и `mistakes` null, ключ берётся из сохранённого `correctAnswer`. История ключей и пересчёт для них — объём 05-08 по плану.

Ветвь `resultsVersion === 1` в `readFactsFromRow` в этом плане тестом не покрыта: маршрут больше не пишет строки версии 1, а `view.test.ts` намеренно не импортирует `read.ts` (он тянет `db`). Тест чтения старых строк — в 05-08.

## Threat Flags

Новых поверхностей нет: маршрут прежний, наружу уходит только вид.
- T-5-21: ответ и повтор строит только `buildAttemptView`, тест утечки сериализует оба тела.
- T-5-22: вердикты студенту без ключа отдаются только при верном ответе и `allPartsCorrect`, таблица 45 строк.
- T-5-23: `scoreSubmission` оценивает только вопросы теста из БД.
- T-5-38: `toStorableFact` с `safeParse` и понижением, предупреждение без значений.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. CONTEXT `<specifics>` п. 5: видимость ключа в виде студента берётся из текущей настройки `showCorrectAnswer` теста, сам ключ — сохранённый при сдаче.
2. CONTEXT `<specifics>` п. 8: статус вопроса с 0 баллов — «Без оценки» (`ungraded`). Экран — в 05-09.
3. CONTEXT `<specifics>` п. 9: ответ submit получает поля `status`, `keyVisible`, `mistakes`, `verdicts`. `results` новых попыток хранит ключ и вердикты, `results_version = 2`. Оговорка отката D-25: прежний server прочитал бы такие строки как старые `results`, поэтому откат только в окне выкатки.
4. Формулировку must_have truth № 2 плана 05-07 («табличный тест держит инварианты errorUnits(verdicts) === mistakes») должен поправить планировщик: для single_choice и multi_choice равенство не выполняется по решению фазы 3, тест проверяет его у трёх шаблонов.
5. Решить, как учитывать `attempt-submit.test.ts` в allow-list плана: файл изменён одной строкой ожидания `results_version: 2`.
6. Коммит 16 файлов делает пользователь (оркестратор).

## Self-Check: PASSED

- Новые файлы существуют: `facts.ts`, `storable-fact.ts`, `view.ts`, `read.ts`, `view.test.ts`, `attempt-view-leak.test.ts`. Ещё 10 файлов изменены (`git status`: 16 путей).
- В новых и изменённых строках комментариев нет.
- `yarn verify: OK`, `yarn e2e` 132 passed, падает только ожидаемый D1.
- Коммитов нет по правилу пользователя.

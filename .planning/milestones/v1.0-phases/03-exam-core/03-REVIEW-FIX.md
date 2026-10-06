---
phase: 03-exam-core
source_review: 03-REVIEW.md, 03-SQUAD-REVIEW.md (P3)
fixed: [IN-05, WR-02, IN-02, G4, WR-01, G1, G2, G7, WR-03, N4]
not_fixed_by_decision: [N1, N2, N3, IN-01, IN-03, IN-04, IN-06, G3, G5, G6, G8, G9, G10, G11, ui_template без CHECK]
commit: не выполнялся (правило пользователя), изменения в рабочем дереве
status: complete
---

# Фаза 3: исправления по ревью кода

Исправлены только находки, подтверждённые devils-advocate. Порядок работы: сначала тест, затем прогон, затем правка, затем повторный прогон. Красные прогоны до правки сохранены в scratchpad сессии (`red-exam-core.txt`, `red-web.txt`, `probe-a.txt`, `probe-b.txt`, `probe-c.txt`). Если находка не меняет поведение, тест не мог быть красным до правки; в таблице это записано как «характеризация».

## Сводка

| Находка | Правка | Тест | Красный до правки | Зелёный после |
|---|---|---|---|---|
| IN-05 | `e2e/tests/review.spec.ts:292` | тот же e2e, строгое `.toBe('1')` | нет, характеризация D-11 | да, оба проекта |
| WR-02 | `packages/exam-core/src/review.ts:25-37` | `invariants.test.ts:85-153`, `:190-192`; `review.test.ts:118-131` | да (`mistakes` 2 вместо 1) | да |
| IN-02 | `QuestionEditor.tsx:97-99` | `scripts/exam-core-no-private-copies.test.mjs`, шаблон «форма ключа по сравнению метрики» | да, проба B на прежнем файле | да |
| G4 | `app/server/src/routes/tests/exam-flow.test.ts:722-729` | новая строка таблицы submit | нет, характеризация | да |
| WR-01 | `review.ts:21-23`, `:26`, `:44`, `:53`; `authoring.ts:32-34` | `review.cases.ts:744-749`, `:865-871`; `review.test.ts:133-140`; `authoring.cases.ts:1184`, `:1191` | да (4 теста: TypeError и брошенная ошибка) | да |
| G1, G2 (P3) | новый `scripts/exam-core-no-private-copies.test.mjs` | сам этот тест | да, пробы A, B, C | да, в шаге `script-tests` |
| G7 | `invariants.test.ts:210-231` | сам этот тест | нет, условие уже выполнялось | да |
| WR-03 | `app/web/components/tests/attempt-review/attempt-review-utils.ts:85` | `attempt-review-utils.test.ts:43-50` | да (`mistakes` 1 вместо 0) | да |
| N4 | `packages/exam-core/src/adapters/matching.ts:90-92` | `authoring.cases.ts:906-917` | да (`null` вместо `Укажите правильные соответствия`) | да |

## По находкам

### 1. IN-05: устаревший комментарий в e2e

- **Что изменено.** `e2e/tests/review.spec.ts:292`: удалены комментарий «JSONB отдаёт 1, а не "1"» и обёртка `String(...)`. Теперь проверка строгая: `expect(reread.questions.find(...)?.correct).toBe('1')`.
- **Чем закреплено.** e2e `D1 setup: student answers correctly, admin records the review and corrects the key @known-defect` на `chromium-desktop` (54) и `chromium-mobile` (106).
- **Красный и зелёный.** Поведение не менялось, поэтому красным тест быть не мог. Новая форма покраснеет, если API снова начнёт отдавать число (регрессия D-11). После правки оба проекта зелёные.

### 2. WR-02: `computeVerdicts` с метрикой чужого шаблона

- **Как считает submit.** `scoreQuestionByType` вызывает `normalizeScoringRule` (`packages/exam-core/src/scoring.ts`). Та проверяет только схему правила, а совместимость метрики с шаблоном не проверяет. Затем `countMistakes(metric)` выбирает адаптер через `templateForMetric(metric)`, то есть адаптер ЧУЖОГО шаблона. Метрика сбрасывается до значения по умолчанию на сервере в трёх местах:
  - глобальные типы проходят через `parseScoringRule` (`app/server/src/lib/tests/question-type-resolver.ts:48-54`);
  - запись переопределения проверяется дважды: маршрут отклоняет несовместимую метрику (`app/server/src/routes/tests/index.ts:748-758`), а `upsertTestQuestionTypeOverride` пропускает её через `parseScoringRule` (`question-type-resolver.ts:205`).
  Однако при чтении `applyOverride` (`question-type-resolver.ts:86`) берёт `scoringRuleOverride` из БД как есть.
- **Расхождение (не чинилось, записано как граница).** Если вручную записать в `test_question_type_overrides` метрику чужого шаблона, submit посчитает ошибки адаптером этой метрики, а разбор после правки посчитает метрикой шаблона по умолчанию. Через API такое состояние не создать: CRUD отклоняет чужую метрику, `parseScoringRule` сбрасывает её на значение по умолчанию. Для всех метрик, которые шаблон разрешает, разбор и submit используют один и тот же адаптер и одну метрику, поэтому D-08 («Ошибок: N» равно ошибкам submit) выполняется.
- **Что изменено.** `packages/exam-core/src/review.ts:25-37`. Метрика разрешается так: `input.metric && isMistakeMetricAllowedForTemplate(template, metric) ? metric : defaultMistakeMetricForTemplate(template)`. Части и `mistakes` возвращает один вызов `TEMPLATE_ADAPTERS[template].verdicts(...)`. Перезапись `mistakes` через `countMistakes(metric)` убрана: каждый адаптер уже вызывает `resolveMistakes` по своему `countMistakes`. Для разрешённых метрик `templateForMetric(metric) === template`, значит число то же. Импорты `resolveMistakes` и `countMistakes` из `review.ts` удалены.
- **Чем закреплено.**
  - `packages/exam-core/src/invariants.test.ts:85-153` — `FOREIGN_METRIC_ROWS`, 6 строк: `short_text+hamming_digits` (12/21 и 12/12), `sequence_digits+compact_text_equal`, `matching+boolean_correct`, `multi_choice+boolean_correct`, `single_choice+set_distance`. Строки добавлены в `ROWS`.
  - `:155-159` и `:190`: эталон `counted` считается по эффективной метрике (формулировка D-08).
  - `:192`: прямая проверка `allPartsCorrect(verdicts) === (verdicts.mistakes === 0)`.
  - `:233-238`: все строки `FOREIGN_METRIC_ROWS` действительно с чужой метрикой.
  - `packages/exam-core/src/review.test.ts:118-131`: `short_text + hamming_digits`, ключ `'12'`, ответ `'21'`. Ожидается: части `['wrong']`, `mistakes 1`, `errorUnits === mistakes`, результат равен вызову без метрики. Отдельный `test`, а не строка `SHORT_TEXT_REVIEW_CASES`, потому что тип `metric` там ограничен двумя метриками `short_text`.
- **Красный и зелёный.** До правки: `invariants.test.ts` → `чужая метрика: short_text + hamming_digits, 12/21: mistakes 2 !== 1`; `review.test.ts` → `2 !== 1`. После правки 498/498.

### 3. IN-02: смена типа в редакторе мимо адаптера

- **Что изменено.** `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx:97-99`: условие `template === 'short_text' && selectedType.scoringRule.mistakeMetric === 'compact_text_in_set'` заменено на `keyShapeFor({ uiTemplate: template, mistakeMetric: selectedType.scoringRule.mistakeMetric }) === 'text_variants'`. Форма `text_variants` есть только у `short_text`, поэтому поведение то же. Вёрстка не менялась.
- **Чем закреплено.** В `scripts/exam-core-no-private-copies.test.mjs` правило `форма ключа по сравнению метрики мимо keyShapeFor` с регуляркой `mistakeMetric\s*[!=]==?\s*['"]` по `app/web` и `app/server/src`.
- **Красный и зелёный.** Проба B: на время теста подставлена копия `QuestionEditor.tsx` до правки (`cp` из scratchpad, возврат `cp` с подтверждением `cmp`). Тест упал: `QuestionEditor.tsx: форма ключа по сравнению метрики мимо keyShapeFor (D-17 п. 14 (D-09))`. На исправленном файле зелёный. Web-тесты 190/190 и typecheck зелёные.

### 4. G4: вариант `'эксперимент'` в таблице submit

- **Что изменено.** В `app/server/src/routes/tests/exam-flow.test.ts:722-729` добавлена строка `short_answer_variants: 'эксперимент'` → `earned 1, points 1, isCorrect true`. Существующие строки не менялись.
- **Красный и зелёный.** Характеризация, поэтому красным до правки быть не могло. После: `✓ оценка submit по шаблонам > short_answer_variants: 'эксперимент' → 1 из 1`, весь сервер 242/242 (`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test`).

### 5. WR-01: неизвестный шаблон

- **Что изменено.**
  - `packages/exam-core/src/review.ts:21-23` — `isKnownTemplate`: `typeof template === 'string' && Object.hasOwn(TEMPLATE_ADAPTERS, template)`.
  - `isAnswered` (`:44`) возвращает `false`.
  - `readKey` (`:53`) возвращает `null`. Проверка стоит до `isMistakeMetricAllowedForTemplate`, которая на неизвестном шаблоне сама падала TypeError на `.includes`.
  - `computeVerdicts` (`:26`) бросает `Error('Неизвестный шаблон вопроса: <шаблон>')`. Проверка стоит до разрешения метрики.
  - `packages/exam-core/src/authoring.ts:32-34`: `keyShapeFor` возвращает `KeyShape | null`, на неизвестном шаблоне `null`, а не исключение. В `QuestionEditor.tsx:54-58` при `null` выражение `=== 'text_variants'` даёт `false`, и рендер не падает.
- **Почему `computeVerdicts` бросает ошибку, а не возвращает пустой разбор.** `QuestionVerdicts` — размеченное объединение по пяти шаблонам. Пустой разбор с чужим `template` в тип не ложится без приведения и попал бы в ветки разбора как валидный. Все вызовы на web передают литеральный шаблон (`attempt-review-utils.ts:58` после фильтра `single_choice`/`multi_choice`, `:86` `sequence_digits`, `QuestionAnswerReview.tsx:112` `matching`), поэтому исключение недостижимо из UI и существующие таблицы не ломает. Понятный текст вместо `Cannot read properties of undefined` сразу показывает причину. Текст совпадает с прежним сообщением `keyShapeFor`.
- **Чем закреплено.**
  - `packages/exam-core/src/cases/review.cases.ts:744-749` — `IS_ANSWERED_CASES`: `неизвестный шаблон essay` → `false`.
  - `:865-871` — `READ_KEY_CASES`: `неизвестный шаблон essay` → `null`.
  - `packages/exam-core/src/review.test.ts:133-140` — `computeVerdicts` бросает `{ message: 'Неизвестный шаблон вопроса: essay' }`.
  - `packages/exam-core/src/cases/authoring.cases.ts:1184` — тип `expected: KeyShape | null`; `:1191` — `essay + compact_text_equal → null`.
- **Красный и зелёный.** До правки:
  - `isAnswered` → `TypeError: Cannot read properties of undefined (reading 'isAnswered')`;
  - `readKey` → `TypeError ... (reading 'includes')`;
  - `computeVerdicts` → `TypeError ... (reading '0')`, ожидалась понятная ошибка;
  - `keyShapeFor` → `Error: Неизвестный шаблон вопроса: essay`.
  После правки все зелёные.
- **Экспорты.** Имена не менялись: `check-exam-core-dist.mjs` → `57 экспортов в ESM и CJS`, `EXPECTED_EXPORTS` не правился. Изменилась только сигнатура `keyShapeFor` (возвращаемый тип). typecheck web и server чистый.

### 6. G1 и G2 (P3 squad-ревью): постоянный тест «приватных копий логики шаблона нет»

- **Что создано.** `scripts/exam-core-no-private-copies.test.mjs`. Его подхватывает шаг `script-tests` в `yarn verify` по маске `scripts/**/*.test.mjs` (`scripts/verify.mjs:50-58`, `:69-78`). Шаги `yarn verify` не добавлялись и не переименовывались.
- **Что проверяет.**
  - Обходит `app/web` и `app/server/src`. Пропускает каталоги `node_modules`, `.next`, `.turbo`, `.vercel`, `dist`, `out`, `coverage` и файлы `*.test.*`, `*.spec.*`. Тестовые помощники вроде `readKey` в `answer-keys-jsonb.test.ts` не являются логикой шаблона.
  - Ищет объявления значений `function NAME`, `const|let|var|class NAME`. Импорт, реэкспорт и вызов не считаются. Имена сгруппированы по позициям D-17 (1-19) и взяты из прежних копий (`git show HEAD:<файл>`) и публичных экспортов пакета: `count*Mistakes`, `scoreQuestionByType`, `normalizeScoringRule`, нормализаторы, реестр и схемы правил, `validateByTemplate`, `IdSchema`, `CorrectAnswerSchema`, `SubmitAnswerValueSchema`, `TelemetrySchema`, `SubmitResult*Schema`, `AnswerValueSchema`, `mergeTelemetryMaps`, схемы телеметрии, `normalizeSequenceCorrectValue`, `isValidSequenceCorrectValue`, `normalizeDraftCorrect`, `validateQuestionForSave`, адаптеры, `keyShapeFor`, `toCanonicalKey`, `isAnswered`, `answerIdList`, `normalizeKeyValue`, `computeVerdicts`, `allPartsCorrect`, `errorUnits`, `readKey`.
  - Отдельные шаблоны: литерал `z.enum(['single_choice', …])` (п. 5) и сравнение `mistakeMetric ===`/`!==` со строкой (п. 14, D-09).
  - Позиция 20 (`ScoringRulesEditor`, legacy D-19) не проверяется. Единственное точечное исключение — пара файл+имя `app/server/src/lib/tests/scoring.ts` + `SCORING_FORMULAS` (legacy `TestScoringRules`). Отдельный тест проверяет, что исключение указывает на существующее объявление и не устарело.
  - Тонкие web-обёртки над пакетом (`validateQuestion` в `question-validation.ts`, `getCreateQuestionsValidationError`, `answerIds`, `getChoiceOptionReviewRows`, `formatAnswerLines`) в список не входят: это вызовы пакета, а не копии.
  - Файлов `app/server/src/lib/tests/{question-types,submit-result,telemetry}.ts` нет.
  - `app/web/components/tests/telemetry.ts` реэкспортирует `mergeTelemetryMaps` из `@bio-exam/exam-core` без переименования.
  - Есть защита от пустого прогона: каждый корень содержит исходники, всего не меньше 50 файлов. Самопроверка детектора на строках с объявлением, импортом, реэкспортом, вызовом и похожим именем.
- **Красный и зелёный (мутационные пробы, после каждой дерево возвращено).**
  - Проба A: временный файл `app/web/lib/tests/zz-probe-copy.ts` с `export function mergeTelemetryMaps`. Тест упал: `app/web/lib/tests/zz-probe-copy.ts: локальное объявление mergeTelemetryMaps (D-17 п. 7, 18), импортируйте из @bio-exam/exam-core`. Файл удалён, каталог проверен.
  - Проба B: `QuestionEditor.tsx` до правки IN-02 (см. п. 3). Красный.
  - Проба C: в `telemetry.ts` реэкспорт заменён на `mergeTelemetryMaps as mergeMaps`. Первая версия регулярки реэкспорта такое пропускала. Регулярка ужесточена, после этого проба C красная: `✖ web telemetry реэкспортирует mergeTelemetryMaps из @bio-exam/exam-core`. Файл возвращён `cp`, совпадение подтверждено `cmp`.
  - На текущем дереве 5/5. В `yarn verify` строка `✔ в app/web и app/server/src нет приватных копий логики шаблона из списка D-17`.
- **Что тест не покрывает.** Объявления типов (`type`/`interface`) не проверяются: задача ограничена функциями и схемами. Часть имён в списке взята из прежних копий, и пакет их не экспортирует: `IdSchema`, `CorrectAnswerSchema`, `validateByTemplate`, `normalizeRule`, `scoreByMetric`, `isMetricAllowedForTemplate`, `normalizeDraftCorrect` и другие. Сообщение теста для них тоже советует импорт из пакета. По смыслу оно значит: логика этого имени живёт в `@bio-exam/exam-core`, используйте функцию пакета. Замечено, но не правилось: `app/web/lib/tests/api.ts:108` — локальный неэкспортируемый алиас `type TelemetryMap = Record<string, QuestionTelemetry>`, дубль типа пакета.

### 7. G7: у каждого шаблона есть строка с ошибками и без ошибок

- **Что изменено.** `packages/exam-core/src/invariants.test.ts:210-231`. Для каждого из пяти шаблонов по строкам `ROWS` считается `computeVerdicts(...).mistakes`. Тест требует хотя бы одну строку с `0 < mistakes < MISTAKES_UNSCORABLE` и хотя бы одну с `mistakes === 0`.
- **Красный и зелёный.** Таблицы уже удовлетворяли условию, поэтому в первом прогоне тест был зелёным, в списке упавших его нет. Строки добавлять не понадобилось. Тест защищает от будущего обеднения таблиц.

### 8. WR-03: разбор последовательности при сохранённом `isCorrect`

- **Что изменено.** `app/web/components/tests/attempt-review/attempt-review-utils.ts:85`: `const key = input.isCorrect ? input.studentAnswer : input.correctAnswer`. Условие `visible` (`:84`), `showCells` (требует `correctAnswer != null`) и скрытие цифр ключа в sr-only (`sequencePositionLabel`, T-3-22) не менялись. При `isCorrect` ошибок 0, поэтому ячеек нет, как требует UI-SPEC.
- **Чем закреплено.** `app/web/components/tests/attempt-review/attempt-review-utils.test.ts:43-50`: ключ `1234`, ответ `1243`, `isCorrect: true` → `visible true`, `mistakes 0`, `summaryText 'Ошибок: 0'`, `showCells false`, `hasSwap false`.
- **Красный и зелёный.** До правки: `AssertionError: 1 !== 0` на `review.mistakes`. После правки web 190/190, `AttemptQuestionsList.test.ts` зелёный без правок. Корень D1 (подстановка текущего ключа) не трогался, его закрывает Phase 5 (SCORE-03). e2e D1 по-прежнему ожидаемо падает.

### 9. N4: пустое значение пары в matching

- **Что изменено.** `packages/exam-core/src/adapters/matching.ts:90-92`: к условию отклонения добавлено `mapped === ''`. Текст ошибки тот же, что для пары вне списка (`AUTHORING_MESSAGES.matchingKeyMissing`, «Укажите правильные соответствия»). Так восстановлена семантика прежнего `!mapped` из `validateByTemplate` (`git show HEAD:app/server/src/lib/tests/question-type-resolver.ts:246-248`). Обрезка пробелов не добавлялась: прежний код её не делал.
- **Чем закреплено.** `packages/exam-core/src/cases/authoring.cases.ts:906-917`: справа элемент с `id: ''`, ключ `{ l1: 'r1', l2: '' }` → `matchingKeyMissing`, правило `validateByTemplate matching: левый без правого`. Тот же адаптер вызывают web (`question-validation.ts`) и сервер (`validateQuestionWithType`), так что строка закрепляет обе стороны.
- **Красный и зелёный.** До правки: `+ null - 'Укажите правильные соответствия'`. После правки зелёный.

## Не исправлялось (по вердикту)

N1, N2, N3, IN-01, IN-03, IN-04, IN-06, G3, G5, G6, G8, G9, G10, G11, `ui_template` без CHECK. Код этих мест не трогался.

## Прогоны

| Команда | Результат |
|---|---|
| `yarn workspace @bio-exam/exam-core test` | 11 файлов, 498/498 (до правок 7 упавших из 498) |
| `yarn workspace @bio-exam/exam-core typecheck`, `lint`, `build` | код 0 |
| `node scripts/check-exam-core-dist.mjs` | `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 57 экспортов в ESM и CJS` (`EXPECTED_EXPORTS` без изменений) |
| `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server test` | 10 файлов, 242/242 |
| `yarn workspace @bio-exam/web test` | 10 файлов, 190/190 |
| `yarn workspace @bio-exam/web typecheck` | код 0 |
| `node --test scripts/exam-core-no-private-copies.test.mjs` | 5/5 |
| `yarn format:check` | `All matched files use the correct format.` |
| `yarn verify` | все 8 шагов `passed`, `yarn verify: OK` |
| `yarn e2e` | `108 passed (33.1s)`, код 0. Ожидаемо падает (`test.fail`) только D1 `review.spec.ts:303` на обоих проектах |

Форматирование применялось точечно (`yarn oxfmt <файл>`) только к файлам, изменённым в этом прогоне.

## Изменённые файлы

- `packages/exam-core/src/review.ts`
- `packages/exam-core/src/authoring.ts`
- `packages/exam-core/src/adapters/matching.ts`
- `packages/exam-core/src/review.test.ts`
- `packages/exam-core/src/invariants.test.ts`
- `packages/exam-core/src/cases/review.cases.ts`
- `packages/exam-core/src/cases/authoring.cases.ts`
- `app/web/app/(internal)/(protected)/admin/tests/components/QuestionEditor.tsx`
- `app/web/components/tests/attempt-review/attempt-review-utils.ts`
- `app/web/components/tests/attempt-review/attempt-review-utils.test.ts`
- `app/server/src/routes/tests/exam-flow.test.ts`
- `e2e/tests/review.spec.ts`
- `scripts/exam-core-no-private-copies.test.mjs` (новый)
- `.planning/phases/03-exam-core/03-REVIEW-FIX.md` (этот отчёт)
- `.planning/STATE.md` (`state.record-session`)

Коммит не выполнялся (правило пользователя), изменения лежат в рабочем дереве.

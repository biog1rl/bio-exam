---
phase: 03-exam-core
plan: 06
subsystem: exam-core-review
tags: [exam-core, review, verdicts, invariant, EXAM-02, EXAM-03, EXAM-06, D-07, D-11, D-12, D2]
requires: [03-05, 03-13]
provides:
  - "TemplateAdapter.verdicts / isAnswered / readKey во всех пяти адаптерах (обязательные методы интерфейса)"
  - "src/review.ts: computeVerdicts, errorUnits, allPartsCorrect, isAnswered, readKey, normalizeKeyValue, answerIdList"
  - "Типы QuestionContent, QuestionContentItem, SequencePositionVerdict, ChoiceOptionVerdict, MatchingPairVerdict, ShortTextVerdict, QuestionVerdicts, VerdictsInput, ComputeVerdictsInput"
  - "cases/review.cases.ts: SEQUENCE_REVIEW_CASES (20), CHOICE_REVIEW_CASES (20), MATCHING_REVIEW_CASES (14), SHORT_TEXT_REVIEW_CASES (9), IS_ANSWERED_CASES (27), READ_KEY_CASES (20), NORMALIZE_KEY_VALUE_CASES (11), ANSWER_ID_LIST_CASES (7)"
  - "invariants.test.ts: «все части верны ⇔ ошибок 0» на 133 строках всех таблиц, errorUnits === countMistakes для sequence_digits, matching, short_text"
affects: [03-08, 03-11]
tech-stack:
  added: []
  patterns:
    - "Вердикт = { template, mistakes, parts }; mistakes в computeVerdicts — countMistakes(metric) из scoring.ts (та же функция, что в submit), при MISTAKES_UNSCORABLE — errorUnits(parts)"
    - "Выбор и сопоставление строят части по content (options / matchingPairs.left), затем по id ключа и ответа, которых нет в content; ключ null или неверной формы не обнуляет части"
    - "Выбранные варианты и пары для вердикта берутся строгой normalizeAnswer адаптера (та же, что в countMistakes), а не терпимой answerIdList"
    - "Строка таблицы с ключом неверной формы помечается validKey: false; инвариант её пропускает, отдельный тест требует непустых частей у choice/matching и пустых у sequence_digits"
key-files:
  created:
    - packages/exam-core/src/review.ts
    - packages/exam-core/src/review.test.ts
    - packages/exam-core/src/invariants.test.ts
    - packages/exam-core/src/cases/review.cases.ts
    - packages/exam-core/src/adapters/verdicts.ts
  modified:
    - packages/exam-core/src/adapters/types.ts
    - packages/exam-core/src/adapters/single-choice.ts
    - packages/exam-core/src/adapters/multi-choice.ts
    - packages/exam-core/src/adapters/matching.ts
    - packages/exam-core/src/adapters/short-text.ts
    - packages/exam-core/src/adapters/sequence-digits.ts
    - packages/exam-core/src/cases/scoring.cases.ts
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
decisions:
  - "computeVerdicts пересчитывает mistakes через countMistakes из scoring.ts (диспетчеризация по метрике), а не берёт число адаптера шаблона: при чужой метрике у типа (foreign_hamming в паритете) разбор совпадает с submit"
  - "errorUnits для sequence_digits считает swapped как ceil(count/2): одиночная swapped-часть (аномалия) тоже даёт единицу ошибки, пара — одну"
  - "Для choice и matching при валидном ключе части = элементы content, присутствующие в ключе (для matching) / все варианты (для choice), затем id ключа и ответа вне content; для matching левые элементы content без ключа не показываются, иначе errorUnits разошлось бы с countMistakes"
  - "matching: часть correct только если ответ разбирается строго (normalizeIdRecord); при неразбираемом ответе (значение null в паре) все части wrong, given читается терпимо"
  - "matching: ключ {} трактуется как ключ null — части по content.matchingPairs.left, все wrong"
metrics:
  duration: "~10 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 16000
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 06: вердикты по частям, «отвечено ли» и чтение ключа в адаптерах exam-core Summary

Пять адаптеров отдают вердикты по частям (`sequence_digits` с единицей `swapped`: D2 1243/1234 → `[correct, correct, swapped, swapped]`, 1 ошибка, 1 единица), строгую проверку «отвечено ли» по семантике `TestRunner` и терпимое чтение ключа (D-11 п. 2, D-12); инвариант «все части верны ⇔ ошибок 0» и равенство единиц ошибки счётчику проверены на 133 строках всех таблиц пакета.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило.

## Выполнено

**Task 1 (tracer): последовательность.** `adapters/types.ts` получил типы вердиктов и `QuestionContent`, методы `verdicts`, `isAnswered`, `readKey` в `TemplateAdapter` (в Task 1 опциональные, в Task 2 обязательные). `sequenceDigitsAdapter.verdicts`: ключ через `normalizeDigitsSequence`, ответ через `normalizeDigitsSequence` или сжатую строку, иначе `''`; неразбираемый ключ → `parts: []`; соседняя перестановка (длина > 3, равные длины, ровно два перекрёстных несовпадения рядом) → две `swapped`; иначе позиционно `correct`/`wrong`, `extra`, `missing`. Каждая часть несёт `position` (с 1), `given`, `expected`. `review.ts`: `computeVerdicts` (метрика по умолчанию — `defaultMistakeMetricForTemplate`), `errorUnits`, `allPartsCorrect`. `SEQUENCE_REVIEW_CASES` (20 строк: все строки behavior, повтор цифр 1123/1213, несоседняя перестановка 1234/3214, пустые `''`, `'  '`, `null`, нецифровой ответ, ключи `null` и `1.5` с `validKey: false`). Tracer-гейт (auto): `<verify>` перезапущен, зелёный.

**Task 2 (TDD): остальные шаблоны.**
- `single_choice` / `multi_choice`: части по `content.options` в их порядке, затем id ключа и выбранные id вне `content`; `selected_correct` / `missed` / `selected_wrong` / `neutral`; ключ `null` или неверной формы → выбранные `selected_wrong`, прочие `neutral`, `missed` нет. Выбор читается строгой `normalizeAnswer` адаптера, повтор id не даёт лишних частей, порядок id не влияет.
- `matching`: части по `content.matchingPairs.left` (при валидном ключе — те, что есть в ключе, затем id ключа вне content; без content — по ключу); ключ `null` / `{}` / неверной формы → по одной части `wrong` на каждый левый элемент, `expected: null`, `given` — ответ студента.
- `short_text`: одна часть, `correct ⇔ countMistakes(metric) === 0`.
- `isAnswered`: эталон `TestRunner.tsx:65-83` (строка непустая после trim для short_text и sequence_digits, непустая строка для single_choice, непустой массив для multi_choice, все левые элементы сопоставлены непустой строкой для matching и только при наличии `content.matchingPairs`; число вместо строки и шаблон `null` — не отвечено).
- `readKey`: число → строка, числовые id в массивах и объектах → строки; форма, не совпадающая с метрикой (строка при `compact_text_in_set`, массив при `compact_text_equal`), и метрика чужого шаблона → `null`; для `compact_text_in_set` нестроковые элементы пропускаются (как в счётчике).
- `normalizeKeyValue`: строка как есть, конечное число → строка, массив строк/чисел → массив строк (иначе `''`), объект → объект строк с отброшенными прочими значениями, прочее → `''`.
- `answerIdList`: массив → строковые и числовые элементы строками, строка/число → `[строка]`, прочее → `[]`.
- `scoring.cases.ts`: строкам выбора и сопоставления добавлено поле `content` (варианты покрывают id ключа и ответа, левые элементы = ключ строки), 7 строкам — `validKey: false`: `radio` ключ `null`, `checkbox` ключ-строка, `matching` ключ `{}`, обе строки D-12, `short_answer_variants` пустой набор, `sequence` ключ `1.5`. Дифф против снимка до плана: только импорт типа, поля типа `ScoringCase`, хелперы `options()`/`pairs()` и строки `content:`/`validKey:`; ни одна строка не удалена, ожидания не менялись.
- `scripts/check-exam-core-dist.mjs`: +7 runtime-экспортов (`allPartsCorrect`, `answerIdList`, `computeVerdicts`, `errorUnits`, `isAnswered`, `normalizeKeyValue`, `readKey`), итого 49.

## Инвариант по шаблонам

Тест `invariants.test.ts` (имя подтеста печатает счёт): `проверено строк: 133 (single_choice 12, multi_choice 21, matching 21, short_text 21, sequence_digits 58)`.

| Источник | Строк всего | С validKey: false | В инварианте |
|----------|-------------|-------------------|--------------|
| `*_SCORING_CASES` | 89 | 7 | 82 |
| `SEQUENCE_REVIEW_CASES` | 20 | 2 | 18 |
| `CHOICE_REVIEW_CASES` | 20 | 5 | 15 |
| `MATCHING_REVIEW_CASES` | 14 | 3 | 11 |
| `SHORT_TEXT_REVIEW_CASES` | 9 | 2 | 7 |
| Итого | 152 | 19 | 133 |

Проверки на каждой строке: `allPartsCorrect(computeVerdicts) === (countMistakes === 0)`; для `sequence_digits`, `matching`, `short_text` при конечном `countMistakes` — `errorUnits === countMistakes`; при конечном `countMistakes` — `verdicts.mistakes === countMistakes`. Метрика строки оценки — `normalizeScoringRule(...).mistakeMetric` (строки `broken_rule` с правилом `{}`). Отдельный тест: строки `validKey: false` у choice/matching дают непустые части, у `sequence_digits` — пустые. Утверждение `>= 80` строк и наличие строк каждого шаблона.

## Проба (acceptance Task 1)

Временные правки адаптера, откатаны копированием сохранённого файла, после отката 343/343 зелёные:
- A: позиция 2 при наличии перестановки помечена `wrong` → `AssertionError: оценка: sequence: перестановка соседних цифр: errorUnits` (инвариант единиц красный; цикл останавливается на первой swap-строке 12345/12354, строка D2 следует за ней).
- B: вторая позиция пары `swapped` помечена `wrong` → тот же `AssertionError ... errorUnits` (с `Math.ceil` одиночная `swapped` даёт единицу; при `Math.floor` проба B проходила бы, поэтому выбран `ceil`).
- Дополнительно в Task 2: `allPartsCorrect` принимает `missed` за верное → `AssertionError: оценка: radio: неотвеченный вопрос (null) ...: allPartsCorrect при 1`.

## TDD Gate Compliance

Коммиты RED/GREEN не выполнялись (правило пользователя), последовательность соблюдена по сути:
- Task 1 RED: `review.test.ts` и `invariants.test.ts` при заглушке `computeVerdicts` → 21 failed, `Error: Вердикты для шаблона sequence_digits не реализованы`. GREEN: 231 passed.
- Task 2 RED: после таблиц и тестов → 111 failed | 130 passed; причины `Вердикты для шаблона matching/multi_choice/short_text/single_choice не реализованы`, `answerIdList / isAnswered / normalizeKeyValue / readKey is not a function`; `scoring.test.ts` зелёный (поля `content`/`validKey` не меняют оценку). GREEN: 343 passed.
- REFACTOR: не потребовался.

## Проверки

- `yarn workspace @bio-exam/exam-core test` → 9 files, 343 passed.
- `yarn workspace @bio-exam/exam-core typecheck` → exit 0; `lint` → exit 0; `yarn oxfmt --check packages/exam-core scripts/check-exam-core-dist.mjs` → чисто.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs` → `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 49 экспортов в ESM и CJS`.
- `yarn verify` → `yarn verify: OK` (exam-core 343 passed; `app/server/src/lib/tests/scoring-parity.test.ts` зелёный).
- `git status --porcelain -- app` и `git diff -- app | shasum` совпадают со снимком до плана: план не тронул `app/`.
- `boundaries.test.ts` зелёный: пакет без React/DOM, новые модули импортируют только относительные пути.

## Deviations from Plan

**1. [Rule 2 / решение исполнителя (автономно)] Новый файл `adapters/verdicts.ts`** — `errorUnits`, `allPartsCorrect`, `resolveMistakes`, `choiceOptionVerdicts`. Адаптерам нужен `errorUnits` для `mistakes`, а `review.ts` импортирует адаптеры; размещение в `review.ts` дало бы цикл импортов. `review.ts` реэкспортирует `errorUnits` и `allPartsCorrect`, публичный API как в плане.

**2. [Rule 1 / решение исполнителя (автономно)] `computeVerdicts` берёт `mistakes` из `countMistakes` scoring.ts**, а не из числа адаптера шаблона. Для разрешённых метрик результат совпадает; при чужой метрике у типа (legacy, `foreign_hamming` в паритете) число в разборе совпадает с submit. Ключевая связь плана `review.ts → countMistakes(` выполнена буквально. Адаптерный `verdicts` тоже считает `mistakes` своим `countMistakes` (по плану).

**3. [Дополнение] Сверх behavior** в таблицах: single_choice с числовыми ключом/ответом, ответ формы multi_choice, null; multi_choice без content, ключ-строка, ответ null, ключ null + ответ null; matching без content, порядок content.left, лишняя пара, значение null в паре, ключ `{}`; short_text ключ null и пустой ответ; isAnswered — массивы, числа, пустая строка в паре, без пар в content; readKey — элемент null, метрика чужого шаблона.

## Наблюдения исполнителя

- `sequence_digits` с неразбираемым ключом: `parts: []`, `errorUnits` 0, поэтому `mistakes` = 0 (по формуле плана «countMistakes, иначе errorUnits»). Строки помечены `validKey: false`. На web (03-11) разбор при ключе `null` и неверном ответе всё равно не показывает «Ошибок: N» (UI-SPEC: только `correctAnswer != null || isCorrect`).
- `single_choice` с ключом `null`: `countMistakes` = 1 (не `MISTAKES_UNSCORABLE`, как на сервере), поэтому `mistakes` 1 и при пустом ответе (все части `neutral`).
- Правило соседней перестановки теперь записано в двух местах `sequence-digits.ts` (`countMistakes` без изменений ради паритета и `findAdjacentSwap` для вердиктов); расхождение ловит инвариант единиц.

## Known Stubs

Нет.

## Threat Flags

Нет: новых сетевых точек, путей доступа и схем нет. T-3-11 закрыт тестом инварианта и `computeVerdicts → countMistakes`; T-3-12: пакет строит `expected` только из переданного ключа, при `key: null` у matching `expected: null`.

## Deferred human verification

Нет человеческих шагов в плане. Коммит изменений — за пользователем (правило пользователя), исполнитель не коммитил.

## Файлы к коммиту

- packages/exam-core/src/adapters/types.ts
- packages/exam-core/src/adapters/verdicts.ts (новый)
- packages/exam-core/src/adapters/single-choice.ts
- packages/exam-core/src/adapters/multi-choice.ts
- packages/exam-core/src/adapters/matching.ts
- packages/exam-core/src/adapters/short-text.ts
- packages/exam-core/src/adapters/sequence-digits.ts
- packages/exam-core/src/review.ts (новый)
- packages/exam-core/src/review.test.ts (новый)
- packages/exam-core/src/invariants.test.ts (новый)
- packages/exam-core/src/cases/review.cases.ts (новый)
- packages/exam-core/src/cases/scoring.cases.ts
- packages/exam-core/src/index.ts
- scripts/check-exam-core-dist.mjs

(`packages/exam-core/` и `scripts/check-exam-core-dist.mjs` целиком ещё не отслеживаются git, они появились в планах 03-01…03-13.)

## Self-Check: PASSED

Все созданные файлы на месте; артефакты плана содержат `export function computeVerdicts`, `allPartsCorrect`, `1243`, `_SCORING_CASES`, `countMistakes(`. Коммитов нет по правилу пользователя (HEAD 7a6f95a не менялся).

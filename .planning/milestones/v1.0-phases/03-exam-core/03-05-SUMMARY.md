---
phase: 03-exam-core
plan: 05
subsystem: exam-core-scoring
tags: [exam-core, adapters, scoring, parity, hamming_digits, EXAM-02, EXAM-03, EXAM-06, D-03, D-05, D-15]
requires: [03-03, 03-12]
provides:
  - "registry.ts: реестр шаблонов, метрик, правил и BUILTIN_QUESTION_TYPES дословно по серверному question-types.ts, плюс templateForMetric и QuestionTypeValidation"
  - "normalize.ts: пять функций нормализации серверного scoring.ts"
  - "adapters/: TemplateAdapter (template, metrics, answerSchema, normalizeAnswer, countMistakes), пять адаптеров, TEMPLATE_ADAPTERS, getTemplateAdapter"
  - "scoring.ts: MISTAKES_UNSCORABLE, countMistakes, scoreByRule, normalizeScoringRule, scoreQuestionByType"
  - "Паритет последовательностей со старой серверной оценкой: 17448 входов x 7 конфигов типа x 3 fallbackMaxPoints = 366408 комбинаций"
affects: [03-06, 03-07, 03-08, 03-09, 03-13]
tech-stack:
  added: []
  patterns:
    - "Адаптер шаблона типизирован TemplateAdapter<TAnswer>: countMistakes нормализует ответ студента через normalizeAnswer своего адаптера и получает точный тип"
    - "Тест паритета: isDeepStrictEqual в цикле, assert.deepEqual с описанием конфига и входа только при расхождении"
key-files:
  created:
    - packages/exam-core/src/registry.ts
    - packages/exam-core/src/normalize.ts
    - packages/exam-core/src/scoring.ts
    - packages/exam-core/src/scoring.test.ts
    - packages/exam-core/src/adapters/types.ts
    - packages/exam-core/src/adapters/index.ts
    - packages/exam-core/src/adapters/single-choice.ts
    - packages/exam-core/src/adapters/multi-choice.ts
    - packages/exam-core/src/adapters/matching.ts
    - packages/exam-core/src/adapters/short-text.ts
    - packages/exam-core/src/adapters/sequence-digits.ts
    - app/server/src/lib/tests/scoring-parity.test.ts
  modified:
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
decisions:
  - "MISTAKES_UNSCORABLE объявлен в adapters/types.ts и реэкспортирован из scoring.ts: адаптеры возвращают его, а scoring.ts импортирует TEMPLATE_ADAPTERS, так цикла импортов нет"
  - "TemplateAdapter обобщён параметром TAnswer extends AnswerValue (по умолчанию AnswerValue): адаптер последовательности получает string | null из своего normalizeAnswer без приведения типов; TEMPLATE_ADAPTERS остаётся Record<QuestionUiTemplate, TemplateAdapter>"
metrics:
  duration: "~25 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 7600
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 05: реестр, адаптеры шаблонов и оценка в exam-core, паритет последовательностей Summary

Реестр типов, нормализация, пять адаптеров шаблонов (форма ответа, нормализация, число ошибок) и `scoreQuestionByType` перенесены в `@bio-exam/exam-core` дословно; строка D2 (ключ `1243`, ответ `1234` → 1 ошибка, 1 балл из 2) открывает таблицу пакета, паритет с серверной оценкой на 366408 комбинациях зелёный.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило, а не потерю работы.

## Выполнено

**Task 1 (tracer): реестр, нормализация, адаптеры, оценка, D2, паритет.**

- `registry.ts`: копия серверного `question-types.ts`, единственное переименование `BuiltinQuestionTypeSeed` → `export type BuiltinQuestionType` (и тип возврата `getBuiltinQuestionTypeByKey`). Добавлены `QuestionTypeValidation` и `templateForMetric` через заранее построенную карту `Record<MistakeMetric, QuestionUiTemplate>` из `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE`. `diff` с серверным файлом показывает только эти строки.
- `normalize.ts`: пять функций из серверного `scoring.ts:72-118` с `export`, комментарий в `normalizeDigitsSequence` убран.
- `adapters/types.ts`: `TemplateAdapter<TAnswer>` с `template`, `metrics`, `answerSchema: z.ZodType<TAnswer>`, `normalizeAnswer(answer): TAnswer | null`, `countMistakes(metric, userAnswer, correctAnswer): number`.
- Пять адаптеров: `answerSchema` — `z.string()` (`single_choice`, `short_text`, `sequence_digits`), `z.array(z.string())` (`multi_choice`), `z.record(z.string(), z.string())` (`matching`); `normalizeAnswer` — `normalizeIdValue`, `normalizeIdArray`, `normalizeIdRecord`, `normalizeCompactString`, `normalizeDigitsSequence`. `countMistakes` — серверные счётчики дословно; ответ студента нормализуется через `<adapter>.normalizeAnswer`, ключ — прямым вызовом той же функции, как на сервере. `short_text` ветвится по метрике (`compact_text_in_set` → варианты, иначе точное совпадение). `single_choice` для неразбираемого ответа возвращает 1, как сервер.
- `adapters/index.ts`: `TEMPLATE_ADAPTERS: Record<QuestionUiTemplate, TemplateAdapter>`, `getTemplateAdapter`.
- `scoring.ts`: `countMistakes` диспетчеризует `TEMPLATE_ADAPTERS[templateForMetric(metric)]`; `scoreByRule`, `normalizeScoringRule` (серверный `normalizeRule`), `scoreQuestionByType`, `clampPoints` дословно; ветка «типа нет в карте» возвращает `MISTAKES_UNSCORABLE`.
- `index.ts`: все новые runtime-экспорты и типы (`export type`). Серверный legacy `TestScoringRules` (`scoring.ts:12-70`) не переносился (D-19).
- `scoring.test.ts`: строки D2 (`1243`/`1234` → `{ maxPoints: 2, earnedPoints: 1, isCorrect: false, mistakesCount: 1 }`; `1243`/`1243` → 0 ошибок, 2 балла), строка «тип не найден» и шесть строк диспетчеризации `countMistakes` по метрикам. Таблицы всех шаблонов — 03-13.
- `app/server/src/lib/tests/scoring-parity.test.ts`: старая `scoreQuestionByType` из `./scoring.js` против пакетной; встроенный `sequence` берётся из серверного `BUILTIN_QUESTION_TYPES`; `TYPE_CONFIGS` на верхнем уровне из семи записей (`builtin`, `tiers_unsorted_fractional`, `one_mistake_clamped`, `one_mistake_fractional`, `rule_empty`, `foreign_hamming`, `foreign_set_distance`), `fallbackMaxPoints` 0, 3, `NaN`. Входы: для n = 2…5 все перестановки × все перестановки (15016 пар), на каждый ключ ответы длиной n−1 (два варианта) и n+1 (два варианта), числовой ответ, числовой ключ, оба числовые, числовой ответ-перестановка, `null`, `''`, `'  '`, `'12a'` и как ответ, и как ключ. Таймаут 120 с, три итоговых утверждения.

Tracer-гейт: после Task 1 обе команды `<verify>` перезапущены целиком, зелёные; дальше Task 2.

**Task 2: dist и гейт.** `EXPECTED_EXPORTS` в `scripts/check-exam-core-dist.mjs` сгенерирован из собранного `dist/index.cjs` и отсортирован: 42 имени. Проверка формы ответа по `dist` и `yarn verify` зелёные.

## Числа паритета

Вывод теста: `паритет: входов 17448, конфигов 7, комбинаций 366408`. Пороги плана: входов > 15000, конфигов = 7, комбинаций > 315000. Прогон около 0,8 с.

## Пробы чувствительности (откатаны)

Перед пробами `sequence-digits.ts` и `scoring.ts` скопированы в scratchpad; после каждой пробы файл возвращён `cp`, совпадение подтверждено `cmp`, пакет пересобран, паритет и `scoring.test.ts` снова зелёные (30 passed).

| Проба | Изменение | Результат |
|-------|-----------|-----------|
| 1 | `sequence-digits.ts`: `if (isSingleAdjacentSwap) return 1` → `return mistakes` | красный: `builtin, fallbackMaxPoints 0, ответ "1243", ключ "1234"` |
| 2 | `scoreByRule`: убрана сортировка `tiers` по `maxMistakes` | красный: `tiers_unsorted_fractional, fallbackMaxPoints 0, ответ "1", ключ "12"` |
| 3 | `scoreByRule`: `one_mistake_partial` без `clampPoints` | красный: `one_mistake_clamped, fallbackMaxPoints 0, ответ "1", ключ "12"` |

## Проверки

- `yarn workspace @bio-exam/exam-core test`: 5 файлов, 74 passed.
- `yarn workspace @bio-exam/exam-core build && yarn workspace @bio-exam/server vitest run src/lib/tests/scoring-parity.test.ts src/lib/tests/scoring.test.ts`: 2 файла, 30 passed.
- Проверка формы ответа по `dist`: `answer shape members ok`, код 0.
- `node scripts/check-exam-core-dist.mjs`: `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 42 экспортов в ESM и CJS`.
- `yarn verify`: `yarn verify: OK` (exam-core 74 passed; server 248 passed и 6 expected fail; web 170 passed и 2 expected fail; rbac 2 passed).
- `tsc --noEmit` и `oxlint` пакета: код 0.
- `git diff --quiet HEAD -- app/server/src/lib/tests/scoring.ts app/server/src/lib/tests/scoring.test.ts app/server/src/lib/tests/question-types.ts`: код 0.
- `git status --porcelain --untracked-files=all -- app/server/src/lib/tests`: три удаления 03-12 (`submit-result.ts`, `telemetry.test.ts`, `telemetry.ts`) и `?? scoring-parity.test.ts`, больше ничего.
- Комментариев в новых файлах нет (`grep` по `//` и `/*` пуст).

## Deviations from Plan

**1. [Решение исполнителя (автономно)] Где объявлен `MISTAKES_UNSCORABLE`**
- План называет `scoring.ts`. Адаптеры возвращают эту константу, а `scoring.ts` импортирует `TEMPLATE_ADAPTERS`; объявление в `scoring.ts` дало бы цикл `scoring.ts` ↔ `adapters/*`. Константа объявлена в `adapters/types.ts`, `scoring.ts` её реэкспортирует, `index.ts` экспортирует из `./scoring`. Публичный экспорт пакета тот же.

**2. [Решение исполнителя (автономно)] `TemplateAdapter` обобщён**
- `TemplateAdapter<TAnswer extends AnswerValue = AnswerValue>`: так `countMistakes` вызывает `normalizeAnswer` своего адаптера и получает точный тип (`string`, `string[]`, `Record<string, string>`) без приведений. Поля интерфейса те, что в плане.

**3. [Дополнение] Сверх плана экспортированы** константы пяти адаптеров (они перечислены в артефактах плана) и тип `ScoreQuestionByTypeInput`; в `scoring.test.ts` кроме D2 добавлены строка «тип не найден» и строки диспетчеризации `countMistakes` по шести метрикам. Паритет печатает свои числа одной строкой `console.log`.

D5 в этой волне: адаптер `short_text` только ветвится по метрике при подсчёте ошибок, как сервер; проверка ключа редактора — 03-07/03-11.

## Known Stubs

Нет.

## Threat Flags

Нет: новой поверхности (маршрутов, доступа к файлам, схемы) план не добавляет. T-3-09, T-3-10, T-3-26 закрыты паритетом и пробами выше.

## Deferred human verification

Нет.

## Файлы к коммиту

- `packages/exam-core/src/registry.ts`
- `packages/exam-core/src/normalize.ts`
- `packages/exam-core/src/scoring.ts`
- `packages/exam-core/src/scoring.test.ts`
- `packages/exam-core/src/adapters/types.ts`
- `packages/exam-core/src/adapters/index.ts`
- `packages/exam-core/src/adapters/single-choice.ts`
- `packages/exam-core/src/adapters/multi-choice.ts`
- `packages/exam-core/src/adapters/matching.ts`
- `packages/exam-core/src/adapters/short-text.ts`
- `packages/exam-core/src/adapters/sequence-digits.ts`
- `packages/exam-core/src/index.ts`
- `scripts/check-exam-core-dist.mjs`
- `app/server/src/lib/tests/scoring-parity.test.ts`

## Self-Check: PASSED

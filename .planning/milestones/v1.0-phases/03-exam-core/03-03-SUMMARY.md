---
phase: 03-exam-core
plan: 03
subsystem: exam-core-package
tags: [workspace-package, tsdown, zod, telemetry, attempt-result, question-content, EXAM-01, EXAM-05, D-03]
requires: [03-01]
provides:
  - "@bio-exam/exam-core: пакет на сборке rbac (tsdown, ESM+CJS+d.ts), единственная зависимость zod ^3.24.3"
  - "mergeTelemetryMaps, QuestionTelemetrySchema, TelemetryMapSchema и типы QuestionTelemetry, TelemetryMap"
  - "AnswerValueSchema, SubmitResultItemSchema, SubmitResultSchema и типы AnswerValue, SubmitResultItem, SubmitResult"
  - "QuestionIdValueSchema, OptionSchema, MatchingPairsSchema, QuestionKeyPayloadSchema и типы QuestionOption, QuestionMatchingPairs, QuestionKeyPayload"
  - "scripts/check-exam-core-dist.mjs: проверка dist (EXPECTED_EXPORTS, 10 имён; zod не встроен)"
affects: [03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10, 03-11, 03-12, 03-13]
tech-stack:
  added: ["workspace @bio-exam/exam-core (зависимость только zod, уже в lockfile)"]
  patterns: ["пакет по образцу @bio-exam/rbac", "boundaries.test.ts: текстовый разбор import/from/require в src"]
key-files:
  created:
    - packages/exam-core/package.json
    - packages/exam-core/tsconfig.json
    - packages/exam-core/tsdown.config.ts
    - packages/exam-core/vitest.config.ts
    - packages/exam-core/src/index.ts
    - packages/exam-core/src/telemetry.ts
    - packages/exam-core/src/telemetry.test.ts
    - packages/exam-core/src/attempt-result.ts
    - packages/exam-core/src/attempt-result.test.ts
    - packages/exam-core/src/content.ts
    - packages/exam-core/src/content.test.ts
    - packages/exam-core/src/boundaries.test.ts
    - scripts/check-exam-core-dist.mjs
  modified:
    - yarn.lock
decisions:
  - "Типы QuestionTelemetry и TelemetryMap объявлены явно (как в db/schema.ts), а не выведены из zod: форма записи одна и та же, серверный тип остаётся источником до 03-12"
  - "boundaries.test.ts ловит и побочные импорты import 'x', и require('x'), и import('x') помимо from 'x': первая версия по плану (только from и import()) пропускала import 'react'"
  - "Таблицы тестов написаны циклами for над строками, а не test.each: результат эквивалентен, названия остаются русскими"
metrics:
  commits: 0
  plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
  plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 26000
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 03: пакет @bio-exam/exam-core Summary

Создан пакет `@bio-exam/exam-core` на сборке rbac; в него дословно перенесены слияние и схемы телеметрии, схема значения ответа, схема результата попытки и схемы содержимого вопроса. Приложения, прод-сборка и CI не тронуты: пакет пока никто не импортирует, серверные копии остаются на месте до 03-12 и 03-09.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. Поля `commits: 0` и `plan_head_*` во frontmatter отражают это: изменения в коде есть, но не закоммичены намеренно.

## Выполнено

**Task 1 (tracer): каркас, mergeTelemetryMaps, проверка dist.** Каркас скопирован с rbac (`package.json` с картой exports и теми же scripts и devDependencies плюс `dependencies: { zod: "^3.24.3" }`, `tsconfig.json`, `vitest.config.ts`, `tsdown.config.ts` без комментариев). `telemetry.ts` содержит `QuestionTelemetrySchema`, `TelemetryMapSchema`, типы и `mergeTelemetryMaps` с телом серверной копии без изменений. Тест `telemetry.test.ts`: строка серверного и web-тестов, edge-строки EXAM-05 (empty: без аргументов, `(null, undefined)`; adjacency: максимум по каждому полю независимо, равные записи, непересекающиеся вопросы; ordering: `merge(a, b)` равно `merge(b, a)` для каждой строки), отсутствие мутации входов, строки `TelemetryMapSchema` (не-uuid ключ, отрицательное, дробное, нет поля, строка вместо числа). Последовательность RED, затем GREEN выдержана: сначала `yarn install` и красный прогон («Cannot find module»), затем `telemetry.ts`.

**Task 2 (TDD): схемы результата и содержимого, граница пакета.** Сначала тесты `attempt-result.test.ts`, `content.test.ts`, `boundaries.test.ts`; красный прогон: `Cannot find module './attempt-result'` и `'./content'` (2 файла красные, 28 тестов прежних зелёные). Затем `attempt-result.ts` (`SubmitAnswerValueSchema` из `public.ts` как `AnswerValueSchema`; `SubmitResultItemSchema` и `SubmitResultSchema` дословно из `submit-result.ts`) и `content.ts` (`IdSchema` как `QuestionIdValueSchema`, `OptionSchema`, `MatchingPairsSchema`, `CorrectAnswerSchema` как `QuestionKeyPayloadSchema` дословно из `schemas/tests.ts`). `index.ts` реэкспортирует всё из одной точки, типы через `export type`. `EXPECTED_EXPORTS` в скрипте дополнен до 10 имён, отсортирован.

Серверная проверка D-03/приведения: `QuestionKeyPayloadSchema` 3 → '3', [1, '2'] → ['1', '2'], { a: 1 } → { a: '1' }, null и true отклоняются; `OptionSchema` { id: 1, text: 'x' } → { id: '1', text: 'x' }; `MatchingPairsSchema` приводит id обеих колонок.

## Проверки

**check-exam-core-dist** (после финальной сборки):

```
exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 10 экспортов в ESM и CJS
```

После Task 1 то же с «3 экспортов». Скрипт также проверяет, что `dist/index.js` импортирует `from "zod"`, а `dist/index.cjs` содержит `require("zod")` (zod не встроен).

**Проба boundaries.** Временный файл `src/probe-react.ts` с `import React from 'react'` делает красными два теста `boundaries.test.ts` (сообщение `probe-react.ts: react`); то же для `import('lexical')` и `import 'react'`. Первая проба с `import 'react'` на версии теста по плану (только `from` и `import()`) красной не стала: регэксп не покрывал побочный импорт, тест дополнен (`^\s*import 'x'` и `require('x')`) и проба повторена. Файл пробы удалён, `src` содержит только файлы плана, тесты 65 passed.

**Одна версия zod:**

```
single zod 3.25.76
```

**Дельта yarn.lock** (сравнение снимка до `yarn install` с файлом после; в рабочем дереве `yarn.lock` уже содержал правки фазы 2, их дельта не относится к плану): добавлена ровно одна запись воркспейса:

```
"@bio-exam/exam-core@workspace:packages/exam-core":
  version: 0.0.0-use.local
  resolution: "@bio-exam/exam-core@workspace:packages/exam-core"
  dependencies: oxlint 1.86.0, rimraf ^5.0.5, tsdown 0.23.0, typescript ^5.6.3, vite 8.3.2, vitest 5.0.3, zod ^3.24.3
  languageName: unknown
  linkType: soft
```

Новых внешних пакетов нет, версия zod не менялась (блок `"zod@npm:^3.24.3"` один, 3.25.76).

**Тесты и гейты:**
- `yarn workspace @bio-exam/exam-core test`: 4 файла, 65 tests passed.
- `yarn workspace @bio-exam/exam-core build`, затем `node scripts/check-exam-core-dist.mjs`: OK.
- `yarn workspace @bio-exam/exam-core typecheck` и `lint`: без ошибок и предупреждений (lint: 0 warnings, 0 errors).
- `yarn verify`: `yarn verify: OK`, все шаги passed; в выводе turbo есть `@bio-exam/exam-core:test`, `:typecheck` и `:lint`.
- Guard `git diff --quiet HEAD -- app/server/src/lib/tests app/server/src/routes/tests/public.ts app/server/src/schemas/tests.ts app/server/vercel-build.cjs app/web/vercel.json scripts/e2e.mjs .github/workflows/ci.yml scripts/check-ci-workflow.mjs`: код 0, серверные копии, сборка и CI не тронуты.
- `git status --porcelain --untracked-files=all -- packages/exam-core scripts/check-exam-core-dist.mjs`: только файлы плана (`dist` игнорируется `.gitignore`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Тест границ пропускал побочный импорт**
- **Found during:** Task 2, проба границы пакета
- **Issue:** извлечение спецификаторов по плану (`from '…'` и `import('…')`) не видело `import 'react'` без `from`, проба осталась зелёной.
- **Fix:** добавлены разбор `^\s*import '…'` и `require('…')`; проба повторена на трёх формах импорта, все красные.
- **Files modified:** `packages/exam-core/src/boundaries.test.ts`

**2. [Решение исполнителя (автономно)] Корневая защита**
- Запуск `root-pin.sh` отклонён классификатором прав (auto mode), повторно не запускался. Все записи выполнялись по абсолютным путям внутри `/Users/kdvornichenko/bio-exam`, `git rev-parse --show-toplevel` подтвердил корень; cwd не менялся между проверками.

Остальное: план выполнен как написан (таблицы тестов реализованы циклами, а не `test.each`; названия остаются русскими).

## Authentication Gates

Нет.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности: пакет не слушает сеть, не читает файлы вне тестов, не импортируется приложениями.

## Deferred human verification

Нет: в плане нет блокирующих человеческих шагов.

## Файлы к коммиту

- `packages/exam-core/package.json`
- `packages/exam-core/tsconfig.json`
- `packages/exam-core/tsdown.config.ts`
- `packages/exam-core/vitest.config.ts`
- `packages/exam-core/src/index.ts`
- `packages/exam-core/src/telemetry.ts`, `telemetry.test.ts`
- `packages/exam-core/src/attempt-result.ts`, `attempt-result.test.ts`
- `packages/exam-core/src/content.ts`, `content.test.ts`
- `packages/exam-core/src/boundaries.test.ts`
- `scripts/check-exam-core-dist.mjs`
- `yarn.lock`: только запись воркспейса `@bio-exam/exam-core` относится к плану; остальные правки файла принадлежат фазе 2

Метаданные планирования (`.planning/phases/03-exam-core/03-03-SUMMARY.md`, `STATE.md`, `ROADMAP.md`) — отдельно.

## Self-Check: PASSED

Файлы пакета и скрипт существуют (`git status` показывает все 13); `yarn verify: OK`; коммиты не создавались намеренно (правило пользователя).

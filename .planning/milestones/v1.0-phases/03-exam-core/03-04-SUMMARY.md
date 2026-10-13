---
phase: 03-exam-core
plan: 04
subsystem: exam-core-web-wiring
tags: [workspace-package, telemetry, attempt-result, docs, EXAM-05, EXAM-01, D-02, D-04]
requires: [03-03, 03-12]
provides:
  - "app/web зависит от @bio-exam/exam-core (workspace:*)"
  - "web берёт mergeTelemetryMaps и типы телеметрии из пакета; копии и ручные пометки синхронизации удалены"
  - "schema.ts берёт TelemetryMap из пакета через import type"
  - "AGENTS.md и README.md называют packages/exam-core"
affects: [03-05, 03-09, 03-13]
tech-stack:
  added: []
  patterns: ["реэкспорт из пакета в локальных модулях web, чтобы импорты в TestRunner не менялись"]
key-files:
  created: []
  modified:
    - app/web/package.json
    - yarn.lock
    - app/web/components/tests/telemetry.ts
    - app/web/components/tests/telemetry.test.ts
    - app/web/lib/tests/types.ts
    - app/server/src/db/schema.ts
    - AGENTS.md
    - README.md
decisions:
  - "Зависимость @bio-exam/rbac в app/web/package.json оставлена как есть (\"*\"), exam-core подключён как workspace:*"
metrics:
  duration: "~15 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 6000
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: false
---

# Phase 3 Plan 04: web и schema.ts на @bio-exam/exam-core, документация пакета Summary

Web импортирует слияние телеметрии и типы результата попытки из `@bio-exam/exam-core`, ручные копии и пометки «Keep in sync manually» удалены, `schema.ts` берёт `TelemetryMap` через `import type`, `AGENTS.md` и `README.md` называют `packages/exam-core`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило, а не потерю работы.

## Выполнено

**Task 1 (tracer): web на пакете, прод-сборка web.**
- `app/web/package.json`: `"@bio-exam/exam-core": "workspace:*"` перед `@bio-exam/rbac`, `yarn install`. Дельта `yarn.lock` по этому плану: у `@bio-exam/web@workspace:app/web` добавлена строка `"@bio-exam/exam-core": "workspace:*"`; новых внешних пакетов нет.
- `app/web/components/tests/telemetry.ts`: удалены локальные типы и `mergeTelemetryMaps`; добавлены `import type { QuestionTelemetry, TelemetryMap }`, `export { mergeTelemetryMaps }` и `export type { QuestionTelemetry, TelemetryMap }` из пакета. Редьюсеры не менялись.
- `app/web/components/tests/telemetry.test.ts`: удалён тест слияния (он в `packages/exam-core/src/telemetry.test.ts`), остались 4 теста редьюсеров.
- `app/web/lib/tests/types.ts`: `export type { AnswerValue as TestAnswerValue, QuestionTelemetry, SubmitResult, SubmitResultItem } from '@bio-exam/exam-core'` плюс отдельный `import type { AnswerValue as TestAnswerValue, QuestionTelemetry }` для локального использования в `SessionInfo` и `AttemptReviewData`. Удалены ручные копии `SubmitResultItem`, `SubmitResult`, `QuestionTelemetry`, `TestAnswerValue` и оба комментария о ручной синхронизации. Это закрывает хвост 03-12 про ссылки на удалённый `submit-result.ts`. `QuestionUiTemplate` не тронут (03-11).
- Проблем с необязательными `userAnswer`/`correctAnswer` из `z.unknown()` не возникло: `yarn workspace @bio-exam/web typecheck` зелёный без правок использования.

**Task 2: `schema.ts` и документация.**
- `schema.ts`: удалены локальные `QuestionTelemetry` и `TelemetryMap`, добавлен `import type { TelemetryMap } from '@bio-exam/exam-core'` отдельной группой перед `drizzle-orm` (как в остальных файлах сервера). Только `import type`.
- `AGENTS.md`: в строку Exam domain колонки Where добавлен `packages/exam-core`. Расширение колонки сдвинуло выравнивание остальных строк таблицы, это вынужденное форматирование таблицы внутри той же правки.
- `README.md`: описание, шаг 6 `lint-typecheck-test`, раздел `yarn e2e`, структура репозитория. Новых команд `yarn …` нет.

## codegraph impact TelemetryMap

Два определения: web-локальное `TelemetryMap` в `app/web/lib/tests/api.ts:108` (не в области плана, остаётся как есть, строится из `QuestionTelemetry` пакета) и серверное в `app/server/src/db/schema.ts`. Среди затронутых серверных файлов импортёров типа из `schema.ts`: `app/server/src/db/answer-keys-jsonb.test.ts`, `app/server/src/db/index.ts` (оба файла ссылаются на `schema.ts` целиком, а не на сам тип); `public.ts` типа не импортирует (только `mergeTelemetryMaps` и `TelemetryMapSchema` из пакета). `grep` по `app/server/src` подтверждает: `TelemetryMap`/`QuestionTelemetry` встречаются только в `schema.ts` и `public.ts` (последний — только имена `mergeTelemetryMaps`, `TelemetryMapSchema`).

## Проверки

- `yarn workspace @bio-exam/exam-core build`, `yarn workspace @bio-exam/web typecheck`: зелёные.
- `yarn workspace @bio-exam/web vitest run components/tests/telemetry.test.ts`: 4 passed.
- Прод-сборка web по `buildCommand` из `app/web/vercel.json` с плейсхолдерами env: exit 0, нет «Failed to compile» / «Invalid server env».
- Acceptance-проверки `node -e` (нет `export function mergeTelemetryMaps`, нет «Keep in sync manually», локальные имена объявлены, в `schema.ts` нет локальных типов и runtime-импорта пакета): все с кодом 0.
- `node scripts/check-docs-commands.mjs`: OK; `scripts/check-docs-structure.test.mjs` входит в шаг `script-tests` `yarn verify`: passed.
- `yarn verify`: `yarn verify: OK` (шаги lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests passed).
- `git status --porcelain` по `app/web/components/tests` и `app/web/lib/tests`: `telemetry.ts`, `telemetry.test.ts`, `types.ts` и остаток фазы 2 `MdxRenderer.tsx`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None.

## Файлы к коммиту

- `app/web/package.json`
- `yarn.lock` (общий файл с незакоммиченными правками фазы 2; дельта этого плана — одна строка зависимости web)
- `app/web/components/tests/telemetry.ts`
- `app/web/components/tests/telemetry.test.ts`
- `app/web/lib/tests/types.ts`
- `app/server/src/db/schema.ts`
- `AGENTS.md`
- `README.md`

Форматирование `oxfmt` затронуло только строки правок и выравнивание таблицы Routing в `AGENTS.md`; отдельного коммита форматирования не требуется.

## Self-Check: PASSED

Все перечисленные файлы существуют и изменены в рабочем дереве, `yarn verify: OK`.

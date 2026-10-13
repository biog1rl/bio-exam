---
phase: 09-result-foundation-and-readers
plan: 08
subsystem: admin-question-types
tags: [open-question, question-types, admin, authorization, exam-core]
requires: ["09-03", "09-05"]
provides:
  - "Серверные запреты open: включение, правка правила, кастомный тип с шаблоном open, правило для теста"
  - "admin-open-type.test.ts"
  - "Админка без open на «Правилах баллов», выключенный переключатель и строка о баллах в карточке open, выбор шаблона по AUTO_SCORED_TEMPLATES"
affects: [09-07, phase-17]
tech-stack:
  added: []
  patterns: ["запрет по шаблону через isAutoScoredTemplate, без сравнения метрики со строкой", "правило открытого типа сверяется с getBuiltinQuestionTypeByKey('open').scoringRule через isDeepStrictEqual"]
key-files:
  created:
    - app/server/src/routes/tests/admin-open-type.test.ts
  modified:
    - app/server/src/routes/tests/admin/question-types.ts
    - app/server/src/routes/tests/admin/shared.ts
    - app/web/app/(internal)/(protected)/admin/tests/scoring/ScoringSettingsPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/question-types/QuestionTypesPageClient.tsx
    - app/web/app/(internal)/(protected)/admin/tests/question-types/[key]/QuestionTypeDetailsPageClient.tsx
decisions:
  - "Тексты отказов лежат константами в question-types.ts (три строки) и строкой в shared.ts: общего словаря сообщений админских маршрутов нет"
  - "У системного open выбор шаблона disabled и содержит единственный пункт open, чтобы отображалось текущее значение"
  - "Правило open сравнивается после разбора обеих сторон схемой QuestionTypeScoringRuleSchema, поэтому сохранение с неизменёнными значениями проходит"
metrics:
  tasks: 3
  completed: 2026-10-06
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 0
plan_head_before: 5ba9ccf
---

# Phase 9 Plan 08: Тип open в админских настройках Summary

Открытый тип нельзя включить, переписать его максимум 3, создать кастомный тип с шаблоном open или задать правило для теста ни через интерфейс, ни прямым запросом; «Правила баллов» open не показывают и не отправляют. `yarn verify: OK`.

## Что сделано

- Task 1 (tracer): PATCH `/api/tests/question-types/:key` для типа с шаблоном `open` отвечает 400 на `isActive: true` и на `scoringRule`, отличное от правила встроенного типа; в карточке типа переключатель «Тип доступен» `disabled` с подписью «Открытые вопросы пока недоступны.», вместо редактора формулы строка «Баллы за открытый вопрос выставляет учитель: от 0 до 3.».
- Task 2: `validateScoringRuleTemplateCompatibility` отклоняет любое правило для шаблона `open`; POST и PATCH кастомного типа с шаблоном `open` дают 400 «Открытый тип вопроса создаётся системой».
- Task 3: `ScoringSettingsPageClient` оставляет в `loadRules` только типы с `isAutoScoredTemplate(type.uiTemplate)` до `setTypes` и до заполнения `initialOverrides`; `QuestionTypesPageClient` и карточка типа перебирают `AUTO_SCORED_TEMPLATES`.

## codegraph impact (до правок)

- `validateScoringRuleTemplateCompatibility`: `PUT /question-types/tests/:id/overrides/:key` в `question-types.ts` (единственный потребитель).
- `saveGlobalScoringRules`: `admin-api.ts`, `admin-api.test.ts`, `ScoringSettingsPageClient` (`handleSave`), `scoring/page.tsx`.
- `testOverrideSteps`: `admin-api.ts` (`saveTestScoringRules`), `admin-api.test.ts`, `ScoringSettingsPageClient` (`handleSave`).

## codegraph affected

По `question-types.ts`, `shared.ts`, `QuestionTypesPageClient.tsx`, `ScoringSettingsPageClient.tsx` вернул только сами файлы (4); набор покрыт `admin-open-type.test.ts`, `teacher-zone-tests.matrix.test.ts`, e2e страницы баллов и `yarn verify`.

## Запрос -> статус

| Запрос | Статус |
| --- | --- |
| GET `/question-types/open` | 200, `isActive: false` |
| PATCH `open` `{ isActive: true }` | 400 «Открытые вопросы пока недоступны», тип в базе выключен |
| PATCH `open` со всеми текущими значениями | 200 |
| PATCH `open` с `correctPoints: 5` / метрикой `boolean_correct` / формулой `one_mistake_partial` | 400 «Баллы за открытый вопрос выставляет учитель: от 0 до 3», правило в базе прежнее |
| POST кастомного типа с `uiTemplate: 'open'` | 400 «Открытый тип вопроса создаётся системой», строки нет |
| PATCH кастомного типа `{ uiTemplate: 'open' }` | 400 тем же текстом, шаблон не изменился |
| PUT `overrides/:key` для `short_text`-типа с метрикой `manual` | 400 |
| PUT `overrides/open` с `scoringRuleOverride` (любым) | 400 |
| PUT `overrides/open` с `titleOverride` и `isDisabled: true` | 200 |
| POST `/:testId/questions` с `type: 'open'` при выключенном типе | 400 «Тип вопроса отключён: Открытый вопрос» |

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/admin-open-type.test.ts src/routes/tests/teacher-zone-tests.matrix.test.ts` — 157 passed (из них 11 новых).
- `yarn workspace @bio-exam/web typecheck` — OK; `yarn workspace @bio-exam/web lint` — exit 0 (предупреждения прежние, в том числе `set-state-in-effect` на существующих строках этих страниц).
- `node --test scripts/exam-core-no-private-copies.test.mjs` — pass 5, fail 0.
- `yarn e2e tests/scoring.spec.ts` — 10 passed (setup и оба проекта, chromium-desktop и chromium-mobile).
- `yarn verify` — `yarn verify: OK`.
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-08` — `09-08 changed only its files`.

## Deviations from Plan

None - plan executed exactly as written. Мелкие решения исполнителя: у системного open выбор шаблона показывает единственный пункт open (иначе `SelectValue` пустой); комментариев в коде нет.

## Known Stubs

None.

## Threat Flags

None. T-09-25, T-09-26, T-09-27 закрыты серверными проверками и тестами выше.

## Self-Check: PASSED

Созданный `app/server/src/routes/tests/admin-open-type.test.ts` на месте; изменённые файлы совпадают с `files_modified`; коммитов нет по правилу пользователя (изменения в рабочем дереве).

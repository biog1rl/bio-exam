---
phase: 09-result-foundation-and-readers
plan: 19
subsystem: docs
tags: [docs, skills, readme, phase-gate, RES-05, OPEN-02, PLAT-05]
requires: ["09-18"]
provides:
  - "Навыки bio-exam-data, bio-exam-api, bio-exam-web и README сервера описывают фазу 9: миграция 0026, проекция результата, единственный писатель, читатели, ANSWERS_INVALID, шесть шаблонов"
  - "Ворота фазы зелёные: check-exam-core-dist, yarn verify: OK, полный yarn e2e без failed и flaky"
affects: [phase-10, phase-17]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .agents/skills/bio-exam-data/SKILL.md
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-web/SKILL.md
    - app/server/README.md
decisions:
  - "Номер фазы 17 в навыке bio-exam-api указан, как требуют must_haves и шаг 2 плана, хотя общее правило плана просит обходиться без номеров будущих фаз"
metrics:
  tasks: 2
  completed: 2026-10-06
status: complete
actuals:
  tokens: 2500
  tasks: 2
  commits: 0
---

# Phase 9 Plan 19: Документы и ворота фазы Summary

Навыки и README сервера описывают результат попытки, проекцию, читателей, отказ `ANSWERS_INVALID`, запреты типа `open` и фильтр `review` как есть; полный `yarn verify` и полный `yarn e2e` зелёные. Изменения в рабочем дереве, не закоммичены (правило пользователя: коммитит ведущая сессия).

## Что сделано

- **Task 1 (tracer):**
  - `bio-exam-data`: последняя миграция `0026_attempt_result_projection.sql`; новый раздел «Результат попытки»: факты сдачи неизменны (триггер `test_attempts_facts_immutable`, `23001`), проекция `review_status`, `final_*`, `graded_at`, `passing_score`, `auto_total_points`, `submit_source` с четырьмя CHECK, `real` и `Math.fround`, прямые вставки попыток в тестах только через `insertAttemptFixture`.
  - `bio-exam-api`: раздел «Попытка теста»: `computeAttemptOutcome`/`projectionOf` в `exam-core`, единственный писатель `materializeAttemptOutcome`, сверка `reconcileOutcomes`, читатели через `attemptResultColumns`/`attemptResultSql`, явный `review_status <> 'pending'` в агрегатах, `ANSWERS_INVALID` (422 на сдаче, 400 на черновике, причины), `studentQuestionView`, шесть шаблонов, запреты `open` в `admin/question-types.ts` и `admin/shared.ts` со снятием в фазе 17.
  - `bio-exam-web`: раздел «Результат попытки»: `attemptResultView` в `app/web/lib/tests/attempt-result-view.ts`, метки из `app/web/components/tests/attempt-result/`, `number | null` без запасного нуля, фильтр `review` в `attempts-url.ts`.
  - `app/server/README.md`: «одним из шести шаблонов», строка `open`; пять прежних шаблонов остались.
  - `yarn exec oxfmt` по четырём файлам.
- **Task 2:** ворота фазы (ниже). Навык `bio-exam-api` после прогонов не расходится с фактами (коды 422/400 совпадают с 09-07), в этой задаче не менялся.

## Проверки

- `node --test scripts/check-docs-structure.test.mjs`: 11 pass, 0 fail. `node scripts/check-docs-commands.mjs`: OK. `jobs:run` в четырёх файлах: 0.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs`: `exam-core dist OK`, 82 экспорта в ESM и CJS.
- `yarn verify`: восемь шагов passed (`lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`), `yarn verify: OK`. Повтор из-за 57P01 не понадобился.
- Полный `yarn e2e`: 292 passed (4.0 мин), проекты `chromium-desktop` и `chromium-mobile`, без failed и flaky.
- `yarn format:check`: чисто.
- `node .planning/phases/09-result-foundation-and-readers/09-plan-files.cjs check 09-19`: `09-19 changed only its files`.

## codegraph affected по фазе

Вход: 112 файлов фазы (`git diff --name-only 57e7a38 HEAD` плюс рабочее дерево; последний коммит до фазы 9 `4d8f566`, `57e7a38` взят как граница с запасом). Результат: 220 затронутых тестовых файлов (серверные тесты, `packages/exam-core/src/*.test.ts`, `scripts/*.test.mjs`, web-тесты, e2e-спеки). Все покрыты полным `yarn verify` (серверные, web, exam-core, скриптовые тесты) и полным `yarn e2e`.

## Deviations from Plan

**1. Номер фазы 17 в навыке.** Общее правило плана просит без номеров будущих фаз, а `must_haves.truths` и шаг 2 требуют указать фазу 17, где запрет снимается. Указано «(фаза 17)» одной ссылкой.

**2. Граница `codegraph affected`.** Plan просит «файлы фазы»; коммитов у фазы несколько, поэтому набор взят как разница `57e7a38..HEAD` плюс рабочее дерево. В него попали файлы последнего коммита вне фазы 9 (проверка сборки rbac), это только расширяет охват.

Иначе — выполнено как написано.

## Known Stubs

Нет.

## Threat Flags

Нет: правки только описаний кода и путей, команды `yarn` в документах существуют (`check-docs-commands`).

## Шаги пользователя

Вне репозитория, после плана 09-19 (агенты не имеют доступа к серверу):

1. Слить фазу 9 в master одним пакетом, только после зелёных ворот этого плана; промежуточные коммиты фазы в master не сливать — после 0026 прошлый образ не работает (старый код падает на строке `open` и не пишет столбцы проекции).
2. Автовыкатка пропускает коммиты с миграциями (`AUTO_MIGRATIONS=0`): запустить `deploy.sh` вручную вне окна сдач.
3. До выкатки — репетиция миграции на свежем дампе, восстановленном во временную базу под ролью `bio_exam` (механика `restore-test.sh`); подробности и запросы сверки — раздел «User steps» плана `09-05-PLAN.md`.
4. После 0026 откат одного образа запрещён: при `DEPLOY_FAILED` после переключения или «откат выполнен» — восстановить `predeploy-*.dump` или выкатывать вперёд, затем вручную открыть тест и сдать пробную попытку.
5. После выкатки — запросы сверки из 09-05 (попытки, `open`, триггер `test_attempts_facts_immutable`, `test_attempts_*_check` с `convalidated = true`, `users_created_by_fk` с `confdeltype = 'n'`), затем открыть тест и сдать пробную попытку.
6. По желанию — взгляд на реальном телефоне: метки «На проверке» на 375 px (автоматическая проверка контраста и переполнения уже прошла в e2e).

## Файлы к коммиту

- `.agents/skills/bio-exam-data/SKILL.md`
- `.agents/skills/bio-exam-api/SKILL.md`
- `.agents/skills/bio-exam-web/SKILL.md`
- `app/server/README.md`

## Self-Check: PASSED

Четыре файла изменены (`git status --short`), проверки документов, ворота фазы и сверка файлов плана зелёные.

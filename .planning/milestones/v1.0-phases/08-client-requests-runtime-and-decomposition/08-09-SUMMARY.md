---
phase: 08-client-requests-runtime-and-decomposition
plan: 09
subsystem: server-question-content
tags: [perf-02, storage, bounded-concurrency, question-content, bench]
status: complete
deferred_human_gate: true

requires:
  - phase: 08-client-requests-runtime-and-decomposition
    provides: "08-02: bench/run.ts, instrumentStorage с задержкой чтения, синтетика (крупнейший тест bench-1-01, 123 вопроса)"
provides:
  - "mapBounded (скользящее окно) и PROMPT_READ_CONCURRENCY = 123 в services/question-content/bounded.ts"
  - "readQuestionTexts: промпты и пояснения списка вопросов с последовательным перебором кандидатов"
  - "прохождение, чтение теста учеником, чтение администратора, разбор попытки и пояснения при отправке читают хранилище через один помощник"
  - "флаги bench/run.ts: --only prompts, --read-delay <мс>, --runs <n>"
  - "замер потолка при задержке 120 мс: bench/perf02-ceiling.json, раздел PERF-02 в 08-BENCHMARKS.md"
affects: [08-14, 08-26, 08-27, 08-28]

actuals:
  tokens: 7400
  tasks: 3
  commits: 0
plan_head_before: 4514c933d6bb8f09141f37207c90f4db551aa083
plan_head_after: 4514c933d6bb8f09141f37207c90f4db551aa083

tech-stack:
  added: []
  patterns:
    - "Ограниченная параллельность: mapBounded(items, limit, fn) — пул из min(limit, n) исполнителей с общим индексом; результат по индексу входа; первая ошибка ставит флаг, новые задачи не начинаются, Promise.all отдаёт эту ошибку"
    - "Счётчик одновременных чтений в тестах: подмена mem.read на время вызова (задержка + inFlight), восстановление в finally; createStorage берёт adapter.read при каждом вызове"

key-files:
  created:
    - app/server/src/services/question-content/bounded.ts
    - app/server/src/services/question-content/bounded.test.ts
    - app/server/src/services/question-content/read-texts.test.ts
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/perf02-ceiling.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-before.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-6.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-8.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-12.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-16.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-24.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-32.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-48.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-64.json
    - .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-123.json
  modified:
    - app/server/src/services/question-content/read.ts
    - app/server/src/services/question-content/index.ts
    - app/server/src/routes/tests/public.ts
    - app/server/src/routes/tests/index.ts
    - app/server/src/services/scored-attempt/facts.ts
    - app/server/src/scripts/bench/run.ts
    - .planning/phases/08-client-requests-runtime-and-decomposition/08-BENCHMARKS.md

key-decisions:
  - "PROMPT_READ_CONCURRENCY = 123: при задержке 120 мс правило ≤ 1,2 × «до» (161,72 мс) выполнено только на потолке, равном числу вопросов крупнейшего теста (131,70 мс против 134,77 мс); все значения 6…64 дают 2+ раунда чтения (260–2572 мс). Discretion D-21 (6–8) заменён замером по решению оркестратора"
  - "readTexts в readAdminTest читает через mapBounded и module.readText, а не через readQuestionTexts: прежняя семантика — недопустимый ключ бросает StorageKeyError, пробельный текст отдаётся как есть, кандидатов нет"
  - "Красная форма теста readAdminTest (решение исполнителя (автономно)): максимум одновременных чтений равен Math.min(PROMPT_READ_CONCURRENCY, 60); партии по 5 дают 5 ≠ 6, окно — ровно потолок при любом выбранном значении"
  - "--only prompts несовместим с --quick (сид quick не содержит прохождения): отказ с usage (решение исполнителя (автономно))"
  - "mapBounded отклоняет недопустимый потолок (не целое или < 1) RangeError (решение исполнителя (автономно))"

requirements-completed: [PERF-02, PERF-05]

duration: 40min
completed: 2026-10-05
---

# Phase 8 Plan 09: Ограниченная параллельность чтения промптов и пояснений Summary

**Один помощник `mapBounded` со скользящим окном и `readQuestionTexts` в модуле содержимого вопроса; прохождение, чтение администратора, разбор попытки и пояснения при отправке читают хранилище через него; потолок `PROMPT_READ_CONCURRENCY = 123` выбран замером при задержке 120 мс (131,70 мс против 134,77 мс «до»).**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-10-05
- **Tasks:** 3/3
- **Files modified:** 9 файлов кода из allow-list (3 новых, 6 изменённых) + артефакты замера в `.planning`

## Accomplishments

- `bounded.ts`: `PROMPT_READ_CONCURRENCY` и `mapBounded(items, limit, fn)` — скользящее окно, порядок результата — порядок входа, первая ошибка отклоняет результат, новые вызовы после неё не начинаются, пустой вход → `[]`.
- `read.ts`: `readQuestionTexts(requests)` = `mapBounded` поверх `readFirstMarkdown` (кандидаты одного вопроса — последовательно, как в фазе 7; нет файла → `''`; отказ хранилища → отказ всего вызова). `readTexts` администратора — тоже `mapBounded`; `ADMIN_READ_CONCURRENCY` удалён. Экспорт `mapBounded`, `PROMPT_READ_CONCURRENCY`, `readQuestionTexts`, `QuestionTextRequest` из `index.ts`.
- `public.ts`: оба обработчика прохождения (`/topics/:topicSlug/tests/:testSlug` и `/tests/:id`) строят кандидатов как раньше и читают промпты одним `readQuestionTexts`; локальная обёртка `readFirstMarkdown` удалена, `readExplanation` использует `readFirstMarkdown` модуля напрямую. Ответы маршрутов не изменились.
- `routes/tests/index.ts`, только обработчик `GET /admin/attempts/:attemptId`: промпты — `readQuestionTexts` с кандидатами `questionMarkdownCandidates(..., 'prompt.md')` (тот же набор, что строил `readQuestionMarkdown`); при отсутствии `testRow` — пустые тексты, как раньше; `canReviewAttempt(` на месте, `answerKeys` в обработчике нет.
- `scored-attempt/facts.ts`: пояснения читаются `mapBounded(questionRows, PROMPT_READ_CONCURRENCY, …)` до цикла оценки, цикл берёт готовый текст; `ExplanationReader` и вызов из `public.ts` не изменились.
- `bench/run.ts`: флаги `--only prompts`, `--read-delay <мс>` (по умолчанию 20), `--runs <n>` (по умолчанию 5). Без флагов ключи и форма вывода прежние (проверено прогоном без флагов: `mode,env,seed,search,prompts,zip`, `prompts.readDelayMs = 20`, `runs = 5`).

## Места чтения списка: до и после

`rg -n "readFirstMarkdown|readQuestionMarkdown|findFirstMarkdown|readText\(" app/server/src -g '!*.test.ts'` на старте плана:

| Место | Список / объект | До | После |
|---|---|---|---|
| `routes/tests/public.ts` прохождение по slug | список | неограниченный `Promise.all` + локальная обёртка `readFirstMarkdown` | `readQuestionTexts` (помощник) |
| `routes/tests/public.ts` `GET /tests/:id` | список | неограниченный `Promise.all` | `readQuestionTexts` (помощник) |
| `routes/tests/public.ts` `scoreSubmission.readExplanation` | один объект на вызов | по вопросу, вызывается из цикла `facts.ts` | без изменений (`readFirstMarkdown` модуля), конкурентность задаёт `facts.ts` |
| `scored-attempt/facts.ts` цикл оценки | список | строго последовательно | `mapBounded` до цикла (помощник) |
| `question-content/read.ts` `readAdminTest` → `readTexts` | список | партии по 5 (`ADMIN_READ_CONCURRENCY`) | `mapBounded` (помощник), без кандидатов, как раньше |
| `routes/tests/index.ts` `GET /admin/attempts/:attemptId` | список | неограниченный `Promise.all` с `readQuestionMarkdown` | `readQuestionTexts` (помощник) |
| `question-content/export.ts:111` `collectTestParts` | список | строго последовательно | без изменений — экспорт → 08-14 |
| `question-content/asset-index.ts:150` (локальная `readQuestionTexts`) | один вопрос | последовательно по файлам вопроса | без изменений (вне охвата; имя совпадает с новой функцией, но локальное и не экспортируется) |
| `scripts/backfill-question-search.ts:56` | один объект в цикле | последовательно | без изменений (скрипт, вне охвата) |
| `question-content/read.ts` `findFirstMarkdown` / `readFirstMarkdown` / `readQuestionMarkdown` | один вопрос | последовательный перебор кандидатов | без изменений; `readQuestionMarkdown` больше не вызывается маршрутами, экспорт оставлен |

Неограниченных `Promise.all` по вопросам с чтением хранилища в `public.ts` и в обработчике разбора нет (оставшийся `Promise.all` в `public.ts:421` — пара запросов к базе списка тестов).

## codegraph

Индекс построен по основному дереву (коммит до фазы); код читался из worktree.

`codegraph impact` на старте:

| Символ | Затронуто |
|---|---|
| `findFirstMarkdown` | 16: `read.ts` (`readFirstMarkdown`, `readQuestionMarkdown`), `export.ts` (`collectTestParts`, `buildTestArchive`, `buildTopicArchive`), `public.ts` (обёртка `readFirstMarkdown`), `backfill-question-search.ts`, `asset-index.ts` (`readQuestionTexts`, `inventoryAssetRefs`, `backfillAssetRefs`) |
| `readFirstMarkdown` | 2 определения: `public.ts:57` → маршруты `GET /topics/:topicSlug/tests/:testSlug`, `GET /tests/:id`, `POST /tests/:id/submit`; `read.ts:67` → `readQuestionMarkdown`, `GET /api/tests/admin/attempts/:attemptId`, `public.ts`, `backfill-question-search.ts` |
| `readQuestionMarkdown` | 5: `GET /api/tests/admin/attempts/:attemptId` |
| `readAdminTest` | 6: `GET /api/tests/:id`, `GET /api/tests/by-slug/:topicSlug/:testSlug` |

`codegraph affected` по файлам плана (`read.ts`, `index.ts` модуля, `public.ts`, `routes/tests/index.ts`, `facts.ts`, `bench/run.ts`) — 38 файлов: серверные тесты `routes/tests/exam-flow`, `question-content.characterization`, `question-relocation.characterization`, `routes/docs/assets.characterization`, `routes/users/*` (avatar, directory, users-list), `routes/auth/*`, `routes/uploads`, `services/access-policy/*`, `services/question-content/*` (asset-index, asset-refs, export, move-remove, read, reconcile, relocate, write), `services/storage/*` (links, known-defects, contract, local), `db/asset-refs-migration`, `db/teacher-zone-migration`; web `admin/tests/*/layout.tsx`, `MdxRenderer.tsx`, `TestRunner.tsx`, `image-signed-url-cache.test.ts` (связь через общий индекс файлов, правок web нет). Все серверные прогнаны в `yarn verify` (70 файлов тестов сервера зелёные).

## Замер при задержке 120 мс

Команда (до правки `public.ts` и после каждой смены константы):
`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server tsx src/scripts/bench/run.ts --only prompts --read-delay 120 --runs 5 --out .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-<before|after-N>.json`

- «До»: крупнейший тест `bench-1-01`, 123 вопроса, 123 чтения, максимум одновременных 123, медиана 134,77 мс (131,56–136,54). Чтение администратора «до»: 4 033,31 мс, максимум 5.
- Порог: 1,2 × 134,77 = 161,72 мс.

| Потолок | Прохождение, медиана, мс | Максимум одновременных | Администратор, мс | Правило |
|---|---|---|---|---|
| 6 | 2 572,10 | 6 | 3 418,21 | нет |
| 8 | 1 964,19 | 8 | 2 568,29 | нет |
| 12 | 1 353,03 | 12 | 1 712,46 | нет |
| 16 | 991,28 | 16 | 1 349,94 | нет |
| 24 | 747,43 | 24 | 862,83 | нет |
| 32 | 503,21 | 32 | 737,56 | нет |
| 48 | 379,52 | 48 | 495,93 | нет |
| 64 | 260,09 | 64 | 374,64 | нет |
| 123 (шаг после 64 — 128, ограничен числом вопросов) | 131,70 | 123 | 251,89 | да |

Выбрано `PROMPT_READ_CONCURRENCY = 123`. Проверка Task 3 печатает `perf02 ceiling 123 134.77 131.7`.

## TDD

- RED: `bounded.test.ts` и `read-texts.test.ts` написаны до `bounded.ts` и `readQuestionTexts`; прогон — 6 падений (модуль `./bounded.js` не найден, `qc.readQuestionTexts is not a function`, тест `readAdminTest` с задержкой). Отдельно, с `PROMPT_READ_CONCURRENCY = 6` и прежними партиями по 5 в `readTexts`, тест `readAdminTest` красный: `Expected 6, Received 5`.
- GREEN: после `bounded.ts`, `readQuestionTexts`, `readTexts` на `mapBounded` — зелёные. Тесты не зависят от выбранного значения: после смены на 123 (370 запросов в тесте окна, максимум 60 у `readAdminTest`) снова зелёные.
- REFACTOR: не требовался.

## Проверки

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/routes/tests/exam-flow.test.ts` — 11 файлов, 217 тестов passed (Task 1, при потолке 6).
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/services/question-content src/services/scored-attempt src/routes/tests` — 25 файлов, 604 теста passed (при 6 и повторно при 123).
- `node --test scripts/attempt-integrity-guards.test.mjs scripts/storage-no-private-access.test.mjs` — pass 21, fail 0.
- `rg -n "ADMIN_READ_CONCURRENCY" app/server/src` — пусто.
- Проверка `prompts-120-before.json` — `perf02 before ok`; проверка `perf02-ceiling.json` — `perf02 ceiling 123 134.77 131.7`.
- `yarn verify` — `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests).
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-09` — `08-09 changed only its files`.

## Deviations from Plan

None - plan executed exactly as written.

Инцидент исполнения: логи прогонов замера (`tmp-bench-<N>.log`) из-за пути `.planning/.../bench/../../../../` через символьную ссылку `.planning` записались в корень основного дерева `/Users/kdvornichenko/bio-exam`. Файлы перенесены в scratchpad (`p0809-bench-logs/`), `git status` основного дерева пуст.

## Threat surface

T-8-20 закрыт: все места чтения списка, кроме экспорта (08-14), идут через `mapBounded` с потолком 123; тест считает одновременные чтения. T-8-21 закрыт: первая ошибка отклоняет весь вызов (тесты на инъекцию сбоя у `readQuestionTexts` и `readAdminTest`). Новых поверхностей нет.

## Known Stubs

Нет.

## Deferred human verification

- Время открытия крупнейшего теста с реальным хранилищем Supabase на preview (D-27, D-35) — сводно в 08-28. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Коммит файлов плана делает ведущая сессия. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Передачи следующим планам

- 08-14: экспорт (`question-content/export.ts` `collectTestParts`) читает последовательно; переводить на `mapBounded`/`readQuestionTexts` из `services/question-content/index.ts` с `PROMPT_READ_CONCURRENCY` (123). Для пары промпт+пояснение одного вопроса — один список запросов `{ candidates }`.
- 08-26 и 08-27 (нарезка `routes/tests`): обработчик разбора `GET /admin/attempts/:attemptId` использует `readQuestionTexts` и `questionMarkdownCandidates`; `readQuestionMarkdown` маршрутами больше не используется (экспорт модуля оставлен, его тест в `read.test.ts`). В `public.ts` обёртки `readFirstMarkdown` нет, `readExplanation` вызывает `readFirstMarkdown` модуля.
- 08-28: при задержке 20 мс (основная команда) «после» у прохождения максимум одновременных чтений 123, у чтения администратора — 123 (было 5), медиана администратора около 53 мс (было 703,82). Команды 08-02 работают без изменений; `--only prompts`, `--read-delay`, `--runs` — только для повторов PERF-02 (раздел PERF-02 в `08-BENCHMARKS.md`).
- Любой план: потолок меньше 123 возвращает 2+ раунда чтения крупнейшего теста; менять значение только новым замером по команде из раздела PERF-02.

## Файлы к коммиту

Код (allow-list плана):
- app/server/src/services/question-content/bounded.ts (новый)
- app/server/src/services/question-content/bounded.test.ts (новый)
- app/server/src/services/question-content/read-texts.test.ts (новый)
- app/server/src/services/question-content/read.ts
- app/server/src/services/question-content/index.ts
- app/server/src/routes/tests/public.ts
- app/server/src/routes/tests/index.ts
- app/server/src/services/scored-attempt/facts.ts
- app/server/src/scripts/bench/run.ts

Планирование (`.planning`, общий каталог):
- .planning/phases/08-client-requests-runtime-and-decomposition/08-09-SUMMARY.md
- .planning/phases/08-client-requests-runtime-and-decomposition/08-BENCHMARKS.md
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/perf02-ceiling.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-before.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-6.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-8.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-12.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-16.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-24.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-32.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-48.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-64.json
- .planning/phases/08-client-requests-runtime-and-decomposition/bench/prompts-120-after-123.json
- .planning/commit-snapshots/before-08-09/fingerprint.json

## Self-Check: PASSED

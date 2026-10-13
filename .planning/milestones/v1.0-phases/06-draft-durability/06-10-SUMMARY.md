---
phase: 06-draft-durability
plan: 10
subsystem: agent-docs
tags: [skills, agents-md, docs-commands, ver08]
status: complete
deferred_human_gate: true

requires:
  - phase: 06-08
    provides: "lib/drafts: createQuestionDraftAutosave, useQuestionDraftAutosave, save-queue, question-draft-copy, before-unload"
  - phase: 06-09
    provides: "useAttemptLifecycle и TestRunner на модуле жизненного цикла попытки"
provides:
  - ".agents/skills/bio-exam-web/SKILL.md, .agents/skills/bio-exam-api/SKILL.md, .agents/skills/bio-exam-data/SKILL.md"
  - "колонка Skill в таблице Routing файла AGENTS.md и строка о каталоге .agents/skills"
  - "check-docs-commands проверяет команды yarn в .agents/skills/*/SKILL.md после DOC_FILES"
  - "check-docs-structure проверяет маршрутизацию навыков, name навыка и существование путей репозитория в навыках"
affects: [06-11]

estimate:
  tokens: 70000
  tasks: 3
actuals:
  tokens: 4800
  tasks: 3
  commits: 0
plan_head_before: b217b8c065ebc9e39b480bcb5df7085e4416cbb7
plan_head_after: b217b8c065ebc9e39b480bcb5df7085e4416cbb7

tech-stack:
  added: []
  patterns:
    - "Файлы навыков в проверке команд: SKILLS_DIR = '.agents/skills', loadDocs обходит подкаталоги через listChildren (сортировка), checkDocsCommands проходит DOC_FILES, затем отсортированные ключи вида .agents/skills/<имя>/SKILL.md"
    - "Пути в навыках пишутся полностью от корня репозитория, чтобы их видела проверка существования путей"

key-files:
  created:
    - .agents/skills/bio-exam-web/SKILL.md
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-data/SKILL.md
  modified:
    - AGENTS.md
    - scripts/check-docs-commands.mjs
    - scripts/check-docs-commands.test.mjs
    - scripts/check-docs-structure.test.mjs

decisions:
  - "Строка File storage таблицы Routing получила навык bio-exam-api: навык api описывает порт и адаптеры services/storage по must_haves (решение исполнителя, автономно)"
  - "Навык api называет три вида адаптера хранилища (local, supabase, memory), как в коде StorageAdapterKind; формулировка must_haves «порт и два адаптера» взята из названия ADR 0004, memory работает только в изолированном режиме тестов"
  - "В навыке data окружение служебных команд названо как «.env сервера» с образцом app/server/.env.example: app/server/.env не лежит в репозитории, и проверка путей навыка его отклоняет"

metrics:
  started: 2026-10-04T19:27:03Z
  completed: 2026-10-04T19:35:16Z
  duration: 8min
---

# Phase 6 Plan 10: Навыки проекта и их проверка Summary

Три тонких навыка `.agents/skills/bio-exam-{web,api,data}` с фактами текущего кода (с фазой 7), колонка `Skill` в `AGENTS.md`, проверка команд `yarn` и путей репозитория в навыках внутри `yarn verify`; все три навыка проходят `quick_validate.py`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-06`.

## Что сделано

### Task 1 (tracer): проверка команд видит навыки, навык web, маршрут в AGENTS.md

- `scripts/check-docs-commands.mjs`: `DOC_FILES` и его порядок без изменений; добавлены `SKILLS_DIR = '.agents/skills'` и шаблон файла навыка. `loadDocs` после `DOC_FILES` читает `<каталог навыка>/SKILL.md` в алфавитном порядке, каталог без `SKILL.md` пропускается, отсутствие `.agents/skills` не ошибка. `checkDocsCommands` проходит `DOC_FILES`, затем отсортированные ключи файлов навыков из `files`. Шапка файла не менялась, новых комментариев нет.
- `scripts/check-docs-commands.test.mjs`: четыре новых теста (порядок находок DOC_FILES → навык a → навык b; `yarn nope` в навыке даёт `.agents/skills/a/SKILL.md:4: unknown script nope`; без навыков находок нет, отсутствующий `app/server/README.md` по-прежнему ошибка; `loadDocs` на временном корне возвращает `SKILL.md` навыков по алфавиту и пропускает каталог без него).
- `.agents/skills/bio-exam-web/SKILL.md`: `apiFetch` (401 → один общий `refreshOnce()` → один повтор), keep-alive, `proxy.ts`, гейты `route-permissions.ts` / `requireSectionAccess` / `useAuth().can`, модуль `components/tests/attempt-lifecycle` и `useAttemptLifecycle`, автосохранение `lib/drafts`, правило web-тестов (Vitest environment node, только `*.test.ts`, швы по образцу `keep-alive.ts`), команды `yarn workspace @bio-exam/web test|typecheck|lint`, `yarn e2e`.
- `AGENTS.md`: колонка `Skill` (`bio-exam-web` у web, `bio-exam-api` у API, домена экзамена и хранилища, `bio-exam-data` у схемы и миграций, `-` у остальных) и строка под таблицей о `.agents/skills`. Язык английский, разделы CodeGraph, Project commands и прочие на месте.
- RED: `node --test scripts/check-docs-commands.test.mjs` до правки скрипта: `tests 12, pass 10, fail 2` (порядок навыков и `loadDocs`). GREEN: `tests 12, pass 12, fail 0`, `check-docs-commands: OK`.
- Tracer-ворота перед Task 2: оба `<automated>` Task 1 и проверка `agents routes web skill` повторены, зелёные.

### Task 2: навыки api и data, проверка структуры навыков

- `scripts/check-docs-structure.test.mjs`: четыре новых теста (AGENTS.md называет три навыка и `.agents/skills`; у каждого навыка `SKILL.md` с `name`, равным имени каталога; каждый путь в обратных кавычках с префиксом `app/`, `packages/`, `scripts/`, `e2e/`, `docs/` существует, суффикс `:строка` снимается, шаблоны со `*` пропускаются; юнит-тест разбора путей).
- RED: до навыков api и data `tests 9, pass 7, fail 2` (`.agents/skills/bio-exam-api/SKILL.md missing`).
- `.agents/skills/bio-exam-api/SKILL.md`: `requestAccess`/`hasPermission`, функции `scope.ts` (`canReadTest`, `canWriteTest`, `canWriteTopic`, `canReadUser`, `canReviewAttempt`, `testScope`), `requirePerm`, запрет решений по строке роли; сессии входа `services/session`; модули попытки `services/attempt-sessions` и `services/scored-attempt`; `services/question-content`; `storage()` поверх порта `StorageAdapter`; `exam-core` как контракт HTTP и сборка `dist`; охранные тесты в `scripts`; `KNOWN_DEFECTS` и `defectTest` → `test.fails`.
- `.agents/skills/bio-exam-data/SKILL.md`: `schema.ts`, миграции новыми файлами через `drizzle:generate`, последняя `0024_question_asset_refs.sql`, `migrations-manifest.json` и его поля, этапы `check-migrations.mjs`, образец теста миграции, охрана `test_*` в `test-database-url.ts`, `node scripts/with-test-db.mjs <command>`, `DATABASE_URL` из `.env` для тестов не используется, `assets:refs` и `storage:reconcile`.
- Проверка путей поймала `app/server/.env` (файла нет в репозитории); формулировка заменена на «`.env` сервера» с образцом `app/server/.env.example`. GREEN: `node --test scripts/check-docs-structure.test.mjs scripts/check-docs-commands.test.mjs` → `tests 21, pass 21, fail 0`, `check-docs-commands: OK`, `skills frontmatter ok`.

### Task 3: ворота плана

- `oxfmt --check .` → `All matched files use the correct format.`
- `yarn verify` → все восемь шагов `passed`, `script-tests` `tests 174, pass 174, fail 0`, последняя строка `yarn verify: OK`.
- Сверка файлов: `06-10 changed only its files` (снимок `.planning/commit-snapshots/before-06-10/fingerprint.json`, 0 путей на старте).

## CodeGraph

Индекс CodeGraph построен по основному дереву `/Users/kdvornichenko/bio-exam`, в worktree его нет (`CodeGraph not initialized`); команды запущены из основного дерева.

`codegraph impact checkDocsCommands`:

```
Impact of changing "checkDocsCommands" — 5 affected symbols:
function checkDocsCommands (javascript) — scripts/check-docs-commands.mjs:124
scripts/check-docs-commands.mjs: checkDocsCommands:124, main:199, check-docs-commands.mjs:1
scripts/check-docs-commands.test.mjs: run:23, check-docs-commands.test.mjs:1
```

`codegraph impact loadDocs`:

```
Impact of changing "loadDocs" — 3 affected symbols:
function loadDocs (javascript) — scripts/check-docs-commands.mjs:190
scripts/check-docs-commands.mjs: loadDocs:190, main:199, check-docs-commands.mjs:1
```

`codegraph affected` по семи файлам плана:

```
Affected test files (2):
  scripts/check-docs-commands.test.mjs
  scripts/check-docs-structure.test.mjs
```

## quick_validate.py

`python3 "$HOME/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py" .agents/skills/<навык>`:

```
== bio-exam-web
Skill is valid!
== bio-exam-api
Skill is valid!
== bio-exam-data
Skill is valid!
```

Размеры: web 48 строк, описание 362 символа; api 53 строки, 485 символов; data 34 строки, 400 символов. Python в `yarn verify` не добавлялся.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Несуществующий путь в навыке data**
- **Found during:** Task 2
- **Issue:** навык называл `app/server/.env`, которого нет в репозитории; новый тест путей навыков упал.
- **Fix:** «`.env` сервера (образец ключей: `app/server/.env.example`)».
- **Files modified:** `.agents/skills/bio-exam-data/SKILL.md`

### Решения исполнителя (автономно)

**2. Строка File storage в Routing ведёт к `bio-exam-api`**
- **Task:** 1, п. 5 плана: навык api у строк API и домена экзамена, у остальных строк пусто или `-`.
- **Что сделано:** у строки File storage стоит `bio-exam-api`, потому что навык api по must_haves описывает порт и адаптеры `app/server/src/services/storage`.
- **Как вернуть к букве плана:** заменить ячейку на `-` в `AGENTS.md`; тесты проходят в обоих вариантах.

Остальное выполнено по плану; прочие решения исполнителя перечислены во frontmatter `decisions`.

## TDD Gate Compliance

RED/GREEN-коммиты не делались (правило пользователя). Порядок соблюдён по сути: тесты Task 1 (2 красных из 12) до правки скрипта, тесты Task 2 (2 красных из 9) до навыков api и data.

## Threat Flags

Нет. Навыки содержат только имена ключей окружения (`TEST_DATABASE_URL`, `BIO_EXAM_ISOLATED_ENV`, `DATABASE_URL`, `SUPABASE_*`, `PG*`), без значений (T-6-25). Навык data прямо запрещает `DATABASE_URL` из `.env` для тестов; пути и команды навыков проверяются в `yarn verify` (T-6-26). Установок пакетов нет (T-6-SC).

## Deferred human verification

- Коммит файлов плана делает ведущая сессия. Не выполнено, ждёт пользователя; исполнитель не одобрял.
- Обновление навыков `bio-exam-api` и `bio-exam-data` после нарезки роутера (фаза 8) и после слияния фазы 07.1 — Deferred (CONTEXT); фаза 7 к исполнению влита, её факты в навыках есть.

## Файлы к коммиту

- `.agents/skills/bio-exam-web/SKILL.md` (новый)
- `.agents/skills/bio-exam-api/SKILL.md` (новый)
- `.agents/skills/bio-exam-data/SKILL.md` (новый)
- `AGENTS.md`
- `scripts/check-docs-commands.mjs`
- `scripts/check-docs-commands.test.mjs`
- `scripts/check-docs-structure.test.mjs`

## Self-Check: PASSED

- Семь файлов плана есть в `git status` worktree, других изменений в `app`, `packages`, `scripts`, `e2e`, `.agents`, `AGENTS.md` нет.
- Коммитов нет по правилу пользователя; `plan_head_before` = `plan_head_after` = `b217b8c`.

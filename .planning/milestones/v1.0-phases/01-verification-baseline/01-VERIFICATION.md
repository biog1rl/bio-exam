---
phase: 01-verification-baseline
verified: 2026-10-04T12:00:00Z
status: passed
score: "5/5 roadmap success criteria verified; plan must-haves 119/119 (114 подтверждены кодом и прогонами, 5 закрыты ручным UAT 01-UAT.md: 7/7 pass)"
covered_files:
  - .planning/phases/01-verification-baseline/01-01-PLAN.md
  - .planning/phases/01-verification-baseline/01-01-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-02-PLAN.md
  - .planning/phases/01-verification-baseline/01-02-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-03-PLAN.md
  - .planning/phases/01-verification-baseline/01-03-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-04-PLAN.md
  - .planning/phases/01-verification-baseline/01-04-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-05-PLAN.md
  - .planning/phases/01-verification-baseline/01-05-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-06-PLAN.md
  - .planning/phases/01-verification-baseline/01-06-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-07-PLAN.md
  - .planning/phases/01-verification-baseline/01-07-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-08-PLAN.md
  - .planning/phases/01-verification-baseline/01-08-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-09-PLAN.md
  - .planning/phases/01-verification-baseline/01-09-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-10-PLAN.md
  - .planning/phases/01-verification-baseline/01-10-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-11-PLAN.md
  - .planning/phases/01-verification-baseline/01-11-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-12-PLAN.md
  - .planning/phases/01-verification-baseline/01-12-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-13-PLAN.md
  - .planning/phases/01-verification-baseline/01-13-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-14-PLAN.md
  - .planning/phases/01-verification-baseline/01-14-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-15-PLAN.md
  - .planning/phases/01-verification-baseline/01-15-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-16-PLAN.md
  - .planning/phases/01-verification-baseline/01-16-SUMMARY.md
  - .planning/phases/01-verification-baseline/01-SCHEMA-DIFF.md
  - .github/workflows/ci.yml
  - .gitignore
  - .oxfmtrc.json
  - .oxlintrc.json
  - AGENTS.md
  - README.md
  - app/server/.env.example
  - app/server/README.md
  - app/server/drizzle.config.ts
  - app/server/drizzle/meta/0020_snapshot.json
  - app/server/drizzle/migrations-manifest.json
  - app/server/package.json
  - app/server/src/config/env.isolation.test.ts
  - app/server/src/config/env.ts
  - app/server/src/config/test-database-url.test.ts
  - app/server/src/config/test-database-url.ts
  - app/server/src/db/index.ts
  - app/server/src/db/schema.ts
  - app/server/src/db/seed.ts
  - app/server/src/db/timestamps.test.ts
  - app/server/src/lib/tests/question-type-resolver.test.ts
  - app/server/src/routes/docs/assets.ts
  - app/server/src/routes/tests/index.ts
  - app/server/src/routes/users/avatar.ts
  - app/server/src/schemas/tests.test.ts
  - app/server/src/scripts/apply-migration.ts
  - app/server/src/scripts/bootstrap-admin.ts
  - app/server/src/scripts/e2e-seed.ts
  - app/server/src/scripts/isolation-probe.ts
  - app/server/src/services/storage/storage.local.test.ts
  - app/server/src/test-support/test-database.ts
  - app/server/vitest.config.ts
  - app/web/.env.example
  - app/web/.oxlintrc.json
  - app/web/.vscode/settings.json
  - "app/web/app/(internal)/(protected)/admin/tests/lifecycle.test.ts"
  - app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts
  - app/web/components/tests/attempt-review/attempt-review-utils.test.ts
  - app/web/lib/auth/sessionCookie.test.ts
  - app/web/lib/mdx/normalizeSource.test.ts
  - app/web/package.json
  - app/web/vitest.config.ts
  - e2e/auth.setup.ts
  - e2e/fixtures/accounts.ts
  - e2e/fixtures/seed.json
  - e2e/playwright.config.ts
  - e2e/tests/auth.spec.ts
  - e2e/tests/authoring.spec.ts
  - e2e/tests/review.spec.ts
  - e2e/tests/take-test.spec.ts
  - package.json
  - packages/rbac/package.json
  - packages/rbac/src/index.test.ts
  - packages/rbac/tsdown.config.ts
  - packages/rbac/vitest.config.ts
  - scripts/check-ci-workflow.mjs
  - scripts/check-ci-workflow.test.mjs
  - scripts/check-docs-commands.mjs
  - scripts/check-docs-commands.test.mjs
  - scripts/check-docs-structure.test.mjs
  - scripts/check-env-contract.mjs
  - scripts/check-env-contract.test.mjs
  - scripts/check-lockfile.mjs
  - scripts/check-lockfile.test.mjs
  - scripts/check-migrations.mjs
  - scripts/check-migrations.test.mjs
  - scripts/check-rbac-dist.mjs
  - scripts/compare-schema-dump.mjs
  - scripts/e2e.mjs
  - scripts/env-contract.config.json
  - scripts/lib/e2e-web-env.mjs
  - scripts/lib/e2e-web-env.test.mjs
  - scripts/lib/isolation-guards.test.mjs
  - scripts/lib/schema-fingerprint.mjs
  - scripts/lib/schema-fingerprint.test.mjs
  - scripts/lib/test-db.mjs
  - scripts/verify.mjs
  - scripts/verify.test.mjs
  - scripts/with-test-db.mjs
  - turbo.json
  - yarn.lock

covered_digest: "v2:sha256:9afc0f95942c31beb120845cfe1fcda6a18b0770b69f55fdcc1a18a752406725"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "5/5 roadmap; plan 114/119 (2 present-behavior-unverified, 1 insufficient_spec, 2 historical human-action items)"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  human_items_closed_by: "01-UAT.md (7/7 pass, 2026-10-03), код проверяемых путей с тех пор не менялся"
---

# Phase 1: Verification baseline — Verification Report

**Phase Goal:** Every later change can be checked by one command locally and in CI, and the Drizzle migration history is safe to extend.
**Verified:** 2026-10-04
**Status:** passed
**Re-verification:** Да. Предыдущий отчёт (2026-10-03, status `human_needed`) устарел: после него изменились покрытые файлы `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json` и `yarn.lock` (фаза 2, не закоммичено поверх HEAD `7a6f95a`). Задача этой проверки: подтвердить, что must-have фазы 1 держатся на текущем дереве. Фазу 2 я не аудировал.

**Evidence base.** Что я запускал сам на текущем дереве (HEAD `7a6f95a` плюс 7 изменённых и 7 неотслеживаемых путей фазы 2):

- `yarn install --immutable`: exit 0.
- `yarn verify`: exit 0, все 8 шагов `passed` (`lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`), последняя строка `yarn verify: OK`. Vitest: rbac 1 файл, web 9 файлов, server 10 файлов, все passed. script-tests: 129 из 129.
- `node scripts/check-lockfile.mjs`: `check-lockfile: OK`.
- `node scripts/check-migrations.mjs`: `check-migrations: OK` (`manifest`, `chain-vs-schema` с строкой `DRZ-01: chain == schema.ts`, `idempotency`, `generate-no-diff`, `drizzle-check`), PostgreSQL 17.10, TimeZone UTC.
- `node scripts/check-ci-workflow.mjs`: OK.
- Read-only git: `git diff HEAD --stat` по `.github`, `scripts`, `app/server/src/config`, `app/server/src/db`, `app/server/drizzle`, `e2e/playwright.config.ts`, `e2e/auth.setup.ts`, `turbo.json`, корневому `package.json`, `README.md`, `AGENTS.md` пуст: код фазы 1 относительно HEAD не менялся. `git diff --quiet 11b2916 -- 'app/server/drizzle/*.sql' app/server/drizzle/meta/_journal.json`: без изменений, 21 SQL-файл.
- Публичный GitHub API: run 37120717677.

Что я не запускал: `yarn e2e`. Ссылаюсь на данные оркестратора с 2026-10-04 на этом же дереве: 108 passed (6 ожидаемых `@known-defect`). Рост с 40 объясняется новым `e2e/tests/proxy-protection.spec.ts` фазы 2, это не регрессия фазы 1.

**CI: оговорка.** CI на текущем дереве не запускался: ничего не отправлено в GitHub. CI-доказательство фазы 1 остаётся прежним: run 37120717677, `pull_request`, ветка `phase-1-verification`, head SHA `7a6f95a86f9fb74ce94c10d9141a120b40b8776a`, conclusion `success`; jobs `verify`, `build`, `e2e` все `success` (проверил через публичный API 2026-10-04). До этого был зелёный run 37114466556 на `e02a86b`. Файлы фазы 1, которые определяют поведение CI (`ci.yml`, `scripts/`, `turbo.json`, корневой `package.json`), на текущем дереве идентичны HEAD `7a6f95a`. Изменились только манифесты зависимостей и `yarn.lock` (фаза 2), их локально покрывают `yarn install --immutable` и `yarn verify`. Первый push фазы 2 даст CI-прогон уже на новом дереве.

## Goal Achievement

### Roadmap Success Criteria (the contract)

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| SC1 | `yarn verify` (lint, typecheck, Vitest) exits 0 on a clean checkout and runs all 12 existing test files, now executed by Vitest in `app/web`, `app/server` and `packages/rbac` | VERIFIED | `yarn verify` exit 0 на текущем дереве. Vitest: web 9 файлов (8 портированных фазы 1 и `untrusted.test.ts` фазы 2), server 10 файлов (8 фазы 1 плюс `sharp-runtime.test.ts` и `uploads.test.ts` фазы 2), rbac 1; все passed. 12 исходных файлов (8 web и 4 server: `question-type-resolver`, `scoring`, `telemetry`, `schemas/tests`) на месте и выполняются. Скрипт `test` в каждом workspace это `vitest run`, `passWithNoTests` в репозитории не встречается. |
| SC2 | Opening a PR starts a CI run (Corepack, `yarn install --immutable`, `yarn verify`, migration check) that goes green and has no deployment or write step | VERIFIED (на `7a6f95a`; на текущем дереве CI не запускался) | Run 37120717677: `pull_request`, `verify`/`build`/`e2e` = success. `ci.yml`: `pull_request` в триггерах, `permissions` на верхнем уровне, `persist-credentials: false`, `check-lockfile.mjs` перед `yarn install --immutable`, затем `yarn verify`; `check-ci-workflow` (запущен мной) OK. Шагов deploy/vercel нет, секретов нет. Проверка миграций идёт внутри `yarn verify`. |
| SC3 | `package-lock.json` is gone, `yarn.lock` is the only lockfile, and CI fails when a second lockfile is committed | VERIFIED | `git ls-files` показывает единственный lockfile `yarn.lock`; `package-lock.json` отсутствует. `check-lockfile: OK`. Защита стоит в CI перед install и первым шагом `yarn verify`; `check-lockfile.test.mjs` покрывает второй lockfile (в составе 129 passed script-tests). |
| SC4 | Migrations 0000-0020 on an empty disposable PostgreSQL reach the `schema.ts` shape, a following Drizzle generation gives an empty diff, and the applied SQL files and their order are unchanged | VERIFIED | `check-migrations` (запущен мной отдельно и внутри `yarn verify`): `chain-vs-schema` ok (150 DDL-операторов схемы, цепочка совпадает), `generate-no-diff` "No schema changes", `drizzle-check` "Everything's fine". SQL и `_journal.json` идентичны базе `11b2916`; 21 SQL-файл, 0021 нет. |
| SC5 | A newcomer can set up and run from the root README and value-free env examples, and the env-contract check passes inside `yarn verify` | VERIFIED | Шаг `env-contract` passed; `.env.example` содержат только плейсхолдеры (`DATABASE_URL=postgresql://`, `AUTH_JWT_SECRET=` пустые). README описывает Node 24, Corepack/Yarn 4.12, PostgreSQL 17, `yarn verify` с итоговыми строками `OK` / `FAILED at <шаг>`, `yarn e2e`; шаг `docs-commands` passed. Чтение README глазами новичка закрыто в 01-UAT тест 1 (pass). |

**Roadmap score:** 5/5.

### Plan must-have truths (16 plans, 119 truths)

Состояние по планам не изменилось: код, на который опираются эти truths, на текущем дереве идентичен HEAD, а полный `yarn verify` (включая 129 script-тестов и Vitest всех workspace) зелёный.

| Plan | Truths | Status | Key evidence |
|---|---|---|---|
| 01-01 harness and D-29 isolation | 11 | 11 VERIFIED | `scripts/lib/test-db.mjs` и guard-тесты (`isolation-guards.test.mjs`, `test-database-url.test.ts`, `env.isolation.test.ts`) выполняются в `yarn verify` и passed; `check-migrations` поднял и снёс отдельный кластер (`bio-exam-pg-*`). Self-test стадий в этом проходе не перезапускался, поэтому опираюсь на предыдущий прогон (15 стадий OK, код `test-db.mjs` с тех пор не менялся относительно HEAD). |
| 01-02 toolchain pins | 5 | 5 VERIFIED | Точные пины на месте: vitest 5.0.3, vite 8.3.2, oxlint 1.86.0 (в трёх workspace), oxfmt 0.71.0, tsdown 0.23.0, @playwright/test 1.63.0, drizzle-orm 0.45.3, drizzle-kit 0.31.11; Drizzle не на 1.x. Truth о подтверждении пинов до установки закрыт в 01-UAT тест 4 (pass). |
| 01-03 server and rbac Vitest | 9 | 9 VERIFIED | server и rbac `vitest run` passed в `yarn verify`; turbo-задача `test` без кэша и с проброшенными `TEST_DATABASE_URL`, `BIO_EXAM_ISOLATED_ENV`; `turbo.json` и `vitest.config.ts` не менялись. |
| 01-04 web Vitest | 5 | 5 VERIFIED | 8 портированных web-файлов в прогоне web (9 файлов, passed). |
| 01-05 DRZ-01 comparator and schema.ts truth | 8 | 8 VERIFIED | `chain-vs-schema` ok; `timestamps.test.ts` выполняется в server-прогоне; UTC зафиксирован в `01-SCHEMA-DIFF.md` и виден в строке `TimeZone UTC` вывода `check-migrations`. |
| 01-06 oxlint, oxfmt, tsdown | 7 | 7 VERIFIED | `format-check` и lint в `yarn verify` passed; пины oxlint/oxfmt/tsdown не менялись; CI `build` job success на `7a6f95a`. |
| 01-07 local storage mode | 7 | 7 VERIFIED | `storage.local.test.ts` в server-прогоне passed (включая тест, что в изолированном режиме клиент Supabase не создаётся). |
| 01-08 snapshot, manifest, full check | 7 | 7 VERIFIED | Все 5 стадий `check-migrations` ok; кейсы подмены манифеста и STOP на DROP лежат в `check-migrations.test.mjs` (в script-tests passed). |
| 01-09 e2e stack | 10 | 10 VERIFIED | CI `e2e` job success на `7a6f95a`; оркестратор: `yarn e2e` на текущем дереве 108 passed. Остановка по SIGINT (раньше PRESENT_BEHAVIOR_UNVERIFIED) закрыта ручным прогоном 01-UAT тест 6: exit 130 за 0.4 с, процессов, каталогов `bio-exam-pg-*` и `bio-exam-e2e-storage-*` и занятых портов не осталось. Обработчики SIGINT/SIGTERM/SIGHUP в `scripts/e2e.mjs` на месте (строки 156-160, снятие в 207-209), файл не менялся относительно HEAD. Я этот ручной прогон не повторял. |
| 01-10 verify and lockfile | 8 | 8 VERIFIED | Порядок 8 шагов фиксирован `verify.test.mjs` (passed); путь без PostgreSQL проверен тестом. Остановка на первом упавшем шаге (раньше PRESENT_BEHAVIOR_UNVERIFIED) закрыта ручным прогоном 01-UAT тест 7: временно падающий тест в `packages/rbac` дал exit 1, `yarn verify: FAILED at lint-typecheck-test`, шаги `migrations` и `script-tests` `not run`. Цикл по `STEPS` с `break` на падении на месте (`scripts/verify.mjs` строки ~142-151). Повторять мутацию репозитория я не стал (проверка read-only). |
| 01-11 e2e flows and D1/D2/D5 | 5 | 5 VERIFIED | В `e2e/tests` нет `test.skip` и `test.fixme`; `test.fail` по-прежнему 7 в `review.spec.ts` и 2 в `authoring.spec.ts`. |
| 01-12 D-07 production comparison | 4 | 4 VERIFIED | `01-SCHEMA-DIFF.md` на месте, дамп вне git; код сравнения не менялся. |
| 01-13 env contract and docs | 11 | 11 VERIFIED | `env-contract` и `docs-commands` passed, `check-docs-structure.test.mjs` passed. |
| 01-14 one-time reformat | 5 | 5 VERIFIED | Форматирование остаётся в отдельном коммите `2b59334`, хеш в `.git-blame-ignore-revs`; `format-check` passed на текущем дереве. |
| 01-15 CI | 12 | 12 VERIFIED | `ci.yml` не менялся; `check-ci-workflow` OK; run 37120717677 зелёный. Страховочный truth «холодный кэш даёт тот же результат» закрыт 01-UAT тест 3: run 37114466556 был первым запуском CI в репозитории, все кэши создавались в нём, и он зелёный. |
| 01-16 guard and isolation tests | 5 | 5 VERIFIED | Оба файла в server-прогоне (10 файлов, passed). |

**Plan score:** 119/119. Разбивка: 114 подтверждены кодом и прогонами; 5 (SIGINT-остановка, остановка на упавшем шаге, холодный кэш, порядок одобрения пинов, README для новичка) закрыты человеческим UAT 01-UAT.md, где все 7 тестов pass, а код проверяемых путей на текущем дереве совпадает с тем, на котором шёл UAT.

### Prohibitions

Test-tier запреты (подтверждение из предыдущего отчёта плюс повторные проверки):

| Plan | Prohibition | Disposition | Evidence |
|---|---|---|---|
| 01-01 | Tooling never connects outside localhost/test_*; no server process reads DATABASE_URL in isolated mode | VERIFIED | guard-тесты в зелёном `yarn verify`; новый `uploads.test.ts` фазы 2 тоже работает только через `TEST_DATABASE_URL` на scratch-базе |
| 01-02 | No flagged package before confirmation; no `^`/`~` on toolchain | VERIFIED | пины grep-проверены; порядок одобрения подтверждён пользователем в 01-UAT тест 4 |
| 01-02 | Drizzle not moved to 1.x | VERIFIED | `drizzle-orm 0.45.3`, `drizzle-kit 0.31.11` |
| 01-03 | No test sets a dummy DATABASE_URL to make an import succeed | VERIFIED | код не менялся |
| 01-05 / 01-08 | No applied SQL edited, reordered or added; probe migration never kept | VERIFIED | SQL и journal равны `11b2916`, 0021 нет, стадия manifest ok |
| 01-06 | No repo-wide reformat in 01-06 | VERIFIED | форматирование только в `2b59334` |
| 01-07 | No isolated process touches Supabase Storage | VERIFIED | тест `storage.local.test.ts` passed |
| 01-08 | drizzle-kit never connects to a DB | VERIFIED | `check-migrations` вызывает drizzle-kit только на временных копиях |
| 01-09 | No e2e process gets live DB URL, SUPABASE_* or app/web/.env values | VERIFIED | `e2e-web-env.test.mjs` passed; `playwright.config.ts`, `e2e.mjs` не менялись |
| 01-10 | verify never skips silently | VERIFIED | тест нуля тестов и тест без PostgreSQL passed |
| 01-11 | D1/D2/D5 not weakened or skipped | VERIFIED | `test.fail` без `skip`/`fixme` |
| 01-13 | No real .env value read or printed by env-contract | VERIFIED | код не менялся |
| 01-14 | Reformat never mixed with other changes | VERIFIED | отдельный коммит |
| 01-15 | CI never deploys, writes or reads secrets | VERIFIED | `ci.yml` и `check-ci-workflow` |

Judgment-tier запреты: вердикты LLM из предыдущего отчёта остаются в силе, код фазы 1 не менялся. Человеческое подтверждение получено в 01-UAT тест 5 (pass: проверены утечки `.env`, автор коммитов, дамп вне git, `AGENTS.md` без личных правил; 01-06 принят по зелёному CI). Для новых файлов фазы 2 я проверил только то, что они не затрагивают эти запреты: `TBD`/`FIXME`/`XXX` в них нет, изоляция БД в `uploads.test.ts` соблюдена.

### Required Artifacts

| Artifact | Status | Wiring |
|---|---|---|
| `scripts/verify.mjs` | VERIFIED | Корневой `verify` вызывает его; CI запускает `yarn verify` |
| `scripts/lib/test-db.mjs` | VERIFIED | Используется verify, check-migrations, e2e, compare-schema-dump, with-test-db |
| `app/server/src/config/test-database-url.ts` | VERIFIED | Подключён в db/index, apply-migration, drizzle.config, env, seed, bootstrap-admin, storage |
| `scripts/check-migrations.mjs` | VERIFIED | Шаг `migrations`, мной запущен: OK |
| `app/server/drizzle/meta/0020_snapshot.json`, `migrations-manifest.json` | VERIFIED | `generate-no-diff` и стадия manifest ok |
| `scripts/check-lockfile.mjs`, `check-env-contract.mjs`, `check-docs-commands.mjs`, `check-ci-workflow.mjs` | VERIFIED | шаги 1-4 `yarn verify` passed |
| `.github/workflows/ci.yml` | VERIFIED | Зелёный run 37120717677 |
| `app/{web,server}/vitest.config.ts`, `packages/rbac/vitest.config.ts` | VERIFIED | `vitest run` через turbo `test`, шаг `lint-typecheck-test` |
| `e2e/playwright.config.ts`, `scripts/e2e.mjs`, `scripts/lib/e2e-web-env.mjs` | VERIFIED | Корневой `yarn e2e`; CI `e2e` job |
| `app/web/.env.example`, `app/server/.env.example` | VERIFIED | Шаг `env-contract` passed |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| package.json | scripts/verify.mjs | `node scripts/verify.mjs` | WIRED |
| verify.mjs | check-* скрипты, `format:check` | массив `STEPS` | WIRED |
| verify.mjs | test-db.mjs | `withTestDatabase` и изолированное окружение дочерних процессов | WIRED |
| ci.yml | verify.mjs, check-lockfile.mjs | `yarn verify`; lockfile-guard перед install | WIRED |
| db/index.ts, apply-migration.ts, drizzle.config.ts | test-database-url.ts | `resolveIsolatedDatabaseUrl()` в изолированном режиме | WIRED |
| check-migrations.mjs | apply-migration.ts, schema.ts | `drizzle:migrate` в изоляции; `drizzle-kit generate` во временную папку | WIRED |
| storage.ts | test-database-url.ts | изоляция отключает клиент Supabase | WIRED |
| server vitest.config.ts | db/index.ts | `BIO_EXAM_ISOLATED_ENV=1` | WIRED |
| turbo.json | env | `globalPassThroughEnv` TEST_DATABASE_URL, BIO_EXAM_ISOLATED_ENV | WIRED |

### Data-Flow Trace (Level 4)

Не применимо: фаза поставляет инструменты, конфигурацию и тесты, а не UI с динамическими данными.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Lockfile зависимостей воспроизводим | `yarn install --immutable` | exit 0 | PASS |
| Единый шаг проверки на текущем дереве | `yarn verify` | 8/8 шагов passed, `yarn verify: OK`, exit 0; script-tests 129/129 | PASS |
| Единственный lockfile | `node scripts/check-lockfile.mjs` | `check-lockfile: OK` | PASS |
| Миграции с нуля | `node scripts/check-migrations.mjs` | `check-migrations: OK`, пять стадий ok | PASS |
| Политика CI | `node scripts/check-ci-workflow.mjs` | `check-ci-workflow: OK` | PASS |
| Применённые миграции не тронуты | `git diff --quiet 11b2916 -- 'app/server/drizzle/*.sql' app/server/drizzle/meta/_journal.json` | без изменений | PASS |
| CI зелёный на PR (фаза 1) | GitHub API run 37120717677 | `pull_request`, head `7a6f95a`, verify/build/e2e success | PASS |
| e2e на текущем дереве | не запускался мной | данные оркестратора: 108 passed (6 `@known-defect`) | PASS (cited) |
| CI на текущем дереве | не запускался (ничего не отправлено) | нет данных | NOT RUN |

### Probe Execution

Файлов `scripts/*/tests/probe-*.sh` нет, ни один PLAN их не объявляет. Probe-аналогом служат `check-migrations.mjs` и `check-ci-workflow.mjs` (запущены мной, оба exit 0) и шаг `script-tests` внутри `yarn verify`.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| VER-01 | 01-02, 01-03, 01-04, 01-05 | SATISFIED | 12 исходных файлов выполняются Vitest в трёх workspace, `yarn verify` зелёный |
| VER-02 | 01-03, 01-06, 01-10, 01-14, 01-15 | SATISFIED | `yarn verify` = lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests; exit 0 |
| VER-03 | 01-09, 01-11, 01-15 | SATISFIED | `ci.yml` на PR, Corepack, `--immutable`, `yarn verify`, без deploy; run 37120717677 зелёный |
| VER-04 | 01-10, 01-15 | SATISFIED | только `yarn.lock`, защита в verify и в CI перед install |
| VER-05 | 01-01, 01-03, 01-05, 01-07, 01-09, 01-11, 01-16 | SATISFIED | одноразовый PostgreSQL через `pg_ctl`, сервис `postgres:17` в CI, guard на каждом пути БД |
| VER-06 | 01-13 | SATISFIED | примеры только с плейсхолдерами, шаг `env-contract` |
| VER-07 | 01-13 | SATISFIED | README, README сервера, AGENTS.md; прочтение новичком закрыто в 01-UAT |
| DRZ-01 | 01-05, 01-08, 01-12 | SATISFIED | `chain-vs-schema` ok, сравнение с продом выполнено (D-07) |
| DRZ-02 | 01-02, 01-08 | SATISFIED | снимок 0020, SQL побайтово равны базе, `generate-no-diff` |
| DRZ-03 | 01-08, 01-15 | SATISFIED | `check-migrations` с нуля в `yarn verify` и в CI |

VER-08 в фазу 1 не входит: 2026-10-03 пользователь перенёс его в фазу 6 (REQUIREMENTS.md, Pending). Он не осиротел и не должен проверяться здесь. Все 10 ID фазы 1 заявлены хотя бы одним планом, лишних ID, привязанных к фазе 1, нет.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| файлы фазы 1 и новые файлы фазы 2 из `git status` | — | `TBD`/`FIXME`/`XXX` | — | не найдено |
| app/web, app/server | — | предупреждения oxlint (не ошибки) | Info | допустимо по D-12, lint завершается успешно |
| scripts/check-migrations.mjs, документация | — | нет описанной процедуры добавления 0021 в `migrations-manifest.json` (sha256, `when`, `breakpoints`) | Info | Fails closed: `yarn verify` отклонит миграцию без записи в манифесте. Автору первой миграции фазы 3 и далее придётся править манифест вручную, стоит описать это в `app/server/README.md` |
| 01-SCHEMA-DIFF.md | — | в `__drizzle_migrations` на проде 0000-0013 хранят теги, а не sha256, плюс строка-сирота `0010_test_drafts` | Info | Не блокирует «безопасно расширять»: мигратор drizzle-orm 0.45.3 читает только последний `created_at`. Нормализацию таблицы решает Milestone 2 |
| WR-04 | — | запасной путь `web/public/uploads` отказывает только в изолированном режиме | Info | Перенос на локальный драйвер отложен до фазы 7 (ADR-0004) |
| WR-05, IN-01..07 | — | отложенные замечания ревью | Info | причины в 01-REVIEW-DISPOSITION.md |
| CI на текущем дереве | — | CI не запускался после изменений фазы 2 | Warning (информационно) | Не пробел фазы 1: поведение CI определяют файлы, не менявшиеся относительно HEAD `7a6f95a`, а локально `yarn install --immutable` и `yarn verify` зелёные. Первый push фазы 2 даст свежий прогон |

### Human Verification Required

Нет открытых пунктов. Семь пунктов предыдущего отчёта закрыты в 01-UAT.md (7/7 pass, 2026-10-03): README для новичка, повторный CI (run 37120717677), холодный кэш (run 37114466556), порядок одобрения пинов, подтверждение запретов, SIGINT-остановка `yarn e2e`, остановка `yarn verify` на первом упавшем шаге. Эти ручные прогоны я не повторял: файлы `scripts/verify.mjs`, `scripts/e2e.mjs` и `ci.yml` на текущем дереве идентичны тем, на которых шёл UAT (diff относительно HEAD пуст).

### Gaps Summary

Пробелов нет. Все 5 критериев roadmap и все 10 требований фазы 1 подтверждены кодом на текущем дереве:

- Одна команда `yarn verify` запускает lockfile, env-contract, docs-commands, ci-workflow, format-check, lint/typecheck/Vitest трёх workspace, полную проверку миграций и тесты скриптов на одноразовом PostgreSQL 17. На текущем дереве она проходит.
- Тот же шаг работает в read-only CI, который был зелёным на pull_request-прогоне для HEAD `7a6f95a` (run 37120717677). CI на текущем дереве с изменениями фазы 2 ещё не запускался.
- `yarn.lock` остаётся единственным lockfile; пины инструментария фазы 1 не изменились в манифестах после правок фазы 2.
- Применённые миграции 0000-0020 побайтово равны базе до фазы; цепочка с нуля строит ровно форму `schema.ts`, `drizzle-kit generate` даёт пустой diff.

Изменения фазы 2 (`package.json`, `yarn.lock`, `app/web/lib/mdx/*`, новые тесты) регрессий фазы 1 не вызвали: ни один must-have фазы 1 не изменил статус.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).

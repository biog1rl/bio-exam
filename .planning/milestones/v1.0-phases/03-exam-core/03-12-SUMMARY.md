---
phase: 03-exam-core
plan: 12
subsystem: exam-core-wiring
tags: [workspace-package, vercel, ci, e2e, telemetry, attempt-result, EXAM-01, EXAM-05, D-02, D-04, D-17]
requires: [03-01, 03-03]
provides:
  - "@bio-exam/server зависит от @bio-exam/exam-core (workspace:*)"
  - "public.ts берёт AnswerValueSchema, TelemetryMapSchema, mergeTelemetryMaps и SubmitResultSchema из пакета; конверты SubmitAnswersSchema и SaveDraftAnswerSchema остаются в файле"
  - "сборка exam-core после rbac в app/server/vercel-build.cjs, app/server/vercel-build.sh, buildCommand app/web/vercel.json, шаге 1 scripts/e2e.mjs и job build в ci.yml с проверкой dist"
affects: [03-04, 03-05, 03-09, 03-13]
tech-stack:
  added: []
  patterns: ["сборка exam-core идёт за сборкой rbac во всех явных местах сборки пакетов"]
key-files:
  created: []
  modified:
    - app/server/package.json
    - yarn.lock
    - app/server/src/routes/tests/public.ts
    - app/server/vercel-build.cjs
    - app/server/vercel-build.sh
    - app/web/vercel.json
    - scripts/e2e.mjs
    - .github/workflows/ci.yml
    - scripts/check-ci-workflow.mjs
  deleted:
    - app/server/src/lib/tests/telemetry.ts
    - app/server/src/lib/tests/telemetry.test.ts
    - app/server/src/lib/tests/submit-result.ts
decisions:
  - "app/server/vercel-build.sh (не вызывается: app/server/vercel.json запускает vercel-build.cjs) тоже получил сборку exam-core после rbac: must_have требует сборку пакета везде, где явно собирается rbac"
metrics:
  duration: "~15 мин"
  completed: 2026-10-04
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 4000
  tasks: 2
  commits: 0
status: complete
deferred_human_gate: true
---

# Phase 3 Plan 12: подключение сервера к @bio-exam/exam-core и сборка пакета в прод, e2e и CI Summary

Сервер импортирует слияние телеметрии, схему значения ответа, схему телеметрии и схему результата попытки из `@bio-exam/exam-core`, три серверные копии удалены. Пакет собирается после rbac в обеих прод-сборках Vercel, в `yarn e2e` и в job `build` CI, где за сборкой идёт `node scripts/check-exam-core-dist.mjs`. HTTP-характеризация 03-01 зелёная, файл не менялся.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` при изменениях в коде отражает это правило, а не потерю работы.

## Выполнено

**Task 1 (tracer): сервер на пакете, копии удалены, прод-сборка сервера.**
- `app/server/package.json`: `"@bio-exam/exam-core": "workspace:*"` перед rbac; `yarn install`.
- `public.ts`: один импорт `{ AnswerValueSchema, mergeTelemetryMaps, SubmitResultSchema, TelemetryMapSchema } from '@bio-exam/exam-core'`, удалены импорты `../../lib/tests/submit-result.js` и `../../lib/tests/telemetry.js`, удалены локальные `SubmitAnswerValueSchema` и `TelemetrySchema`. В `SubmitAnswersSchema` и `SaveDraftAnswerSchema` заменены только имена схем полей (`answers`/`value`, `telemetry`); форма конвертов, `superRefine` и код маршрутов не менялись. `import { z } from 'zod'` остаётся для конвертов.
- Удалены `app/server/src/lib/tests/telemetry.ts`, `telemetry.test.ts`, `submit-result.ts` (через `rm`, не `git rm`).
- `app/server/vercel-build.cjs`: блок `=== Building @bio-exam/exam-core ===` и `run('yarn workspace @bio-exam/exam-core build', rootDir)` между rbac и server.
- `yarn oxfmt` по трём файлам; импорт пакета стоит отдельной группой перед `drizzle-orm`, как импорты `@bio-exam/rbac` в других файлах сервера.
- Tracer проверен целиком: сборка пакета, характеризация, typecheck и прод-сборка сервера прошли один за другим, потом начат Task 2.

**Task 2: проводка в web Vercel, e2e, CI.**
- `app/web/vercel.json` `buildCommand`: `yarn --cwd ../.. workspace @bio-exam/rbac build && yarn --cwd ../.. workspace @bio-exam/exam-core build && yarn build:dev`.
- `scripts/e2e.mjs`: шаг `build packages/exam-core` сразу после rbac; три существующие строки комментариев (шапка «Порядок», флаг `--seed-only`, пояснение к шагу 1) переписаны на месте и называют оба пакета, новых строк комментариев нет.
- `.github/workflows/ci.yml`, job `build`: `Build exam-core` и `Check exam-core dist` между `Check rbac dist` и `Build server`.
- `scripts/check-ci-workflow.mjs`: в `JOB_ORDER.build` записи `yarn workspace @bio-exam/exam-core build` и `check-exam-core-dist` между `check-rbac-dist` и сборкой server (oxfmt перенёс первую запись на несколько строк по длине).

## codegraph impact (D-17)

`codegraph impact mergeTelemetryMaps`, определение `app/server/src/lib/tests/telemetry.ts:3`:

```
app/server/src/lib/tests/telemetry.ts       function mergeTelemetryMaps:3
app/server/src/lib/tests/telemetry.test.ts  file telemetry.test.ts:1
app/server/src/routes/tests/public.ts       file public.ts:1
                                            route PATCH /api/tests/public/tests/:id/sessions/:sessionId/answers:639
                                            route POST /api/tests/public/tests/:id/submit:695
app/server/src/routes/index.ts              file index.ts:1
```

Второе определение, `app/web/components/tests/telemetry.ts:9` (TestRunner, TestPageClient), этим планом не тронуто: web переходит на пакет в 03-04.

`codegraph impact SubmitResultSchema`, определение `app/server/src/lib/tests/submit-result.ts:13`:

```
app/server/src/lib/tests/submit-result.ts   constant SubmitResultSchema:13
app/server/src/routes/tests/public.ts       file public.ts:1
app/server/src/routes/index.ts              file index.ts:1
```

Других серверных потребителей нет: оба маршрута (PATCH черновика и POST submit) живут в `public.ts`, `routes/index.ts` только монтирует роутер.

## sha256 файла характеризации

```
до:    693afbc7e23ea24c1c6e91dde187053b5d7b81fd089003d68ae92ba19e0fecdc  app/server/src/routes/tests/exam-flow.test.ts
после: 693afbc7e23ea24c1c6e91dde187053b5d7b81fd089003d68ae92ba19e0fecdc  app/server/src/routes/tests/exam-flow.test.ts
```

## Проверки

- `yarn workspace @bio-exam/exam-core build && node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests/exam-flow.test.ts`: `Test Files 1 passed (1)`, `Tests 55 passed (55)`, в том числе таблица J.
- `yarn workspace @bio-exam/server typecheck`: код 0, `error TS` нет. Тип `TelemetryMap` пакета и `db/schema.ts` совпадают, приведения не понадобились.
- `cd app/server && node vercel-build.cjs`: код 0; в выводе по порядку `=== Building @bio-exam/rbac ===`, `=== Building @bio-exam/exam-core ===`, `=== Building @bio-exam/server ===`, `=== Build completed successfully! ===`. В собранном `dist/routes/tests/public.js` импорт `from '@bio-exam/exam-core'`; `node` из `app/server` разрешает пакет и видит 10 экспортов; `dist/lib/tests` не содержит удалённых модулей.
- `node scripts/check-ci-workflow.mjs`: `check-ci-workflow: OK`; `node --test scripts/check-ci-workflow.test.mjs`: 31 pass, 0 fail. Проба на изменённом в памяти ci.yml: без `check-exam-core-dist` → `job build: missing check-exam-core-dist`; сборка exam-core после проверки dist → `must come before check-exam-core-dist`.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs`: `exam-core dist OK: index.js, index.cjs, index.d.ts, index.d.cts; 10 экспортов в ESM и CJS`.
- Прод-сборка web по `buildCommand` из `app/web/vercel.json` с плейсхолдерами (`DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/test_ci AUTH_JWT_SECRET=ci-build-secret API_ORIGIN=http://127.0.0.1:4000 SESSION_COOKIE_NAME=ci_session NEXT_IGNORE_INCORRECT_LOCKFILE=1 NEXT_TELEMETRY_DISABLED=1`): код 0; собраны rbac, exam-core, затем `✓ Compiled successfully`; `Failed to compile` и `Invalid server env` нет. Сеть не понадобилась.
- `yarn e2e --seed-only`: код 0; шаги `[e2e] build packages/rbac`, `[e2e] build packages/exam-core`, временная база `test_e2e_*`, migrate, `e2e-seed: users=8 tests=8 questions=16 prompts=16`, `--seed-only: stopping after the seed`.
- `yarn verify`: `yarn verify: OK`, все восемь шагов passed. Тесты: exam-core 65 passed (4 файла), rbac 2, web 171 passed и 2 expected fail, server 247 passed и 6 expected fail (11 файлов; на один файл меньше из-за удалённого `telemetry.test.ts`, его строки живут в `packages/exam-core/src/telemetry.test.ts` с 03-03).
- Приёмка Task 1: три файла отсутствуют; `rg -n "lib/tests/telemetry|submit-result" app/server/src` пусто; проверка `const (SubmitAnswerValueSchema|TelemetrySchema) =` выходит с 0; `public.ts` содержит `from '@bio-exam/exam-core'`, `SubmitAnswersSchema` и `SaveDraftAnswerSchema`.
- `git status --porcelain --untracked-files=all -- app/server/src/lib/tests`: ровно ` D submit-result.ts`, ` D telemetry.test.ts`, ` D telemetry.ts`.

**Дельта yarn.lock** (снимок до `yarn install` против файла после):

```
246c246
< "@bio-exam/exam-core@workspace:packages/exam-core":
---
> "@bio-exam/exam-core@workspace:*, @bio-exam/exam-core@workspace:packages/exam-core":
276a277
>     "@bio-exam/exam-core": "workspace:*"
```

Первая правка: Yarn добавил дескриптор `workspace:*` к ключу существующей записи пакета, вторая: зависимость в записи `@bio-exam/server`. Новых внешних пакетов нет; `zod@npm:^3.24.3` один, версия 3.25.76.

**Рабочее дерево.** Сравнение `git status --short --untracked-files=all` до и после плана: новые строки только по путям плана (`ci.yml`, три удаления в `lib/tests`, `public.ts`, `vercel-build.cjs`, `vercel-build.sh`, `app/web/vercel.json`, `check-ci-workflow.mjs`, `e2e.mjs`). Сборки ничего неотслеживаемого не оставили (`dist`, `.next` игнорируются).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Сборка exam-core в `app/server/vercel-build.sh`**
- **Found during:** Task 2, поиск всех мест сборки rbac (`rg "@bio-exam/rbac build|packages/rbac|check-rbac-dist"`)
- **Issue:** `vercel-build.sh` собирает rbac перед `yarn build` сервера, но не входил в список файлов плана. Сейчас скрипт нигде не вызывается (`app/server/vercel.json` запускает `node vercel-build.cjs`), но при запуске он собрал бы сервер без dist пакета, и `dist/app.js` упал бы на импорте `@bio-exam/exam-core`.
- **Fix:** строка `yarn workspace @bio-exam/exam-core build` сразу после сборки rbac, окончания строк CRLF сохранены, комментариев не добавлено.
- **Files modified:** `app/server/vercel-build.sh`

Остальное выполнено как написано.

## Не тронуто, но устарело

- `app/web/lib/tests/types.ts:54` и `:66`: комментарии «Shape mirrors SubmitResultSchema in app/server/src/lib/tests/submit-result.ts» указывают на удалённый файл. План 03-04 переводит эти типы на пакет и удаляет пометки о ручной синхронизации.
- `plans/011-architecture-deepening.md` упоминает удалённые серверные файлы как часть исходного состояния; документ планирования, не правился.

## Authentication Gates

Нет.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности. T-3-04: сборка пакета есть во всех местах явной сборки rbac, обе прод-сборки воспроизведены локально. T-3-06: схемы тела submit и черновика взяты из пакета дословно, характеризация зелёная, sha256 файла не изменился. T-3-SC: в lockfile только ссылки на воркспейс.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял.

1. Закоммитить изменения плана (список ниже) и запушить ветку из своего терминала.
2. CI на запушенном HEAD: job `build` проходит шаги `Build exam-core` и `Check exam-core dist` (строка `exam-core dist OK: … 10 экспортов в ESM и CJS`), затем `Build server` и smoke `/healthz`; jobs `verify` и `e2e` зелёные.
3. Preview-деплой Vercel (можно вместе с отложенным preview фазы 2 из `STATE.md`, Deferred Verification):
   - проект server: в логе сборки есть `=== Building @bio-exam/exam-core ===` и `=== Build completed successfully! ===`, статус Ready; `GET <server-preview>/healthz` возвращает `{"ok":true}`;
   - проект web: в логе `buildCommand` собирает rbac, затем exam-core, затем `yarn build:dev`, статус Ready;
   - на preview пройти тест студентом до submit и убедиться, что результат попытки показан (сервер разбирает тело и ответ схемами пакета).

## Файлы к коммиту

- `app/server/package.json`: только строка `"@bio-exam/exam-core": "workspace:*"` относится к плану; версии express, multer, sharp меняла фаза 2
- `yarn.lock`: только две строки воркспейса выше; запись пакета добавил 03-03, остальные правки принадлежат фазе 2
- `app/server/src/routes/tests/public.ts`
- удаление `app/server/src/lib/tests/telemetry.ts`, `app/server/src/lib/tests/telemetry.test.ts`, `app/server/src/lib/tests/submit-result.ts`
- `app/server/vercel-build.cjs`
- `app/server/vercel-build.sh`
- `app/web/vercel.json`
- `scripts/e2e.mjs`
- `.github/workflows/ci.yml`
- `scripts/check-ci-workflow.mjs`

Сервер импортирует пакет, поэтому коммит должен включать и сам пакет из 03-03 (`packages/exam-core/`, `scripts/check-exam-core-dist.mjs`), иначе сборка на Vercel и в CI не найдёт `@bio-exam/exam-core`.

Метаданные планирования (`.planning/phases/03-exam-core/03-12-SUMMARY.md`, `STATE.md`, `ROADMAP.md`) — отдельно.

## Self-Check: PASSED

Изменённые файлы на месте, три удалённых отсутствуют; характеризация 55/55, typecheck, обе прод-сборки, `yarn e2e --seed-only` и `yarn verify: OK` прошли; sha256 характеризации совпадает; коммиты намеренно не создавались (правило пользователя).

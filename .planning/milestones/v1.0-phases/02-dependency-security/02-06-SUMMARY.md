---
phase: 02-dependency-security
plan: 06
subsystem: dependencies
tags: [dependency-security, group-2, next, next-mdx, postcss, sharp, proxy, yarn-lock]
status: complete
requires: [02-03, 02-04, 02-05]
provides: [group-2-applied]
affects: [02-07, 02-08, 02-09]
key-files:
  created: []
  modified:
    - app/web/package.json
    - yarn.lock
key-decisions:
  - "next и @next/mdx подняты до 16.3.8 (одобренные версии 02-04), правок совместимости в next.config.ts и proxy.ts не понадобилось"
  - "postcss 8.5.6 у @tailwindcss/postcss снят через yarn up -R postcss (слился с 8.5.28); у Next своя точная зависимость postcss 8.5.23"
  - "До 02-07 в дереве две версии sharp: 0.35.5 у next и 0.34.5 у сервера (и @types/sharp)"
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 9000
  tasks: 2
  commits: 0
estimate_actuals_note: коммитов нет по правилу пользователя; actuals.tokens оценочные (chars/4 по двум строкам манифеста и сводке, yarn.lock в расчёт не входит)
completed: 2026-10-03
---

# Phase 2 Plan 06: Группа 2 (next и @next/mdx 16.3.8) Summary

**Next и @next/mdx подняты с 16.2.1 до одобренной 16.3.8 без правок кода: вложенный postcss 8.4.31 ушёл, матрица `@proxy` на 16.3.8 зелёная с теми же статусами, next исчез из прямого production-аудита.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` отражает это правило; `plan_head_before` и `plan_head_after` совпадают.

## Performance

- **Started:** 2026-10-03T15:04:32Z
- **Completed:** 2026-10-03T15:12Z
- **Tasks:** 2
- **Files modified:** 2

## Что изменено

| Файл | Изменение |
| --- | --- |
| `app/web/package.json` | `next` `^16.2.1` -> `^16.3.8`, `@next/mdx` `^16.2.1` -> `^16.3.8` |
| `yarn.lock` | дерево Группы 2 (next 16.3.8 и его транзитивы, postcss, sharp 0.35.5 у next) |

`app/web/next.config.ts` и `app/web/proxy.ts` не менялись (`git status` по ним пуст): сборка, typecheck и тесты на 16.3.8 прошли без правок совместимости. Спека `e2e/tests/proxy-protection.spec.ts` не менялась (байт-в-байт, хеш совпал).

Файлы, готовые к коммиту (вместе с изменениями 02-05, которые тоже в рабочем дереве): `app/web/package.json`, `yarn.lock`.

## Итоговые версии

| Пакет | Версия в `yarn.lock` | Одобрено (`## approved-versions` 02-04) |
| --- | --- | --- |
| next | 16.3.8 | 16.3.8 |
| @next/mdx | 16.3.8 | 16.3.8 |
| postcss | 8.5.23 (точная зависимость next), 8.5.28 (app/web, vite, @tailwindcss/postcss) | 8.5.28 (прямая) |
| sharp | 0.35.5 (у next, `^0.35.4`, optional), 0.34.5 (app/server `^0.34.5`, @types/sharp `*`) | 0.35.5 |

Проверка approved-versions: `installed = approved: next,@next/mdx`.

### Две версии sharp до 02-07

```
sharp@0.35.5  <- next@16.3.8 (npm:^0.35.4)
sharp@0.34.5  <- @bio-exam/server (npm:^0.34.5), @types/sharp@0.32.0 (npm:*)
```

Сводится в одну 0.35.x в 02-07 вместе с multer. Аудит по sharp сейчас указывает только на 0.34.5 (`Vulnerable Versions` `<0.35.0` и `<0.35.4`, `Tree Versions` `["0.34.5"]`); 0.35.5 у next не отмечен.

## Проверки (результаты)

| Проверка | Результат |
| --- | --- |
| Манифест и установленные версии | `next 16.3.8 @next/mdx 16.3.8`, код 0 |
| postcss не ниже 8.5.18 | `postcss 8.5.23,8.5.28 sharp 0.34.5,0.35.5`, код 0 (первый прогон до `yarn up -R postcss` упал на 8.5.6, см. отклонения) |
| approved-versions (app/web: next, @next/mdx) | `installed = approved: next,@next/mdx` |
| approved-versions после `yarn up -R postcss` (app/web: lodash, postcss, next, @next/mdx) | `installed = approved: lodash,postcss,next,@next/mdx` |
| Финальный `yarn install --immutable` после verify, сборок и e2e | код 0, YN0028 нет, lockfile не изменился |
| `yarn oxfmt app/web/package.json`, `yarn format:check` | зелёные |
| `yarn install --immutable` | код 0, YN0028 нет |
| `yarn verify` | `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests: passed; rbac 2 passed, web 57 passed + 5 expected fail, server 179 passed) |
| Сборка web по `buildCommand` Vercel (rbac build + `build:dev` с плейсхолдерами env) | код 0, `▲ Next.js 16.3.8 (Turbopack)`, `✓ Compiled successfully in 10.8s`, TypeScript прошёл, `ƒ Proxy (Middleware)` в выводе маршрутов |
| `cd app/server && node vercel-build.cjs` | код 0, `=== Build completed successfully! ===` |
| `yarn e2e` | код 0, `108 passed`; 6 ожидаемых падений известных дефектов (D5 `authoring.spec.ts`, D2 и D1 `review.spec.ts`, по два проекта) как были; WebServer на `Next.js 16.3.8` |
| Спека proxy без ожидаемо падающих | `proxy spec has no expected-fail` |
| Хеш спеки proxy (02-03) | `proxy spec unchanged` (сырой sha256 совпал) |
| Инварианты `proxy.ts` против HEAD | `proxy invariants unchanged` |
| sha256 `untrusted.test.ts` (02-01) | `sha256 matches: app/web/lib/mdx/untrusted.test.ts` |
| sha256 `uploads.test.ts`, `sharp-runtime.test.ts`, `http.ts` (02-02) | совпадают с записанными, не менялись |
| Прямой production-аудит | `remaining direct prod: multer,next-mdx-remote,sharp`, next нет |

## Матрица proxy: Next 16.2.1 (02-03) против 16.3.8

`yarn e2e`: 68 тестов `@proxy` (34 x 2 проекта) passed, 0 failed. Спека закрепляет точные статусы (`LOGIN_REDIRECT_STATUS = 307`, `NORMALIZE_REDIRECT_STATUS = 308`) и Location, поэтому зелёный прогон означает совпадение статусов.

| Группа вариантов | 16.2.1 | 16.3.8 |
| --- | --- | --- |
| анонимный `GET /dashboard` | 307, `/login?callbackUrl=%2Fdashboard` | то же |
| 8 вариантов заголовков и `?_rsc` на `/dashboard` и `/tests/biology/cell` (16 тестов) | 307 на `/login` с callbackUrl | то же |
| 10 динамических маршрутов | 307 на `/login` с тем же путём в callbackUrl | то же |
| `/%64ashboard`, `/DASHBOARD`, `/tests/%5BtopicSlug%5D/%5BtestSlug%5D` | 307 на `/login` | то же |
| `/dashboard/`, `//dashboard` | 308 на `/dashboard`, затем 307 на `/login` | то же |
| `/login`, `/invite/some-token` | 200 без Location | то же |

Изменений статусов нет, обходов нет; переключать `test.fail` было нечего (в 02-03 их не было).

## Отклонения от плана и наблюдения

Правил 1-4 не потребовалось, checkpoint-ов не было.

1. **postcss 8.5.6 оставался после 02-05.** Первый прогон проверки postcss после `yarn add` упал: `postcss [ '8.5.23', '8.5.6', '8.5.28' ]`. Копия 8.5.6 разрешала `postcss@npm:^8.4.41` у `@tailwindcss/postcss@4.1.18` и была в lockfile ещё до этого плана (её не было в выводе 02-05, потому что проверка 02-05 смотрела только прямой дескриптор). По шагу 2 плана выполнен `yarn up -R postcss`: дескриптор `^8.4.41` слился с `^8.5.28` в 8.5.28, 8.5.6 удалён, прямая версия осталась 8.5.28 (последняя в реестре). Повторная проверка зелёная.
2. **Next 16.3.8 тянет точный `postcss@8.5.23`, а не 8.5.28.** Это выше порога 8.5.18, рекурсивный аудит postcss больше не показывает.
3. **YN0057 `@bio-exam/web: Resolutions field will be ignored`.** Есть в каждой команде, было и в логе 02-05 (19 строк); к группе не относится.
4. **YN0086** (peer dependencies) — общая строка, как в 02-05.

## yarn.lock delta

Добавлено 43 разрешения, удалено 14 (относительно `02-06-yarn.lock.before`).

```
+ @emnapi/runtime@1.11.3
+ @img/colour@1.1.0
+ @img/sharp-darwin-arm64@0.35.5
+ @img/sharp-darwin-x64@0.35.5
+ @img/sharp-freebsd-wasm32@0.35.5
+ @img/sharp-libvips-darwin-arm64@1.3.4
+ @img/sharp-libvips-darwin-x64@1.3.4
+ @img/sharp-libvips-linux-arm64@1.3.4
+ @img/sharp-libvips-linux-arm@1.3.4
+ @img/sharp-libvips-linux-ppc64@1.3.4
+ @img/sharp-libvips-linux-riscv64@1.3.4
+ @img/sharp-libvips-linux-s390x@1.3.4
+ @img/sharp-libvips-linux-x64@1.3.4
+ @img/sharp-libvips-linuxmusl-arm64@1.3.4
+ @img/sharp-libvips-linuxmusl-x64@1.3.4
+ @img/sharp-linux-arm64@0.35.5
+ @img/sharp-linux-arm@0.35.5
+ @img/sharp-linux-ppc64@0.35.5
+ @img/sharp-linux-riscv64@0.35.5
+ @img/sharp-linux-s390x@0.35.5
+ @img/sharp-linux-x64@0.35.5
+ @img/sharp-linuxmusl-arm64@0.35.5
+ @img/sharp-linuxmusl-x64@0.35.5
+ @img/sharp-wasm32@0.35.5
+ @img/sharp-webcontainers-wasm32@0.35.5
+ @img/sharp-win32-arm64@0.35.5
+ @img/sharp-win32-ia32@0.35.5
+ @img/sharp-win32-x64@0.35.5
+ @next/env@16.3.8
+ @next/mdx@16.3.8
+ @next/swc-darwin-arm64@16.3.8
+ @next/swc-darwin-x64@16.3.8
+ @next/swc-linux-arm64-gnu@16.3.8
+ @next/swc-linux-arm64-musl@16.3.8
+ @next/swc-linux-x64-gnu@16.3.8
+ @next/swc-linux-x64-musl@16.3.8
+ @next/swc-win32-arm64-msvc@16.3.8
+ @next/swc-win32-x64-msvc@16.3.8
+ @swc/helpers@0.5.23
+ next@16.3.8
+ postcss@8.5.23
+ semver@7.8.5
+ sharp@0.35.5
- @next/env@16.2.1
- @next/mdx@16.2.1
- @next/swc-darwin-arm64@16.2.1
- @next/swc-darwin-x64@16.2.1
- @next/swc-linux-arm64-gnu@16.2.1
- @next/swc-linux-arm64-musl@16.2.1
- @next/swc-linux-x64-gnu@16.2.1
- @next/swc-linux-x64-musl@16.2.1
- @next/swc-win32-arm64-msvc@16.2.1
- @next/swc-win32-x64-msvc@16.2.1
- @swc/helpers@0.5.15
- next@16.2.1
- postcss@8.4.31
- postcss@8.5.6
```

### Транзитивы вне таблицы 02-04

Принимаются по политике пользователя от 2026-10-03 (02-05): их требуют одобренные пакеты, lifecycle-скриптов нет. Проверка `npm view <pkg>@<ver> scripts` по всем 43 добавленным версиям: `preinstall`, `install`, `postinstall` нет ни у одной.

| Пакет@версия | Кто требует | Скрипты в реестре |
| --- | --- | --- |
| `@next/env@16.3.8`, `@next/swc-*@16.3.8` (8 платформ) | next@16.3.8 (точные версии) | у `@next/env` только сборочные (`dev`, `build`, `types`, `build:source`, `prebuild:source`, `pack-for-isolated-tests`), у `@next/swc-*` нет |
| `@swc/helpers@0.5.23` | next@16.3.8 (`0.5.23`) | `build` |
| `postcss@8.5.23` | next@16.3.8 (`8.5.23`) | нет |
| `@img/colour@1.1.0` | sharp@0.35.5 (`^1.1.0`) | `build:cjs`, `build:dts`, `build`, `test` |
| `semver@7.8.5` | sharp@0.35.5 (`^7.8.5`) | `lint`, `snap`, `test`, `eslint`, `lintfix`, `postlint`, `posttest`, `template-oss-apply` |
| `@img/sharp-*@0.35.5` (16 платформенных пакетов), `@img/sharp-libvips-*@1.3.4` (10) | sharp@0.35.5 (optional, по платформам) | нет |
| `@emnapi/runtime@1.11.3` | `@img/sharp-wasm32@0.35.5` (`^1.11.3`) | `build` |

`sharp@0.35.5` есть в таблице 02-04; сюда его тянет next@16.3.8 (`^0.35.4`, optional). В реестре у него только сборочные и тестовые скрипты (`build`, `test`, `lint`, `docs-*`, `package-*`), установочных нет.

## YN0007

Нет. В `02-06-yarn.log` (команды `yarn workspace @bio-exam/web add next@^16.3.8 @next/mdx@^16.3.8`, `yarn up -R postcss`, `yarn install --immutable`) нет YN0007, YN0002 и YN0028. Пакетов с установочными lifecycle-скриптами в дельте нет.

## Свежий срез аудита после Группы 2

`yarn npm audit --all --environment production --severity high --json` (прямые зависимости): 9 записей, остались **multer, next-mdx-remote, sharp**. После Группы 1 было 24 записи по 4 пакетам (multer, next, next-mdx-remote, sharp); next ушёл.

`yarn npm audit --all --recursive --severity high --json`: 26 записей, 10 имён: @fastify/busboy, braces, http-cache-semantics, multer, next-mdx-remote, path-to-regexp, serialize-javascript, sharp, tar, undici. После Группы 1 было 43 записи, 12 имён: ушли next и postcss.

`yarn npm audit --all --recursive --environment production --severity high --json`: 20 записей, 6 имён: http-cache-semantics, multer, next-mdx-remote, serialize-javascript, sharp, tar. После Группы 1 было 37 записей, 8 имён.

Остаток для следующих групп: sharp 0.34.5 сервера и multer (02-07), next-mdx-remote (02-08). Вне диапазона, для 02-09: tar 6.2.1 (bcrypt), serialize-javascript, http-cache-semantics, braces, undici + @fastify/busboy, path-to-regexp 6.2.1 (только `@vercel/node`).

## Промежуточные артефакты (вне git)

`.planning/phases/02-dependency-security/02-06-yarn.lock.before`, `.planning/phases/02-dependency-security/02-06-yarn.log`.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: изменения только в манифесте и lockfile, `proxy.ts` и `next.config.ts` не менялись.

## Сверка оркестратором (2026-10-04)

Независимо от исполнителя: дельта `yarn.lock` относительно `02-06-yarn.lock.before` — 43 новых `name@version`, 14 ушедших. Вне таблицы 02-04: `@emnapi/runtime@1.11.3`, `@img/colour@1.1.0`, `@img/sharp-*@0.35.5` и `@img/sharp-libvips-*@1.3.4` (нативные бинарники sharp 0.35.5, optional у next), `@next/env@16.3.8`, `@next/swc-*@16.3.8`, `@swc/helpers@0.5.23`, `postcss@8.5.23` (точная зависимость next), `semver@7.8.5`. Lifecycle-скриптов (preinstall/install/postinstall) нет ни у одной из 43 версий (`npm view`). По политике пользователя от 2026-10-03 приняты без checkpoint. Хеши тестов 02-01/02-02 и спеки proxy совпадают с записанными; `app/web/proxy.ts` и `app/web/next.config.ts` не изменены (`git diff --quiet HEAD`).

## Self-Check: PASSED

- FOUND: `app/web/package.json` (`"next": "^16.3.8"`, `"@next/mdx": "^16.3.8"`), `yarn.lock`
- `git status --short`: изменены `app/server/package.json`, `app/web/package.json`, `packages/rbac/package.json`, `yarn.lock` (02-05 и 02-06), untracked тесты прошлых планов не тронуты (sha256 совпадают)
- Коммитов нет по правилу пользователя, сверять нечего; HEAD `7a6f95a` не менялся

---
*Phase: 02-dependency-security*
*Completed: 2026-10-03*

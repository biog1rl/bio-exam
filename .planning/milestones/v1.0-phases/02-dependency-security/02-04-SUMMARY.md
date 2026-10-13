---
phase: 02-dependency-security
plan: 04
subsystem: dependencies
tags: [dependency-security, supply-chain, checkpoint]
status: complete
requires: []
provides: [approved-versions]
affects: [02-05, 02-06, 02-07, 02-08, 02-09]
key-files:
  created: []
  modified: []
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 40000
  tasks: 2
  commits: 0
estimate_actuals_note: репозиторий не менялся, коммитов нет; actuals.tokens оценочные, файлов репозитория нет
completed: 2026-10-03
---

# Phase 2 Plan 04: сверка версий и одобрение таблицы

**Статус:** complete. Task 1 выполнен, Task 2 (блокирующий checkpoint) одобрен пользователем 2026-10-03 («Одобрить как есть»). Ни один `yarn add`, `yarn up`, `yarn remove` не выполнялся. Файлы репозитория не изменены. Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве отсутствуют.

Дата сверки: 2026-10-03 (UTC). Источники: `yarn npm audit` (снимок до апгрейда), `api.github.com/advisories/<GHSA>` (33 запроса, все 200), реестр npm (`npm view`).

## Свежий аудит (до апгрейда)

- `yarn npm audit --all --recursive --severity high --json`: 110 записей, 29 имён пакетов.
- `yarn npm audit --all --environment production --severity high --json` (только прямые зависимости воркспейсов): 29 записей по 7 пакетам: next, multer, sharp, tinymce, lodash, next-mdx-remote, @tiptap/core (rbac).
- `yarn npm audit --all --recursive --environment production`: 27 имён пакетов (в production-граф входят и транзитивы pm2, bcrypt, webpack, express).
- Версии из первичных advisory совпали с D-01: более свежего стабильного патча в тех же линиях нет (16.3.8, 0.35.5, 2.4.0, 4.22.3, 6.0.0, 4.18.1, 8.5.28 — последние стабильные в своих линиях на 2026-10-03). Следующий минор или мажор (Next 16.4, express 5) не предлагается (допущение DEP-01).
- Advisory Drizzle GHSA-gpj5-g38j-94v9 (`drizzle-orm < 0.45.2`, first patched 0.45.2): закрыт, установлена 0.45.3 (`drizzle-kit` 0.31.11).
- Проверка целевых версий: `GET /advisories?ecosystem=npm&affects=<пакет>@<версия>` возвращает 0 advisory для next@16.3.8, @next/mdx@16.3.8, sharp@0.35.5, multer@2.4.0, express@4.22.3, next-mdx-remote@6.0.0, lodash@4.18.1, postcss@8.5.28, path-to-regexp@0.1.13. Для контроля тот же запрос по multer@2.0.2 возвращает 8 advisory.

## Таблица версий (одобрена пользователем 2026-10-03)

Lifecycle-скрипты: `scripts.preinstall`, `scripts.install`, `scripts.postinstall`, `scripts.prepare`, `scripts.prepublish` из реестра. Во всех строках они пусты (ни одного нет). У sharp@0.35.5 в `scripts` только `build` и служебные (`lint*`, `test*`, `docs-*`, `package-*`); установочных хуков нет.

| Пакет | Воркспейс | Текущая -> целевая | Диапазон в манифесте | Дата публикации | repository.url | Lifecycle | Advisory (first patched) | Группа |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| next | app/web | 16.2.1 -> 16.3.8 | `^16.2.1` -> `^16.3.8` | 2026-09-30 | git+https://github.com/vercel/next.js.git | нет | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) critical (16.3.6); [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) и [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) critical (16.3.3); [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24), [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj), [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x), [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) (16.2.11); [GHSA-26hh-7cqf-hhc6](https://github.com/advisories/GHSA-26hh-7cqf-hhc6) (16.2.6); [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) (16.2.3); ещё 6 high (16.2.5): GHSA-8h8q-6873-q5fj, GHSA-mg66-mrh9-m8jx, GHSA-c4j6-fc7j-m34r, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f, GHSA-36qx-fr4f-26g5. Всего 15; максимум first patched 16.3.6, цель 16.3.8 выше | 2 |
| @next/mdx | app/web | 16.2.1 -> 16.3.8 | `^16.2.1` -> `^16.3.8` | 2026-09-30 | git+https://github.com/vercel/next.js.git | нет | собственных advisory нет; версия связана с next | 2 |
| sharp | app/server (и optional у next) | 0.34.5 -> 0.35.5 | `^0.34.5` -> `^0.35.5` | 2026-09-27 | git+https://github.com/lovell/sharp.git | нет | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) (0.35.0); [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) (0.35.4) | 2 (общий с next) / 3 (сервер) |
| multer | app/server | 2.0.2 -> 2.4.0 | `^2.0.2` -> `^2.4.0` | 2026-09-14 | git+https://github.com/expressjs/multer.git | нет | [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) (2.3.0); [GHSA-72gw-mp4g-v24j](https://github.com/advisories/GHSA-72gw-mp4g-v24j) (2.2.0); [GHSA-5528-5vmv-3xc2](https://github.com/advisories/GHSA-5528-5vmv-3xc2) (2.1.1); [GHSA-xf7r-hgr6-v32p](https://github.com/advisories/GHSA-xf7r-hgr6-v32p), [GHSA-v52c-386h-88mc](https://github.com/advisories/GHSA-v52c-386h-88mc) (2.1.0) | 3 |
| express | app/server | 4.22.1 (в lock) -> 4.22.3 | `^4.19.2` -> `^4.22.3` | 2026-09-14 | git+https://github.com/expressjs/express.git | нет | собственных advisory нет; 4.22.3 тянет `path-to-regexp ~0.1.13`, что закрывает [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) (`path-to-regexp < 0.1.13`, first patched 0.1.13) | 1 |
| next-mdx-remote | app/web | 5.0.0 -> 6.0.0 | `^5.0.0` -> `^6.0.0` | 2026-02-12 | git+https://github.com/hashicorp/next-mdx-remote.git | нет | [GHSA-g4xw-jxrg-5f6m](https://github.com/advisories/GHSA-g4xw-jxrg-5f6m) (6.0.0) | 4 |
| lodash | app/web | 4.17.23 -> 4.18.1 | `^4.17.21` -> `^4.18.1` | 2026-04-01 | git+https://github.com/lodash/lodash.git | нет | [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) (4.18.0) | 1 |
| postcss (devDependency) | app/web | 8.5.6 -> 8.5.28 | `^8.5.6` -> `^8.5.28` | 2026-09-03 | git+https://github.com/postcss/postcss.git | нет | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) (8.5.12); [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) (8.5.18). Вложенный postcss 8.4.31 у Next исчезает с next@16.3.8 (тянет 8.5.23) | 1 (прямой), 2 (вложенный у Next) |

Замечания к таблице:
- Репозитории из how-to-verify совпадают с `repository.url` реестра (vercel/next.js, lovell/sharp, expressjs/multer, expressjs/express, hashicorp/next-mdx-remote, lodash/lodash, postcss/postcss).
- Sharp: нативные бинарники приходят через `optionalDependencies` `@img/sharp-<платформа>@0.35.5` и `@img/sharp-libvips-*@1.3.4`. Проверено в реестре: у `@img/sharp-linux-x64`, `@img/sharp-darwin-arm64`, `@img/sharp-linuxmusl-x64`, `@img/sharp-win32-x64`, `@img/sharp-libvips-linux-x64`, `@img/sharp-libvips-darwin-arm64`, `@img/colour` нет `preinstall`/`install`/`postinstall`; repository — `lovell/sharp`, `lovell/sharp-libvips`, `lovell/colour`.
- Next 16.3.8: optional-зависимости `sharp ^0.35.4` и `@next/swc-*@16.3.8` (у `@next/swc-linux-x64-gnu`, `@next/swc-darwin-arm64` lifecycle-скриптов нет, repository `vercel/next.js`).
- `@types/sharp ^0.32.0` в `app/server` остаётся заглушкой; убирать ли его — на усмотрение 02-07 (typecheck должен остаться зелёным).
- Наблюдение вне плана: `bcrypt ^5.1.1` объявлен в `dependencies` `app/web`, тянет `@mapbox/node-pre-gyp` (tar 6.2.1) и node-gyp. D-06 его не удаляет; решение по остаточным advisory — в 02-09.

## Удаляются (D-06)

Поиск по репозиторию (без `yarn.lock`, `.planning`, `plans`, `docs`) находит эти имена только в `package.json`; scss-файлов нет; `postcss` config в `app/web/package.json` содержит один плагин `@tailwindcss/postcss`. Окончательное доказательство отсутствия использования — typecheck, сборка web, e2e в 02-05.

| Пакет | Воркспейс | Текущий диапазон | Что уходит вместе с ним |
| --- | --- | --- | --- |
| tinymce | app/web | `^8.1.2` (8.3.2) | прямое high GHSA-vg35-5wq7-3x7w, GHSA-q742-qvgc-gc2f, GHSA-v98h-vmpc-fpqv (first patched 8.5.1); DEP-01 выполняется удалением |
| pm2 | app/web | `^6.0.13` (6.0.14) | js-yaml 4.1.1, ws 7.5.10, basic-ftp 5.1.0, systeminformation 5.30.6 |
| gray-matter | app/web | `^4.0.3` | js-yaml 3.14.2 |
| postcss-cli | app/web | `^11.0.1` | picomatch 4.0.3 (через tinyglobby) в части цепочек |
| autoprefixer | app/web | `^10.4.21` | цепочка browserslist через autoprefixer (browserslist остаётся через webpack) |
| sass | app/web | `^1.93.2` (1.97.3) | immutable 5.1.4 |
| @tiptap/core | app/web | `^2.7.0` (2.27.2) | |
| @tiptap/pm | app/web | `^2.7.0` | markdown-it 14.1.0, linkify-it 5.0.0 |
| @tiptap/react | app/web | `2` | |
| @tiptap/core | packages/rbac | `^3.10.3` (3.18.0) | прямое high GHSA-j95f-988m-3j2f (`>=3.7.0 <3.30.5`, first patched 3.30.5); затрагивает DEP-04 для workspace `@bio-exam/rbac` |
| @tiptap/pm | packages/rbac | `^3.10.3` | |

Вместе с удалениями из графа уходят целиком: js-yaml (обе версии), basic-ftp, systeminformation, immutable, ws 7.5.10, linkify-it (расчёт по `yarn.lock` с исключением удаляемых корней).

## Транзитивы `yarn up -R` (в пределах диапазона зависимого)

Расчёт: достижимость из корней воркспейсов по `yarn.lock` после удалений D-06; максимальная стабильная версия, удовлетворяющая объявленному диапазону зависимого и не попадающая ни под одну уязвимую выборку свежего аудита. Это кандидаты для Группы 1 (02-05); окончательный набор подтверждается `yarn npm audit` после каждого шага.

| Пакет | В lock сейчас -> ожидаемая | Диапазон зависимого | Через что остаётся после D-06 |
| --- | --- | --- | --- |
| path-to-regexp | 0.1.12 -> 0.1.13 | `~0.1.12` (express) | express (production); закрывается апгрейдом express 4.22.3 |
| ws | 8.19.0 -> 8.22.0 | `^8.18.2` / `^8.18.3` | @supabase/realtime-js (production) |
| minimatch | 3.1.2 -> 3.1.5; 5.1.6 -> 5.1.9; 9.0.5 -> 9.0.9; 10.1.1 -> 10.2.6 | `^3.0.4` / `^3.1.1`, `^5.1.0`, `^9.0.4`, `^10.1.1` | glob, readdir-glob (archiver), rimraf, node-gyp |
| brace-expansion | 1.1.12 -> 1.1.21; 2.0.2 -> 2.1.7 | `^1.1.7`, `^2.0.1` | minimatch (цепочки выше) |
| @isaacs/brace-expansion | 5.0.0 -> 5.0.1 | `^5.0.0` | minimatch 10 |
| picomatch | 2.3.1 -> 2.3.2; 4.0.3 -> 4.0.7 | `^2.x`, `^4.0.2` / `^4.0.3` | @rollup/pluginutils, tinyglobby (node-gyp) |
| fast-uri | 3.1.0 -> 3.1.8 | `^3.0.1` | ajv 8 (webpack > schema-utils) |
| nanoid | 3.3.11 -> 3.3.19 | `^3.3.11`, `^3.3.6` | postcss; 3.3.19 уже есть в lock (vite) |
| browserslist | 4.28.1 -> 4.29.3 | `^4.24.0`, `^4.28.1` | webpack |
| tar | 7.5.7 -> 7.5.22 | `^7.5.4` | node-gyp (bcrypt) |
| ip-address | 10.1.0 -> 10.7.3 | `^10.0.1` | socks (node-gyp > make-fetch-happen) |

## Вне диапазона или без патча (запись в документ или `resolutions`, решает 02-09)

| Пакет | Версия в lock | Почему не `yarn up -R` | Достижимость |
| --- | --- | --- | --- |
| tar | 6.2.1 | `@mapbox/node-pre-gyp@1.0.11` просит `^6.1.11`; патч только в 7.x | bcrypt (install-инструмент) |
| serialize-javascript | 6.0.2 | `terser-webpack-plugin` просит `^6.0.2`; патч в 7.x | webpack > terser-webpack-plugin (build) |
| http-cache-semantics | 4.2.0 | патча в реестре нет | node-gyp > make-fetch-happen (install) |
| braces | 3.0.3 | патча в реестре нет | только @vercel/node > @vercel/nft > micromatch (dev, D-13) |
| undici + @fastify/busboy | 5.28.4 + 2.1.1 | `@vercel/node` пинит `undici@5.28.4` точно | только @vercel/node (dev, D-13, не заменяется) |
| path-to-regexp | 6.2.1 | `@vercel/node` пинит точно | только @vercel/node (dev, D-13) |

## approved-versions

Одобрено пользователем 2026-10-03 без замен. Планы 02-05…02-09 берут версии только отсюда.

```
next@16.3.8
@next/mdx@16.3.8
lodash@4.18.1
postcss@8.5.28
next-mdx-remote@6.0.0
multer@2.4.0
sharp@0.35.5
express@4.22.3
```

## Ответ пользователя

Дата: 2026-10-03. Checkpoint Task 2 (`checkpoint:human-verify`, `gate=blocking-human`), вопрос задан оркестратором через AskUserQuestion. Выбранный вариант дословно: «Одобрить как есть». Одобрены: таблица версий, список удалений D-06 и транзитивы `yarn up -R`, замен нет.

Независимая сверка оркестратора перед показом: в реестре npm проверены next@16.3.8 и @next/mdx@16.3.8 (2026-09-30), sharp@0.35.5 (2026-09-27), multer@2.4.0 и express@4.22.3 (2026-09-14), next-mdx-remote@6.0.0 (2026-02-12), lodash@4.18.1 (2026-04-01), postcss@8.5.28 (2026-09-03); `repository.url` совпали с ожидаемыми; lifecycle-скриптов (preinstall, install, postinstall, prepare) нет ни у одного пакета; все версии последние в своих линиях.

## Коммиты

Не выполнялся (правило пользователя). Изменения только в `.planning` (вне git); `git diff --quiet HEAD` выходит с кодом 0, HEAD не менялся.

## Deviations from Plan

Нет: Task 1 выполнен как написано.

Дополнительно к плану проверены advisory на самих целевых версиях (`affects=`), чтобы убедиться, что 16.3.8, 2.4.0 и др. сами не уязвимы.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: план только читает.

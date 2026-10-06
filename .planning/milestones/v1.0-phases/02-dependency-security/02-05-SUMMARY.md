---
phase: 02-dependency-security
plan: 05
subsystem: dependencies
tags: [dependency-security, group-1, removals, lodash, express, postcss, yarn-lock]
status: complete
requires: [02-01, 02-02, 02-03, 02-04]
provides: [group-1-applied]
affects: [02-06, 02-07, 02-08, 02-09]
key-files:
  created: []
  modified:
    - app/web/package.json
    - app/server/package.json
    - packages/rbac/package.json
    - yarn.lock
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 60000
  tasks: 2
  commits: 0
estimate_actuals_note: коммитов нет по правилу пользователя; actuals.tokens оценочные (chars/4 по манифестам и сводке, yarn.lock в расчёт не входит)
completed: 2026-10-03
---

# Phase 2 Plan 05: Группа 1 (удаления D-06, lodash, express, postcss, транзитивы)

Группа 1 применена: из `app/web` и `packages/rbac` убраны девять пакетов D-06, подняты lodash 4.18.1, express 4.22.3 (path-to-regexp 0.1.13), postcss 8.5.28 и транзитивы в пределах диапазона. Все проверки плана зелёные.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Что изменено

| Файл | Изменение |
| --- | --- |
| `app/web/package.json` | удалены tinymce, pm2, gray-matter, postcss-cli, autoprefixer, sass, @tiptap/core, @tiptap/pm, @tiptap/react; `lodash` `^4.18.1`; `postcss` (dev) `^8.5.28` |
| `app/server/package.json` | `express` `^4.22.3` |
| `packages/rbac/package.json` | удалены @tiptap/core, @tiptap/pm |
| `yarn.lock` | дерево Группы 1 |

Файлы, готовые к коммиту: `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json`, `yarn.lock`. `use-debounce.ts` не менялся (`git diff --quiet` даёт 0). Пакеты-пары вне D-06 не тронуты: `bcrypt` и `tiptap-extension-auto-joiner` остались.

## Доказательство неиспользования (D-06), до удаления

- `rg -n --glob '!yarn.lock' --glob '!**/node_modules/**' --glob '!.planning/**' --glob '!plans/**' -e "['\"](tinymce|pm2|gray-matter|postcss-cli|autoprefixer|sass|@tiptap/(core|pm|react))['\"/]" .` нашёл только строки манифестов: `app/web/package.json` (9 строк: @tiptap/core, @tiptap/pm, @tiptap/react, gray-matter, pm2, postcss-cli, sass, tinymce, autoprefixer) и `packages/rbac/package.json` (@tiptap/core, @tiptap/pm). Ни одного `import`/`require` в исходниках.
- Расширенный поиск `rg -i "tiptap|tinymce|gray-matter|pm2\b"` вне `yarn.lock`, `.planning`, `plans`: кроме манифестов только строка в `docs/adr/0002-shared-exam-core-package.md` («Пакет не тянет … Tiptap»), код не затронут. Поиск `sassOptions|ecosystem|\.scss|autoprefixer` вне манифеста: пусто.
- `git ls-files '*.scss' '*.sass'`: пусто.
- Ключ `postcss` в `app/web/package.json`: один плагин `@tailwindcss/postcss`.
- CodeGraph (`codegraph explore "imports of tinymce, pm2, ..."`): запрос семантический, вернул общие React-компоненты без импортов этих пакетов; прямых связей с удалёнными пакетами нет. Решающие доказательства — rg и последующая сборка.
- После удаления: `yarn verify` (lint, typecheck, test), сборка web и `yarn e2e` (включая authoring: редактор вопросов) зелёные. Реального использования ни у одного пакета не найдено, пакетов, которые пришлось бы обновлять вместо удаления, нет.
- Редактор вопросов построен на `@lexical/*`, а не на tiptap/tinymce (в зависимостях остаются `lexical` и `@lexical/*`).

## Отклонения от плана и наблюдения

Правил 1-4 не потребовалось, checkpoint-ов не было.

1. **Предупреждение YN0002 про `tiptap-extension-auto-joiner` не появилось.** План ждал YN0002 (peer `@tiptap/core`). Yarn 4.12.0 вывел только общую строку YN0086 «Some peer dependencies are incorrectly met by dependencies». Сам `tiptap-extension-auto-joiner@0.1.3` остаётся прямой зависимостью `app/web` и в коде нигде не импортируется (`rg` вне манифеста пуст). Он вне D-06, поэтому не удалён. Остаётся на решение 02-09 или пользователя.
2. **Новые транзитивы вне таблицы 02-04, но без lifecycle-хуков установки.** `yarn up -R minimatch` перевёл minimatch 10.x на `brace-expansion@5.0.12` и `balanced-match@4.0.4` вместо `@isaacs/brace-expansion` и `@isaacs/balanced-match` (строка таблицы «@isaacs/brace-expansion 5.0.0 -> 5.0.1» осталась без объекта: пакета в дереве больше нет). `yarn up -R browserslist` подтянул `baseline-browser-mapping@2.11.27`, `caniuse-lite@1.0.30001814`, `electron-to-chromium@1.5.444`, `node-releases@2.0.57`, `update-browserslist-db@1.3.3`. `express@4.22.3` потребовал `body-parser@1.20.8`, `qs@6.16.0`, `side-channel@1.1.1`, `side-channel-list@1.0.1`. Все версии выбраны yarn по диапазонам зависимых, версии пакетов, названных в таблице (ws 8.22.0, minimatch 3.1.5/5.1.9/9.0.9/10.2.6, brace-expansion 1.1.21/2.1.7, picomatch 2.3.2/4.0.7, fast-uri 3.1.8, nanoid 3.3.19, browserslist 4.29.3, tar 7.5.22, ip-address 10.7.3), совпали с ожидаемыми. Основание для работы без checkpoint: D-03 и план (шаг 7: отдельный checkpoint на новый транзитив без lifecycle-скриптов не нужен). Строгая трактовка правила «транзитив вне таблицы — STOP» здесь не применялась, потому что эти пакеты — прямое следствие одобренных версий. Если нужен пересмотр, откатывается возвратом манифестов и `yarn.lock`.
3. **У ряда добавленных версий в реестре есть `prepare`/`prepublish`** (balanced-match 4.0.4, brace-expansion 5.0.12, ip-address 10.7.3, minimatch 9.0.9/10.2.6, tar 7.5.22, qs 6.16.0, side-channel 1.1.1, side-channel-list 1.0.1). Это хуки сборки автора публикации; Yarn Berry не исполняет `prepare`/`prepublish` у зависимостей из реестра. Установочных хуков (preinstall, install, postinstall) у добавленных пакетов нет, YN0007 пуст.
4. **Служебное:** первая попытка цикла `for c in ...; yarn $c` в zsh не разбила строку на слова и выполнила холостой `yarn install` (в `yarn.lock` ничего не изменила, три записи в `02-05-yarn.log` без смысла). Затем все `add` выполнены по отдельности.
5. **`postcss@8.5.28` уже был в lockfile** (через транзитивы), поэтому в дельте строки `+ postcss@8.5.28` нет; прямая запись в манифесте `^8.5.28` резолвится в 8.5.28 (проверка approved-versions зелёная). Вложенный `postcss@8.4.31` у Next остаётся до Группы 2.

## Итоговые версии

| Пакет | Версия в `yarn.lock` | Одобрено (`## approved-versions` 02-04) |
| --- | --- | --- |
| lodash (все копии: app/web, recharts, archiver-utils) | 4.18.1 | 4.18.1 |
| postcss (app/web, `^8.5.28`) | 8.5.28 | 8.5.28 |
| express (app/server) | 4.22.3 | 4.22.3 |
| path-to-regexp под express | 0.1.13 (остаётся 6.2.1 только у `@vercel/node`, D-13) | 0.1.13 |

Проверки approved-versions выходят с кодом 0: `installed = approved: lodash,postcss` и `installed = approved: express`.

## Проверки (результаты)

| Проверка | Результат |
| --- | --- |
| Манифесты (`group1 manifests ok`) | зелёная |
| Lockfile (`group1 lockfile ok [ '4.18.1' ] [ '4.22.3' ] [ '6.2.1', '0.1.13' ]`) | зелёная |
| approved-versions (web: lodash, postcss; server: express) | зелёная |
| sha256 `untrusted.test.ts` (02-01), `uploads.test.ts`, `sharp-runtime.test.ts`, `http.ts` (02-02) | совпадают, тесты не менялись |
| `yarn oxfmt` по трём манифестам, `yarn format:check` | зелёная |
| `yarn install --immutable` | код 0, YN0028 нет |
| `yarn verify` | `yarn verify: OK` (lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests: passed; rbac 2 passed, web 57 passed + 5 expected fail, server 179 passed, script-tests 129) |
| Сборка web по `buildCommand` Vercel (rbac build + `build:dev` с плейсхолдерами env) | код 0, «Compiled successfully in 13.5s», Next 16.2.1 |
| `cd app/server && node vercel-build.cjs` | код 0, `=== Build completed successfully! ===` |
| `yarn e2e` | код 0, «108 passed»; 6 ожидаемых падений известных дефектов (D5 `authoring.spec.ts`, D2 и D1 `review.spec.ts`, по два проекта chromium) остались как были |
| `use-debounce.ts` | не изменён |

## yarn.lock delta

Добавлено (`+ name@version`, 26 строк); удалено 203 разрешения (186 имён, полный список — разность `02-05-yarn.lock.before` и `yarn.lock`).

```
+ balanced-match@4.0.4
+ baseline-browser-mapping@2.11.27
+ body-parser@1.20.8
+ brace-expansion@1.1.21
+ brace-expansion@2.1.7
+ brace-expansion@5.0.12
+ browserslist@4.29.3
+ caniuse-lite@1.0.30001814
+ electron-to-chromium@1.5.444
+ express@4.22.3
+ fast-uri@3.1.8
+ ip-address@10.7.3
+ lodash@4.18.1
+ minimatch@10.2.6
+ minimatch@3.1.5
+ minimatch@5.1.9
+ minimatch@9.0.9
+ node-releases@2.0.57
+ path-to-regexp@0.1.13
+ picomatch@2.3.2
+ qs@6.16.0
+ side-channel-list@1.0.1
+ side-channel@1.1.1
+ tar@7.5.22
+ update-browserslist-db@1.3.3
+ ws@8.22.0
```

Ключевые удаления: `tinymce@8.3.2`, `pm2@6.0.14`, `gray-matter@4.0.3`, `postcss-cli@11.0.1`, `autoprefixer@10.4.23`, `sass@1.97.3`, `@tiptap/core@2.27.2`, `@tiptap/core@3.18.0`, `@tiptap/pm@2.27.2`, `@tiptap/pm@3.18.0`, `@tiptap/react@2.27.2`, `js-yaml@3.14.2`, `js-yaml@4.1.1`, `basic-ftp@5.1.0`, `systeminformation@5.30.6`, `immutable@5.1.4`, `ws@7.5.10`, `linkify-it@5.0.0`, `markdown-it@14.1.0`, а также заменённые старые версии `lodash@4.17.23`, `express@4.22.1`, `path-to-regexp@0.1.12`, `body-parser@1.20.4`, `qs@6.14.1`, `ws@8.19.0`, `tar@7.5.7`, `nanoid@3.3.11`, `picomatch@2.3.1`, `picomatch@4.0.3`, `minimatch@3.1.2/5.1.6/9.0.5/10.1.1`, `ip-address@10.1.0`, `fast-uri@3.1.0`, `browserslist@4.28.1`, `@isaacs/brace-expansion@5.0.0`, `@isaacs/balanced-match@4.0.1`.

Пропущенных транзитивов из таблицы 02-04 нет: из списка `yarn up -R` обработаны path-to-regexp (через express), ws, minimatch, brace-expansion, picomatch, fast-uri, nanoid (слился с уже имевшейся 3.3.19), browserslist, tar, ip-address; `@isaacs/brace-expansion` ушёл вместе с обновлением minimatch (см. отклонение 2).

## YN0007

Нет. Ни в одной из команд (`remove`, `add`, `up -R`, `install --immutable`) в `02-05-yarn.log` нет YN0007, YN0002 и YN0028. Новых пакетов с установочными lifecycle-скриптами вне одобренной таблицы нет.

В `02-05-yarn.log` пять строк `YN0008: bcrypt@npm:5.1.1 must be rebuilt because its dependency tree changed`: это пересборка уже установленного bcrypt 5.1.1 (install-скрипт node-pre-gyp) после изменения его дерева зависимостей, сам пакет не менялся; путь node-pre-gyp -> tar 6.2.1 записан в 02-04.

## Свежий срез аудита после Группы 1

`yarn npm audit --all --environment production --severity high --json` (прямые зависимости воркспейсов): 24 записи, остались **multer, next, next-mdx-remote, sharp**. `tinymce`, `lodash` и `@tiptap/core` исчезли (проверка «still direct» не сработала). Было до группы: 29 записей по 7 пакетам (next, multer, sharp, tinymce, lodash, next-mdx-remote, @tiptap/core).

`yarn npm audit --all --recursive --severity high --json`: 43 записи, 12 имён: @fastify/busboy, braces, http-cache-semantics, multer, next, next-mdx-remote, path-to-regexp, postcss, serialize-javascript, sharp, tar, undici. Было до группы: 110 записей, 29 имён.

`yarn npm audit --all --recursive --environment production --severity high --json`: 37 записей, 8 имён: http-cache-semantics, multer, next, next-mdx-remote, postcss, serialize-javascript, sharp, tar.

Остаток, закрываемый следующими группами: next, next-mdx-remote, postcss (вложенный 8.4.31 у Next, уходит с Next 16.3.8), sharp (Группы 2 и 3), multer (Группа 3). Остаток вне диапазона или без патча, записывается в 02-09: tar 6.2.1 (bcrypt), serialize-javascript 6.0.2 (webpack > terser), http-cache-semantics 4.2.0, braces 3.0.3, undici + @fastify/busboy и path-to-regexp 6.2.1 (только `@vercel/node`).

## Промежуточные артефакты (вне git)

`.planning/phases/02-dependency-security/02-05-yarn.lock.before`, `.planning/phases/02-dependency-security/02-05-yarn.log`.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей: изменения — только манифесты и lockfile.

## Решение пользователя по транзитивам вне таблицы

2026-10-03, после выполнения плана. Дельта `yarn.lock` относительно `02-05-yarn.lock.before` (сверка оркестратором): 26 новых `name@version`, из них 11 вне таблицы 02-04: balanced-match@4.0.4, baseline-browser-mapping@2.11.27, body-parser@1.20.8, brace-expansion@5.0.12, caniuse-lite@1.0.30001814, electron-to-chromium@1.5.444, node-releases@2.0.57, qs@6.16.0, side-channel-list@1.0.1, side-channel@1.1.1, update-browserslist-db@1.3.3. Все требуются одобренными express 4.22.3, minimatch и browserslist; репозитории известные; lifecycle-скриптов (preinstall/install/postinstall) нет ни у одной версии (`npm view`).

Ответ пользователя: «Принять и так же дальше». Политика для 02-06…02-08: транзитивы, которые тянут одобренные пакеты, принимаются без остановки при отсутствии lifecycle-скриптов и записываются в дельту SUMMARY; блокирующий checkpoint только при пакете с install-скриптом или при прямой версии, не равной одобренной.

## Self-Check: PASSED

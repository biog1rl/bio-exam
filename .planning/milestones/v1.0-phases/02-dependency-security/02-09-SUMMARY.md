---
phase: 02-dependency-security
plan: 09
subsystem: dependencies
tags: [dependency-security, audit, dep-01, dep-04, dep-05, resolutions, final-run]
status: complete
deferred_human_gate: true
requires: [02-04, 02-05, 02-06, 02-07, 02-08]
provides:
  - "docs/security/dependency-audit.md: остаток advisory (17 строк) с путём, достижимостью, патчем и статусом upstream"
  - "Решение по resolutions по D-13: не добавлены"
  - "Финальный локальный прогон фазы зелёный"
affects: [phase-02-verification]
tech-stack:
  added: []
  patterns:
    - "Таблица остатка собирается скриптом из NDJSON аудита и GitHub Advisory API с сортировкой severity, пакет, GHSA"
key-files:
  created:
    - docs/security/dependency-audit.md
  modified: []
key-decisions:
  - "resolutions не добавлены: среди 17 записей рекурсивного аудита нет достижимых в production-рантайме (D-13)"
  - "tar 6.2.1, http-cache-semantics 4.2.0, serialize-javascript 6.0.2 из production-аудита записаны как build-инструмент: попадают туда через неиспользуемые bcrypt и webpack в dependencies app/web, кодом web и server во время работы не загружаются"
  - "yarn up -R terser-webpack-plugin и node-gyp в этом плане не выполнялись: план разрешает только resolutions, build-инструменты по D-13 только записываются"
  - "bcrypt, webpack, tiptap-extension-auto-joiner в app/web не удалены (решения пользователя нет), факты записаны в документ"
  - "Task 3 (commit, push, PR, CI на HEAD) не выполнен и не одобрен: пользователь недоступен, шаги в Deferred human verification"
requirements-completed: []
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 3154
  tasks: 2
  commits: 0
estimate_actuals_note: "actuals.tokens = chars/4 по docs/security/dependency-audit.md без выравнивающих пробелов таблиц; правка строки REQUIREMENTS.md (вне git) и эта сводка не входят; tasks: 2 из 3, Task 3 отложен; коммитов нет по правилу пользователя"
duration: 12min
completed: 2026-10-04
---

# Phase 2 Plan 09: Запись остатка advisory, resolutions по D-13, финальный прогон Summary

**Свежий рекурсивный аудит дал 17 записей high и выше (1 critical) по 7 пакетам, все записаны в `docs/security/dependency-audit.md` с путём от воркспейса, достижимостью, патчем и статусом upstream. Достижимых в production-рантайме нет, поэтому `resolutions` не добавлены. Прямой production-аудит пуст (код 0). `yarn install --immutable`, `yarn verify`, обе сборки Vercel и `yarn e2e` зелёные. DEP-01 переформулирован. Финальный гейт CI (Task 3) ждёт пользователя.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` отражает это правило; `plan_head_before` и `plan_head_after` совпадают.

## Performance

- **Started:** 2026-10-03T20:01Z (2026-10-04 по местному времени)
- **Completed:** 2026-10-03T20:14Z
- **Tasks:** 2 из 3 (Task 3 отложен до пользователя)
- **Files modified:** 1 в репозитории (новый), 1 вне git (`.planning/REQUIREMENTS.md`)

## Свежий аудит (дата аудита 2026-10-04)

| Команда | Результат |
| --- | --- |
| `yarn npm audit --all --recursive --severity high --json` | код 1, 17 записей: tar 6.2.1 (1 critical, 10 high), undici 5.28.4 (3), @fastify/busboy 2.1.1, braces 3.0.3, http-cache-semantics 4.2.0, path-to-regexp 6.2.1, serialize-javascript 6.0.2 |
| `yarn npm audit --all --recursive --environment production --severity high --json` | код 1, 11 записей: tar 6.2.1 (10), http-cache-semantics 4.2.0, serialize-javascript 6.0.2 |
| `yarn npm audit --all --environment production --severity high --no-deprecations` | код 0, `YN0001: No audit suggestions` |

Против снимка 02-04 (110 записей по 29 пакетам, 29 прямых production-записей по 7 пакетам): прямых записей нет, в остатке только транзитивы, которые 02-04 отнёс к таблице «Вне диапазона или без патча».

`first_patched_version` взят из `https://api.github.com/advisories/<GHSA>` (17 запросов, все 200), для пакетов с несколькими диапазонами выбран диапазон, в который попадает версия в дереве (path-to-regexp 6.2.1 -> 6.3.0; undici 5.28.4 -> 6.24.0 и 6.27.0). У braces и http-cache-semantics `first_patched_version` пуст.

## Решения по resolutions (D-13)

| Пакет (версия) | Записей | Достижимость | Почему resolutions нет |
| --- | --- | --- | --- |
| tar 6.2.1 | 1 critical, 10 high | build-инструмент | `require('tar')` есть только в `@mapbox/node-pre-gyp/lib/install.js`, `package.js`, `testpackage.js`; `lib/node-pre-gyp.js` грузит команды лениво (`require('./' + command)`), `bcrypt.js` вызывает только `find` (`pre-binding.js` tar не грузит). tar работает при `yarn install` в скрипте `node-pre-gyp install --fallback-to-build` пакета bcrypt. `rg bcrypt app/web` вне `package.json` пуст: bcrypt установлен, но не импортируется; сервер использует `bcryptjs`. Upstream исправил в `@mapbox/node-pre-gyp` 2.x (`tar ^7.4.0`), обновление вне диапазона bcrypt 5.1.1 (`^1.0.11`) |
| http-cache-semantics 4.2.0 | 1 high | build-инструмент | путь через node-gyp 12.2.0 (дескриптор `node-gyp@npm:latest` Yarn добавляет пакетам с `binding.gyp`: node-addon-api у bcrypt, fsevents). node-gyp исполняется только при установке. Патча нет |
| serialize-javascript 6.0.2 | 1 high | build-инструмент | `webpack ^5.98.0` в dependencies app/web в коде не импортируется; `next build` на Next 16.3.8 собирает Turbopack (`▲ Next.js 16.3.8 (Turbopack)`) |
| undici 5.28.4, @fastify/busboy 2.1.1, path-to-regexp 6.2.1 | 5 high | dev-инструмент | только `@vercel/node` 3.2.29 из devDependencies app/server; `@vercel/node` 20.0.0 (последняя) пинит undici 5.28.4 и path-to-regexp 6.1.0; не заменяется (D-13) |
| braces 3.0.3 | 1 high | dev-инструмент | только через `@vercel/node` (`@vercel/nft` 0.27.3 и `ts-morph` 12 -> `@ts-morph/common` 0.11.1 -> fast-glob -> micromatch); патча нет |

Проверка версий вне таблицы 02-04 не понадобилась: `resolutions`, `yarn up` и `yarn add` не выполнялись, `package.json` и `yarn.lock` этим планом не менялись (`git diff HEAD --binary` байт-в-байт совпадает с `.planning/commit-snapshots/after-02-08/tracked.patch`).

Варианты для пользователя, не выполнены (build-инструменты, D-13 требует только записи):
- `yarn up -R terser-webpack-plugin`: terser-webpack-plugin 5.3.17 и выше не зависит от serialize-javascript (код встроен, скрипт `copy-serialize-javascript.js`; содержит ли встроенная копия исправление GHSA-5c6j-r48x-rmvq, не проверялось) и укладывается в диапазон webpack `^5.3.16`.
- `yarn up -R node-gyp`: node-gyp 13.1.0 не зависит от make-fetch-happen (уходит http-cache-semantics), но тянет undici 8.
- Удаление неиспользуемых `bcrypt` и `webpack` из `app/web` убирает tar 6.2.1, http-cache-semantics и serialize-javascript из production-аудита. Нужен отдельный D-06-подобный разбор и решение пользователя.

## Документ `docs/security/dependency-audit.md`

- Заголовок `# Аудит зависимостей`, `Дата аудита: 2026-10-04`, команда `yarn npm audit --all --recursive --severity high --json`.
- `## Прямые зависимости`: команда и результат прямого production-аудита, версии next 16.3.8, @next/mdx 16.3.8, multer 2.4.0, sharp 0.35.5, express 4.22.3 (path-to-regexp 0.1.13), next-mdx-remote 6.0.0, lodash 4.18.1, postcss 8.5.28 (8.5.23 у next), drizzle-orm 0.45.3 (GHSA-gpj5-g38j-94v9 закрыт); факты по `bcrypt`, `tiptap-extension-auto-joiner`, `webpack` (нет импортов, собственных advisory нет по `GET /advisories?affects=`).
- `## resolutions`: правило D-13, добавленных ключей нет, категории достижимости.
- `## Остаток` (последний раздел): 17 строк, по строке на пару (advisory, версия), пути одной пары в одной ячейке через `;`, порядок critical, high, затем пакет (`localeCompare`), затем GHSA.
- Таблица собрана скриптом из NDJSON аудита и ответов Advisory API (scratchpad, вне репозитория), отформатирована `yarn oxfmt`.

## Проверки

| Проверка | Результат |
| --- | --- |
| Task 1 `<automated>` 1 (каждый GHSA аудита в документе) | `all advisories recorded: 17`, код 0 |
| Task 1 `<automated>` 2 (порядок, уникальность) | `rows ordered and unique: 17`, код 0 |
| Task 1 `<automated>` 3 (прямой production-аудит) | `YN0001: No audit suggestions`, код 0 |
| Tracer gate Task 1 | все три проверки повторены после финальной генерации документа: зелёные; переход к Task 2 |
| `yarn format:check` | `All matched files use the correct format.` |
| `yarn install --immutable` | код 0, `YN0028` нет |
| `yarn verify` | `yarn verify: OK`, все 8 шагов passed; rbac 2 passed, web 67 passed (9 файлов), server 179 passed (10 файлов) |
| Сборка web по `buildCommand` Vercel с плейсхолдерами env | код 0, `▲ Next.js 16.3.8 (Turbopack)`, `✓ Compiled successfully`, `ƒ Proxy (Middleware)`, `Failed to compile` / `Invalid server env` нет |
| `cd app/server && node vercel-build.cjs` | код 0, `=== Build completed successfully! ===` |
| `yarn e2e` | код 0, `108 passed`; 6 ожидаемых падений `@known-defect` (как в 02-06…02-08), неожиданных падений нет, `failed` в сводке нет |
| D-14 и DEP-01 | `D-14 respected, DEP-01 updated` |

Drizzle-запросы на итоговом дереве покрыты DB-тестами сервера в `yarn verify` (179) и потоками `yarn e2e`; новых тестов план не добавлял (D-12).

## DEP-01 в `.planning/REQUIREMENTS.md`

Строка заменена (чекбокс `- [ ]` не тронут):

> Direct affected packages are upgraded to patched compatible releases, verified against primary advisories at execution time: Next (16.2.1 -> 16.3.x; the advisory set at execution requires at least 16.3.6, installed 16.3.8), Multer, Sharp, Drizzle ORM (SQL-identifier escaping, 0.45.3 since Phase 1), PostCSS; TinyMCE is removed as unused (plan 002 steps 1-2)

`.planning` в `.gitignore` (`git check-ignore`: `.gitignore:90:.planning`), правка в коммит не попадёт. Отметки `[x]` не ставились: требования закрывает верификация фазы.

## Файлы, готовые к коммиту

| План | Файлы |
| --- | --- |
| 02-09 | `docs/security/dependency-audit.md` (новый, untracked) |

`package.json` и `yarn.lock` этим планом не менялись. Снимок рабочего дерева после плана: `.planning/commit-snapshots/after-02-09` (12 путей; от `after-02-08` отличается только `docs/security/dependency-audit.md` в `untracked.txt`).

## Deferred human verification

**Не выполнено, ждёт пользователя; исполнитель не одобрял.** Task 3 (`checkpoint:human-verify`, gate `blocking-human`) пропущен по режиму автономного запуска: пользователь недоступен, одобрение не получено и не подразумевается. `deferred_human_gate: true` во frontmatter нужен только для закрытия плана. Без шагов ниже фаза не закрывается (ADR-0003): изменения 02-08 (next-mdx-remote 6, `app/web/lib/mdx`, `yarn.lock`) и 02-09 (документ) в CI ещё не проверялись, последняя проверка CI планировалась в 02-07 и тоже отложена.

Шаги для пользователя:

1. Закоммитить изменения 02-01…02-09 в своём стиле, граница плана = граница коммита. Файлы по планам:
   - 02-01: `app/web/lib/mdx/untrusted.test.ts` в версии `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01`;
   - 02-02: `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/lib/sharp-runtime.test.ts`;
   - 02-03: `e2e/tests/proxy-protection.spec.ts`;
   - 02-04: файлов нет;
   - 02-05: `app/web/package.json` (удаления D-06, `lodash`, `postcss`), `packages/rbac/package.json`, хунк `express` в `app/server/package.json`, `yarn.lock` = `.planning/phases/02-dependency-security/02-06-yarn.lock.before`;
   - 02-06: `app/web/package.json` (`next`, `@next/mdx`), `yarn.lock` = `02-07-yarn.lock.before`;
   - 02-07: хунки `multer`, `sharp`, `@types/sharp` в `app/server/package.json`, `yarn.lock` = `02-08-yarn.lock.before`;
   - 02-08: хунк `next-mdx-remote` в `app/web/package.json`, текущий `yarn.lock`, `app/web/lib/mdx/options.ts`, `app/web/lib/mdx/remarkStripUnsafeJsx.ts`, текущий `app/web/lib/mdx/untrusted.test.ts`;
   - 02-09: `docs/security/dependency-audit.md`.
   Сверка состояний: `.planning/commit-snapshots/README.md`, снимки `after-02-06`, `after-02-07`, `after-02-08`, `after-02-09` (`tracked.patch`, `untracked.txt`, `untracked.tgz`).
2. Push из своего терминала: `git push -u origin phase-1-verification`.
3. Убедиться, что из ветки открыт pull request в master; если нет, открыть. CI (`.github/workflows/ci.yml`) запускается только на pull request и push в master.
4. Написать "pushed" или описать проблему.
5. После этого проверки (выполняет исполнитель или основная сессия):
   - рабочее дерево чистое: `git diff --quiet HEAD && test -z "$(git status --porcelain --untracked-files=all)" && echo "tree clean at $(git rev-parse HEAD)"`;
   - CI на HEAD через публичный API: `H=$(git rev-parse HEAD) && T=$(mktemp) && curl -sS -o "$T" "https://api.github.com/repos/biog1rl/bio-exam/actions/runs?head_sha=$H&per_page=100"`, затем node-проверка из Task 3 плана: последний запуск workflow `CI` с `head_sha` = HEAD, `status` = `completed`, `conclusion` = `success`. Пока запуск идёт, повторять раз в 2 минуты до 30 минут; ошибка API (лимит) — не результат CI.
   - id запуска, ссылка, head_sha и conclusion дописываются в эту сводку.

Ответ пользователя: нет. Результат CI: не проверялся (head_sha, id запуска, ссылка, conclusion: нет).

## Откат после merge

Деплой и откат делает пользователь, по классу сбоя:
- проблема server (Multer, Sharp, express): Instant Rollback только проекта server;
- регрессия MDX: `git revert` коммитов 02-08, `yarn install`, деплой; Next 16.3 остаётся;
- Instant Rollback проекта web — только если сломан сам Next: иначе вернётся Next 16.2.1 с critical RCE.

## Deviations from Plan

Правил 1-4 не потребовалось.

1. **Колонка «Патч» для пакетов с несколькими диапазонами.** Первая генерация вписала в строку path-to-regexp все `first_patched_version` advisory (0.1.10, 1.9.0, 3.3.0, 8.0.0, 6.3.0). Генератор исправлен: берётся диапазон, в который попадает версия в дереве (`semver.satisfies`), с проверкой, что совпадение ровно одно. Документ перегенерирован, проверки Task 1 повторены.
2. **Формулировки документа.** Ссылки на D-13 убраны из `docs/security/dependency-audit.md` (02-CONTEXT.md вне git), правило записано в разделе `## resolutions` текстом. Статус serialize-javascript: «зависимость убрана … (код встроен)» вместо «upstream исправил», потому что исправление встроенной копии не проверялось. Документ перегенерирован, проверки Task 1, `yarn format:check` и `yarn verify` (`yarn verify: OK`) повторены на итоговом файле. Сборки и `yarn e2e` не повторялись: изменился только markdown.
3. **Дата аудита.** Аудит выполнен 2026-10-03 около 20:02 UTC, по местному времени 2026-10-04; в документе и сводке 2026-10-04.

Отклонения по режиму запуска:
- Task 3 не выполнен (автономный режим, пользователь недоступен), записан раздел Deferred human verification.
- Коммиты не делались по правилу пользователя.

## Known Stubs

Нет.

## Threat Flags

Нет. Новой сетевой поверхности, путей авторизации или работы с файлами нет. T-2-21: каждый GHSA аудита в документе, `--ignore`/`--exclude`/`npmAuditExcludePackages` не использовались. T-2-22, T-2-SC: версии не менялись. T-2-23: аудит не в `scripts/verify.mjs` и не в `.github/workflows/ci.yml`.

## Self-Check: PASSED

- FOUND: `docs/security/dependency-audit.md`
- FOUND: `.planning/phases/02-dependency-security/02-09-SUMMARY.md`
- FOUND: `.planning/commit-snapshots/after-02-09`
- MODIFIED (вне git): `.planning/REQUIREMENTS.md` (строка DEP-01)
- Коммиты: не проверялись, не выполнялись по правилу пользователя; `git status` показывает от этого плана только `?? docs/security/`
- Трекинг: `roadmap.update-plan-progress 02 02-09 complete` (9/9 SUMMARY), `state.add-decision`, `state.record-session`; `state.advance-plan` и `requirements.mark-complete` не вызывались

---
phase: 02-dependency-security
plan: 07
subsystem: dependencies
tags: [dependency-security, group-3, multer, sharp, uploads, vercel, yarn-lock]
status: complete
deferred_human_gate: true
requires: [02-02, 02-04, 02-06]
provides: [group-3-applied]
affects: [02-08, 02-09]
key-files:
  created: []
  modified:
    - app/server/package.json
    - yarn.lock
key-decisions:
  - "multer поднят до 2.4.0, sharp до 0.35.5 (одобренные версии 02-04); правок роутов не понадобилось"
  - "@types/sharp 0.32.0 удалён: sharp 0.35 поставляет свои типы, typecheck сервера зелёный; вместе с ним ушёл дескриптор sharp@npm:* и sharp 0.34.5 целиком"
  - "В yarn.lock одна версия sharp 0.35.5 (дескрипторы ^0.35.4 у next и ^0.35.5 у сервера), yarn up -R sharp не понадобился"
  - "Task 2 (preview Vercel и CI на Linux) не выполнен и не одобрен: пользователь недоступен, шаги в разделе Deferred human verification"
commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
actuals:
  tokens: 6000
  tasks: 1
  commits: 0
estimate_actuals_note: "коммитов нет по правилу пользователя; actuals.tokens = chars/4 по изменённым строкам манифеста и этой сводке, yarn.lock в расчёт не входит; tasks: 1 из 2, Task 2 отложен"
duration: 4min
completed: 2026-10-04
---

# Phase 2 Plan 07: Группа 3 (multer 2.4.0 и sharp 0.35.5 на сервере) Summary

**multer 2.0.2 -> 2.4.0 и sharp 0.34.5 -> 0.35.5 без правок роутов: в дереве одна версия sharp 0.35.5, `@types/sharp` удалён, характеризационные тесты 02-02 зелёные без изменений (25/25), `yarn verify`, обе локальные сборки Vercel и `yarn e2e` зелёные, собранный `dist/app.js` грузится вместе с sharp 0.35.5. Preview Vercel и CI на Linux (Task 2) ждут пользователя.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве. `commits: 0` отражает это правило; `plan_head_before` и `plan_head_after` совпадают.

## Performance

- **Started:** 2026-10-03T19:43:31Z
- **Completed:** 2026-10-03T19:47Z (2026-10-04 по местному времени)
- **Tasks:** 1 из 2 (Task 2 отложен до пользователя)
- **Files modified:** 2

## Что изменено

| Файл | Изменение |
| --- | --- |
| `app/server/package.json` | `multer` `^2.0.2` -> `^2.4.0`, `sharp` `^0.34.5` -> `^0.35.5`, удалён `devDependencies["@types/sharp"]` (`^0.32.0`). Строка `express` `^4.19.2` -> `^4.22.3` в диффе файла пришла из 02-05 |
| `yarn.lock` | multer 2.4.0 вместо 2.0.2 (ушли concat-stream, minimist, mkdirp, typedarray), sharp 0.34.5 и его 26 пакетов `@img/*` 0.34.5 / libvips 1.2.4 удалены, `@types/sharp` удалён |

`app/server/src/routes/users/avatar.ts`, `app/server/src/routes/docs/assets.ts`, `app/server/src/routes/tests/index.ts` не менялись: новый API multer и sharp правок не потребовал (typecheck, тесты и сборка зелёные). `@types/multer` не трогался.

## Итоговые версии

| Пакет | Версия в `yarn.lock` | Одобрено (`## approved-versions` 02-04) | Дескрипторы |
| --- | --- | --- | --- |
| multer | 2.4.0 | 2.4.0 | `multer@npm:^2.4.0` (app/server) |
| sharp | 0.35.5 (единственная) | 0.35.5 | `sharp@npm:^0.35.4` (next 16.3.8), `sharp@npm:^0.35.5` (app/server) |

## Решение по `@types/sharp`

Удалён (`yarn workspace @bio-exam/server remove @types/sharp`). `yarn workspace @bio-exam/server typecheck` после удаления: код 0. Sharp 0.35 поставляет собственные типы, `@types/sharp` 0.32.0 был заглушкой с зависимостью `sharp@*`, из-за которой после `yarn add` в lockfile оставался дескриптор `sharp@npm:*` -> 0.34.5. После удаления вторая версия sharp ушла без `yarn up -R sharp`.

## Поведение загрузок на multer 2.4.0 / sharp 0.35.5 против 02-02

`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/uploads.test.ts src/lib/sharp-runtime.test.ts`: `Test Files 2 passed (2)`, `Tests 25 passed (25)`, `Unhandled Error` нет. Файлы тестов не менялись (sha256 ниже).

| Случай (02-02) | multer 2.0.2 / sharp 0.34.5 | multer 2.4.0 / sharp 0.35.5 |
| --- | --- | --- |
| PNG на tests/assets, avatar (кроп 256x256, rotation 90), docs/assets (WebP 64x64) | 201 / 200 / 200 | то же (тесты зелёные) |
| `text/plain` на трёх роутах | 500 с текстами fileFilter | то же |
| 5 МБ + 1 байт | 500 `File too large` (`LIMIT_FILE_SIZE`) | то же, сброса сокета нет |
| текст с типом `image/png` (avatar, docs) | 400 | то же |
| без cookie | 401 `Unauthorized` | то же |
| тело без закрывающей границы (docs) | 500 `Unexpected end of form` | то же |
| часть с `name=""` (docs) | 500 `Field name missing` (`MISSING_FIELD_NAME`) | то же |
| обрыв запроса (три роута) | в логе нет `Request error`; `/healthz` 200, хранилище пусто, следующая загрузка успешна | инварианты те же (тест зелёный). Отличие только в логе: multer 2.4.0 передаёт обрыв в `next(err)`, pino пишет `Request error` с `Error: Request aborted` (`multer/lib/make-middleware.js:228`) на каждом из трёх роутов. Тест этот лог не утверждает (02-02 не закреплял отсутствие записи), ожидания не менялись |

`sharp.versions` на 0.35.5 (darwin-arm64): `vips 8.18.7`, `webp 1.6.0`, `png 1.6.58`, `mozjpeg 0826579`, `heif 1.23.5`, `cgif 0.5.4` (в 02-02 на 0.34.5: `vips 8.17.3`, `png 1.6.50`, `heif 1.20.2`, `cgif 0.5.0`).

## Проверка загрузки sharp в собранном сервере (локально)

После `cd app/server && node vercel-build.cjs` (`=== Build completed successfully! ===`) собранное приложение импортировано с плейсхолдерами env, без `.env` и без живой базы (`BIO_EXAM_ISOLATED_ENV=1`, `TEST_DATABASE_URL=postgres://ci:ci@127.0.0.1:5432/test_ci`, `DATABASE_URL` тот же плейсхолдер, `AUTH_JWT_SECRET` плейсхолдер, `NODE_ENV=production`, `STORAGE_DRIVER=local` в scratchpad):

```
import('./dist/app.js') -> dist app loaded with sharp function 0.35.5 {..."vips":"8.18.7",...,"sharp":"0.35.5"}
```

Код выхода 0: `dist/app.js` (вместе с `routes/users/avatar.ts` и `routes/docs/assets.ts`, которые импортируют sharp на верхнем уровне) загружается, пул pg ленивый, соединения с базой при импорте нет.

- `node -e "require('sharp')"` из `app/server`: `require sharp 0.35.5 vips 8.18.7`, путь `node_modules/sharp/dist/index.cjs`.
- `import('sharp')` из `app/server/dist` резолвится в `node_modules/sharp/dist/index.mjs`, `sharp.versions.sharp = 0.35.5`.
- В `node_modules/@img/` на этой машине только `colour`, `sharp-darwin-arm64`, `sharp-libvips-darwin-arm64`. Linux-бинарник (`@img/sharp-linux-x64@0.35.5`, libvips 1.3.4) есть в lockfile, но проверяется только на Vercel и в CI.

## Проверки Task 1

| Проверка | Результат |
| --- | --- |
| Диапазоны и версии (`<automated>` 1) | `multer 2.4.0 sharp 0.35.5`, код 0 |
| Характеризационные тесты | `Tests 25 passed (25)` |
| sha256 тестов 02-02 | `characterization tests unchanged`, код 0 |
| `yarn install --immutable` | код 0, `YN0028` нет |
| `yarn verify` | `yarn verify: OK` (server `Tests 179 passed (179)`, web `57 passed / 5 expected fail (62)`, rbac `2 passed`) |
| Сборка web по `buildCommand` Vercel с плейсхолдерами | код 0, `Failed to compile` / `Invalid server env` нет |
| `cd app/server && node vercel-build.cjs` | `=== Build completed successfully! ===` |
| Прямой production-аудит | `remaining direct prod: next-mdx-remote`, multer и sharp нет |
| installed = approved | `installed = approved: multer,sharp`, код 0 |
| sha256 `untrusted.test.ts` (02-01) | совпадает |
| `yarn e2e` | `108 passed (44.1s)`, включая матрицу `@proxy`; `✘` только у `@known-defect` тестов, помеченных ожидаемым падением |
| `yarn format:check` | `All matched files use the correct format.` |

Оставшийся в прямом production-аудите пакет: `next-mdx-remote` (план 02-08).

## sha256

Неизменные тесты прошлых планов (сверено с 02-01, 02-02, 02-03):

```
c85d209681ef41c88f30182cc761facd595215f0fbe7ad4e7542cff741d044c1  app/server/src/routes/uploads.test.ts
9b753edb35292012890c354d9c995e8ce5af0cd995adfa105ff6e6790faed9fb  app/server/src/lib/sharp-runtime.test.ts
2992ec0b000e435ef21929f08dbe06f4fb9ab5f52ae2a7f96a772ac5dd2842b4  app/server/src/test-support/http.ts
d9dd7aabd2e51277f762ea6c4c7121f1fa5a66e93bac2701670106c80e7c4695  app/web/lib/mdx/untrusted.test.ts
9dece94752d11da7a1806745b35a6e411a3377cd020b8e68276cf11e5a13b7bf  e2e/tests/proxy-protection.spec.ts
```

## yarn.lock delta

База: `.planning/phases/02-dependency-security/02-07-yarn.lock.before` (снята до `yarn add`). Лог: `02-07-yarn.log`.

```
+ multer@2.4.0
- @img/colour@1.0.0
- @img/sharp-darwin-arm64@0.34.5
- @img/sharp-darwin-x64@0.34.5
- @img/sharp-libvips-darwin-arm64@1.2.4
- @img/sharp-libvips-darwin-x64@1.2.4
- @img/sharp-libvips-linux-arm64@1.2.4
- @img/sharp-libvips-linux-arm@1.2.4
- @img/sharp-libvips-linux-ppc64@1.2.4
- @img/sharp-libvips-linux-riscv64@1.2.4
- @img/sharp-libvips-linux-s390x@1.2.4
- @img/sharp-libvips-linux-x64@1.2.4
- @img/sharp-libvips-linuxmusl-arm64@1.2.4
- @img/sharp-libvips-linuxmusl-x64@1.2.4
- @img/sharp-linux-arm64@0.34.5
- @img/sharp-linux-arm@0.34.5
- @img/sharp-linux-ppc64@0.34.5
- @img/sharp-linux-riscv64@0.34.5
- @img/sharp-linux-s390x@0.34.5
- @img/sharp-linux-x64@0.34.5
- @img/sharp-linuxmusl-arm64@0.34.5
- @img/sharp-linuxmusl-x64@0.34.5
- @img/sharp-wasm32@0.34.5
- @img/sharp-win32-arm64@0.34.5
- @img/sharp-win32-ia32@0.34.5
- @img/sharp-win32-x64@0.34.5
- @types/sharp@0.32.0
- concat-stream@2.0.0
- minimist@1.2.8
- mkdirp@0.5.6
- multer@2.0.2
- sharp@0.34.5
- typedarray@0.0.6
```

Добавлен один пакет, `multer@2.4.0`, он в одобренной таблице. Новых транзитивов вне таблицы нет: зависимости multer 2.4.0 (`append-field ^1.0.0`, `busboy ^1.6.0`, `type-is ^1.6.18`) уже были в lockfile. `npm view multer@2.4.0 scripts`: только `lint`, `test`, `test-ci`, `lint:fix`, `test-cov`, lifecycle-скриптов нет. `npm view sharp@0.35.5 scripts`: `install`/`preinstall`/`postinstall` нет. Sharp 0.35.5 и его `@img/*` 0.35.5 / libvips 1.3.4 пришли в 02-06 (у next) и в этой дельте не появляются.

## YN0007

нет. В `02-07-yarn.log` строк `YN0007` нет. Есть одна строка `YN0008` от промежуточного состояния после `yarn add`: `sharp@npm:0.34.5 must be rebuilt because its dependency tree changed` (у sharp 0.34.5 есть `install`-скрипт `node install/check.js || npm run build`). Следующим шагом `yarn remove @types/sharp` sharp 0.34.5 удалён из дерева целиком, в итоговом состоянии пакетов с lifecycle-скриптами из этой группы нет.

## Файлы по планам, готовые к коммиту

`.planning/` в этом репозитории в `.gitignore`, в коммиты не входит.

| План | Файлы |
| --- | --- |
| 02-01 | `app/web/lib/mdx/untrusted.test.ts` (untracked) |
| 02-02 | `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/server/src/lib/sharp-runtime.test.ts` (untracked) |
| 02-03 | `e2e/tests/proxy-protection.spec.ts` (untracked) |
| 02-05 | `app/web/package.json` (удаления и `lodash`), `packages/rbac/package.json`, хунк `express` в `app/server/package.json`, `yarn.lock` |
| 02-06 | `app/web/package.json` (`next`, `@next/mdx`), `yarn.lock` |
| 02-07 | хунки `multer`, `sharp`, `@types/sharp` в `app/server/package.json`, `yarn.lock` |

`app/web/package.json`, `app/server/package.json` и `yarn.lock` содержат изменения нескольких планов. Для коммитов по границам планов манифесты делятся по хункам (`git add -p`), а промежуточные состояния `yarn.lock` лежат в каталоге фазы: состояние после 02-05 = `02-06-yarn.lock.before`, после 02-06 = `02-07-yarn.lock.before`, после 02-07 = текущий `yarn.lock`.

## Deferred human verification

**Не выполнено, ждёт пользователя; исполнитель не одобрял.** Task 2 (`checkpoint:human-verify`, gate `blocking-human`) пропущен по режиму автономного запуска: пользователь недоступен, одобрение не получено и не подразумевается. `deferred_human_gate: true` во frontmatter нужен только для старта следующего плана. DEP-05 в части Vercel и Linux не подтверждён, пока шаги ниже не пройдены.

Шаги для пользователя:

1. Закоммитить изменения планов 02-01…02-07 в своём стиле, границы планов = границы коммитов (таблица выше). Push из своего терминала: `git push -u origin phase-1-verification`. CI (`.github/workflows/ci.yml`) запускается только на pull request и push в master, поэтому из ветки нужен открытый pull request в master; если его нет, открыть.
2. В Vercel дождаться preview-деплоев ветки для проектов web и server: оба Ready, Node.js 24.
3. Обязательно: `GET https://<домен server-preview>/healthz` (в браузере с логином в Vercel, если включён Deployment Protection). Ожидается `{"ok":true}`: `app/server/vercel.json` направляет `/healthz` в `api/index.ts`, тот импортирует весь `dist/app.js`, а `avatar.ts` и `docs/assets.ts` импортируют sharp на верхнем уровне.
   - 500 с `Could not load the "sharp" module` (в `message` ответа или в Runtime Logs функции) — STOP плана 002, не одобрять, прислать ошибку.
   - 500 `Configuration Error` про `DATABASE_URL` — это не sharp: у Preview сервера нет переменной, задать и повторить.
4. На web-preview в приватном окне открыть `/dashboard`. Ожидается переход на `/login?callbackUrl=%2Fdashboard`.
5. Проверить `API_ORIGIN` окружения Preview проекта web. Чтобы аватар шёл через новый sharp, web-preview должен ходить в server-preview этой ветки: задать `API_ORIGIN` для Preview с привязкой к ветке (значение — домен server-preview) и сделать Redeploy web-preview. Если переменные не менять, шаг 7 пропускается, и в SUMMARY записывается, что sharp на Vercel подтверждён только `/healthz`, а обработка картинок на Linux — CI.
6. Перед загрузкой аватара проверить `DATABASE_URL` и `SUPABASE_*` окружения Preview сервера. Загрузка аватара удаляет прежние файлы аватара пользователя (`avatar.ts`, `deleteFiles(oldPaths)`); если Preview смотрит на боевые данные, грузить только тестовой учётной записью.
7. Войти тестовой учётной записью на web-preview, в профиле загрузить аватар (JPEG или PNG) с кропом и поворотом, сохранить. Аватар показывается обрезанным и повёрнутым как выбрано.
8. Открыть тест с картинками в условии: картинки показываются.
9. Ответить "approved" или описать проблему; отдельно указать ответ `/healthz` и выполнялся ли шаг 7.
10. После ответа проверка CI на запушенном HEAD через публичный API: `curl -sS "https://api.github.com/repos/biog1rl/bio-exam/actions/runs?branch=phase-1-verification&per_page=5"`. Запуск с `head_sha`, равным локальному HEAD, должен иметь `conclusion` = `success` (включая `sharp-runtime.test.ts` и `uploads.test.ts` на ubuntu). Номер запуска и результат дописываются в эту сводку.

Ответ пользователя по preview: нет. Ответ `/healthz`: нет. Результат CI: нет.

## Deviations from Plan

### Auto-fixed Issues

None.

Отклонения по режиму запуска:
- Task 2 не выполнен (автономный режим, пользователь недоступен); вместо него сделана локальная проверка загрузки `dist/app.js` с sharp и записан раздел Deferred human verification.
- Шаг 3 (`yarn up -R sharp`) не понадобился: вторую версию sharp держал только `@types/sharp` через `sharp@*`, его удаление на шаге 2 оставило одну версию.

## Known Stubs

Нет.

## Threat Flags

Нет. Новых сетевых точек, путей авторизации или работы с файлами не добавлено. Обрыв загрузки на multer 2.4.0 теперь логируется как `Request error` (уровень error); это шум в логах, а не новая поверхность.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-dependency-security/02-07-SUMMARY.md`
- FOUND: `.planning/phases/02-dependency-security/02-07-yarn.lock.before`
- FOUND: `.planning/phases/02-dependency-security/02-07-yarn.log`
- FOUND: `app/server/package.json`, `yarn.lock` (изменены)
- `sha256 matches: app/web/lib/mdx/untrusted.test.ts`, `characterization tests unchanged`, `delta recorded: +1 -32`
- Коммиты: не проверялись, не выполнялись по правилу пользователя

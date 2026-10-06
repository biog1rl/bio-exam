---
phase: 07-storage-and-question-content
plan: 16
subsystem: storage
status: complete
deferred_human_gate: true
tags: [storage, guard-test, reconcile, d-25, d-27, stor-01, priv-01]
requires: [07-15]
provides:
  - scripts/storage-no-private-access.test.mjs (охрана D-25 и задела функций доступа в script-tests)
  - services/question-content/reconcile.ts (reconcileStorage, ORPHAN_MIN_AGE_MS)
  - yarn workspace @bio-exam/server storage:reconcile [--delete-orphans] [--delete-legacy-json]
  - удалённая оболочка services/storage/storage.ts
affects: [app/server/src/services/storage, app/server/src/services/question-content, app/server/src/routes/tests, scripts]
tech-stack:
  added: []
  patterns:
    - "охранный node:test с правилами { label, scope, pattern }, поимёнными исключениями и самопроверкой детекторов"
    - "сверка хранилища: защищённое множество из БД → list → классификация → повторное чтение БД перед удалением"
key-files:
  created:
    - scripts/storage-no-private-access.test.mjs
    - app/server/src/services/question-content/reconcile.ts
    - app/server/src/services/question-content/reconcile.test.ts
    - app/server/src/scripts/storage-reconcile.ts
  modified:
    - app/server/src/routes/tests/exam-flow.test.ts
    - app/server/src/services/storage/storage-known-defects.test.ts
    - app/server/src/services/question-content/index.ts
    - app/server/package.json
    - app/server/README.md
  deleted:
    - app/server/src/services/storage/storage.ts
decisions:
  - "Кандидаты пояснения (explanation.md старых путей) считаются кандидатами чтения у всех вопросов, а не только при непустом explanation_path: export.ts и asset-index.ts читают их безусловно (решение исполнителя, автономно)"
  - "Удаляемая сирота — только файл .md прямо в каталоге topics/<t>/<s>/questions/<q>/; вложенные каталоги и не-.md под questions/ идут в unknown и не удаляются (решение исполнителя, автономно)"
  - "minAgeMs <= 0 отключает защиту по возрасту; нераспознанный createdAt при minAgeMs > 0 считается свежим (решение исполнителя, автономно)"
metrics:
  duration: 15min
  completed: 2026-10-04
actuals:
  tokens: 12300
  tasks: 3
  commits: 0
plan_head_before: 9a78dd6687304c4236410aebe824138496d471f5
plan_head_after: 9a78dd6687304c4236410aebe824138496d471f5
---

# Phase 7 Plan 16: Охрана D-25, удаление оболочки storage.ts и сверка хранилища D-27 Summary

Старая оболочка `services/storage/storage.ts` удалена вместе с `assertLegacyUploadsAllowed`, `getQuestionPath`, `getTestPath` и подделкой в `exam-flow.test.ts`. Охранный тест `scripts/storage-no-private-access.test.mjs` в шаге `script-tests` не пускает `fs`, `process.cwd()`, раскладку ключей и `web/public/uploads` в маршруты, `services/storage` в `routes/tests`, разбор URL Supabase в web, выдачу `users` роли `user` и `requirePerm` на 15 объектных маршрутах `routes/tests`. Скрипт `storage:reconcile` без флагов печатает отчёт о сиротах, указателях на отсутствующие объекты и сохранённых JSON, а удаляет только по флагам. Сироты моложе часа не удаляются, перед удалением указатели перечитываются из БД.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Задачи

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Удаление оболочки storage.ts и подделок старого пути в тестах (tracer) | не выполнялся (правило пользователя) | storage.ts (удалён), exam-flow.test.ts, storage-known-defects.test.ts |
| 2 | Охранный тест D-25 и задела функций доступа | не выполнялся (правило пользователя) | scripts/storage-no-private-access.test.mjs |
| 3 | Скрипт сверки storage:reconcile, README; verify и сверка с отпечатком | не выполнялся (правило пользователя) | reconcile.ts, reconcile.test.ts, question-content/index.ts, scripts/storage-reconcile.ts, package.json, README.md |
| 4 | [Deferred] Выкатка фазы 7 (D-27) | — | перенесено в `## Deferred human verification` |

## Task 1: удаление оболочки

- Отпечаток до правок: `.planning/commit-snapshots/before-07-16/fingerprint.json`, 0 путей (дерево чистое).
- `codegraph impact` (индекс построен по основному дереву и отстаёт от worktree):
  - `storageService`: 8 символов — `routes/docs/assets.ts`, `routes/index.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`, `scripts/backfill-question-search.ts` (уровень файла);
  - `StorageService`: 69 символов, среди них `storage.local.test.ts` и маршруты `routes/tests/index.ts`;
  - `assertLegacyUploadsAllowed`: 21 символ — `routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/index.ts` и web-компоненты медиатеки.
  - Это состояние основного дерева до 07-06…07-15. В worktree `rg "storageService|StorageService|assertLegacyUploadsAllowed|getQuestionPath|getTestPath|storage/storage"` по `app packages scripts e2e` нашёл только `storage-known-defects.test.ts` (2 теста) и `exam-flow.test.ts` (`vi.mock`). Нетестовых вызывающих нет, STOP не нужен.
- `exam-flow.test.ts`: удалены `vi.hoisted` с картой `files` и блок `vi.mock('../../services/storage/storage.js')`. `vi` остался в импорте: тест вызывает `vi.resetModules()`. Тест идёт на in-memory адаптере по умолчанию.
- Шаг 2a (тесты фазы 5): `rg -l "storage/storage(\.js)?'" app/server/src` нашёл только `exam-flow.test.ts`. Тесты `routes/tests/attempt-*.test.ts` старую оболочку не подменяют, правок в них нет.
- `storage-known-defects.test.ts`:
  - тест «readFile of a missing object gives an empty string» удалён: случай «отсутствующий объект → `null`» покрыт `STOR-readFile-empty-on-outage` и контрактным набором 07-02;
  - тест «the Supabase client is created from SUPABASE_URL outside isolation» переведён на `storage().readText(...)` с ожиданием `null`.
- `app/server/src/services/storage/storage.ts` удалён. `archiver` остаётся зависимостью: его использует `services/storage/zip.ts`.
- Проверки: `legacy storage facade removed`; `yarn workspace @bio-exam/server typecheck` — 0 ошибок; `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/tests src/services/storage` — 16 файлов, 398 тестов passed.

## Task 2: охранный тест D-25

Правила (`RULES`, сканируются нетестовые исходники, кроме `scope: server`):

| Правило | Охват |
| ------- | ----- |
| импорт `fs`, `node:fs`, `fs/promises` (`from`, `import(`, `require(`) | `app/server/src/routes` |
| вызов `process.cwd()` | `app/server/src/routes` |
| `getQuestionPath` или `getTestPath` | `app/server/src/routes` |
| литерал, начинающийся с кавычки и `topics/` или `avatars/` (пути маршрутов `'/topics/:id'` не срабатывают) | `app/server/src/routes` |
| `web/public/uploads` | `app/server/src/routes` |
| строка импорта, содержащая `services/storage` | `app/server/src/routes/tests` |
| `/storage/v1/` | `app/web` без `node_modules`, `.next` |
| `getStoragePathFromSupabaseUrl` или `isStoragePath` | `app/web` |
| `assertLegacyUploadsAllowed` | `app/server/src`, включая тесты |

Дополнительно:

- роль `user` в `packages/rbac/src/roles.ts`: разбор блока `user: { … grants: { … } }` со сбалансированными скобками, ключа `users` в грантах нет (PRIV-01);
- задел фазы «Учителя и зона ответственности»: `routes/tests/index.ts` режется на регистрации (`\nrouter.` до `async`). Для 15 пар метод + путь из must_haves регистрация найдена и не содержит `requirePerm(`. В файле есть вызовы `canReadTest(`, `canWriteTest(`, `canWriteTopic(`, `testScope(`;
- `EXCEPTIONS = []` в формате `{ file, reason, fragment, count }`. Тест проверяет сумму `count` (0) и для каждого исключения — существование фрагмента ровно в заявленном числе и срабатывание детектора;
- нижние границы: `routes` ≥ 15 файлов (сейчас 22), `routes/tests` ≥ 3, `app/web` ≥ 100 (сейчас 418), `app/server/src` ≥ 100;
- самопроверка: для каждого правила есть нарушающий образец из `<behavior>`, и правило на нём срабатывает. Допустимые образцы не срабатывают: `router.patch('/topics/:id', …)`, `'/api/docs/assets/proxy'`, импорт `services/access-policy/index.js`, `grants: {}`. Разбор регистраций ловит `router.patch('/:id/settings', sessionRequired(), requirePerm('tests', 'write'), …)` и пропускает `requirePerm` внутри тела обработчика.

Tracer: временный файл `app/server/src/routes/zz-guard-probe.ts` с `import fs from 'fs'` дал `fail 1` с нарушением `импорт fs, node:fs или fs/promises в маршруте`. Файл удалён, на текущем дереве 8 из 8 тестов pass.

## Task 3: сверка хранилища

RED → GREEN: сначала `reconcile.test.ts`. Прогон упал на `Cannot find module './reconcile.js'` (10 skipped). После реализации 2 теста упали: in-memory адаптер ставит `createdAt` с шагом +1 мс и может обогнать `Date.now()`, поэтому при `minAgeMs: 0` объект считался свежим. Исправление: `minAgeMs <= 0` отключает защиту по возрасту. Итог: 10 из 10 passed.

`reconcileStorage({ deleteOrphans = false, deleteLegacyJson = false, minAgeMs = ORPHAN_MIN_AGE_MS, now })`:

1. Из БД читаются вопросы (join `tests`, `topics`). Защищённое множество — `questionMarkdownCandidates` для `prompt.md` и `explanation.md` у каждого вопроса, указатель входит первым кандидатом.
2. `storage().list('topics', { recursive: true })`.
3. Классификация:
   - `topics/<t>/<s>/questions/<q>/<file>.md` вне множества — `orphans` или `recentOrphans`. Свежая сирота: `now - createdAt < minAgeMs`, нераспознанный `createdAt` тоже считается свежим;
   - `topics/<t>/<s>/answer_keys.json` и `settings.json` — `legacyJson`;
   - `topics/<t>/<s>/assets/…` — только `assetsCount`;
   - остальное вне множества — `unknown`. Сюда попадают вложенные `questions/<q>/images/…` и `topics/<t>/<s>/images/…`;
   - `missingPointers`: у непустого указателя не найден ни один кандидат. Ключи под `topics/` проверяются по списку, остальные — `exists`, некорректный ключ считается отсутствующим.
4. `deleteOrphans`: указатели и кандидаты перечитываются из БД, удаляются только `orphans` вне свежего множества. `recentOrphans` не удаляются.
5. `deleteLegacyJson`: удаляются только `legacyJson`.
6. Отчёт `{ orphans, recentOrphans, missingPointers, legacyJson, assetsCount, unknown, deleted: { orphans, legacyJson } }`.

Тест (`startAuthApp('test_storage_reconcile')`, общий `memoryStorage`, вопросы через `POST /api/tests/save`) проверяет:

- сироту, кандидатов с пустым `prompt_path` и кандидата `explanation.md` старого пути без указателя;
- `missingPointers` только для вопроса без кандидатов;
- `legacyJson` и `assets`;
- что без флагов множество ключей не меняется;
- каждый флаг по отдельности и оба вместе: `assets/`, `images/` и указатель остаются;
- свежую сироту: при `minAgeMs` по умолчанию она в `recentOrphans` и цела, при `now() + 2 ч` удаляется, при `minAgeMs: 0` удаляется;
- R6: `vi.spyOn(mem, 'list')` после возврата списка делает `UPDATE questions SET prompt_path = <ключ сироты>`. Ключ в `orphans`, но не удалён, указатель в БД — этот ключ.

CLI `src/scripts/storage-reconcile.ts` построен по образцу `asset-refs.ts`: `import '../config/env.js'`, флаги `--delete-orphans` и `--delete-legacy-json`, на неизвестный аргумент — ошибка. Печатает строки `[storage-reconcile] …` и в `finally` закрывает `pgPool.end()`. Смоук через `node scripts/with-test-db.mjs` после `drizzle:migrate`: отчёт без флагов и с обоими флагами — exit 0, `--bogus` — `unknown arguments`.

README сервера, раздел «Хранилище файлов»: подразделы «Сверка хранилища» (три команды, классы отчёта, что удаляет каждый флаг, что не удаляется никогда) и «Изолированный режим».

### Блокер STATE WR-04 закрыт

`[Phase 1 → Phase 7] Upload routes in isolated mode fail closed (WR-04)`. В изолированном режиме загрузки картинок, аватаров и файлов вопросов идут через модуль хранилища на драйвере `memory` (по умолчанию) или `local`. `assertLegacyUploadsAllowed` и запасной путь на диск удалены, охранный тест не даёт им вернуться. Запись в STATE снимает оркестратор.

### codegraph affected

`codegraph affected` по изменённым файлам плана (индекс основного дерева): `routes/tests/exam-flow.test.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `services/storage/storage-known-defects.test.ts`, `services/storage/storage.local.test.ts`, web-файлы `QuestionEditor.tsx`, `admin/tests/layout.tsx`, `MdxRenderer.tsx`, `TestRunner.tsx`, `scripts/storage-no-private-access.test.mjs`. Связи через `storage.ts` в индексе устарели: в worktree `storage.local.test.ts` и маршруты оболочку не импортируют. Все затронутые наборы входят в `yarn verify`, web-поток — в `yarn e2e`.

## Проверки

| Проверка | Результат |
| -------- | --------- |
| `yarn e2e` до правок (базовая линия после смены сида в 07-15) | 132 passed |
| `legacy storage facade removed` (Task 1) | печатается |
| `yarn workspace @bio-exam/server typecheck` | 0 ошибок |
| `vitest run src/routes/tests src/services/storage` через `with-test-db` | 16 файлов, 398 passed |
| `node --test scripts/storage-no-private-access.test.mjs` | pass 8, fail 0 |
| `vitest run src/services/question-content/reconcile.test.ts` через `with-test-db` | 10 passed |
| `<verification>`: reconcile + exam-flow + `src/services/storage` через `with-test-db` | 7 файлов, 281 passed |
| `yarn verify` | `yarn verify: OK`: server 1025, web 585, exam-core 599, rbac 3, script-tests 166 pass / 0 fail |
| Сверка с отпечатком | `07-16 changed only its files` |
| `yarn e2e` после правок | 132 passed |

`yarn workspace @bio-exam/server lint` выдаёт 4 предупреждения: `keys.ts` (`no-control-regex`), неиспользуемые `inArray` и `answerKeys` в `routes/tests/index.ts`, `inArray` в `backfill-question-search.ts`. Они есть и до плана, в файлах вне плана, и не трогались.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Защита по возрасту срабатывала при `minAgeMs: 0`**
- **Found during:** Task 3 (GREEN)
- **Issue:** in-memory адаптер делает `createdAt` монотонным (+1 мс на запись), поэтому `createdAt` может обогнать `Date.now()`. Тогда `now - createdAt < 0` и сирота считалась свежей даже при `minAgeMs: 0`.
- **Fix:** `minAgeMs <= 0` отключает защиту по возрасту. CLI параметр не передаёт, на проде действует 1 час.
- **Files modified:** app/server/src/services/question-content/reconcile.ts

### Решения исполнителя (автономно)

1. Кандидаты `explanation.md` считаются у всех вопросов. В плане сказано «пояснение — при непустом `explanation_path`», но `export.ts` (`MARKDOWN_FILES`) и `asset-index.ts` (`readQuestionTexts`) читают кандидатов пояснения без этого условия. Принят самый широкий читатель: такой файл не сирота, `--delete-orphans` его не удалит.
2. Удаляемая сирота — только `.md` прямо в каталоге вопроса. Прочие объекты под `questions/` (вложенные каталоги, картинки) попадают в `unknown` и не удаляются: это следует правилу «картинки скрипт не удаляет никогда».
3. Правило `assertLegacyUploadsAllowed` сканирует `app/server/src` вместе с тестами. Остальные правила сканируют только нетестовые файлы, как в must_haves.

## Known Stubs

Нет.

## Threat Flags

Нет новой поверхности вне `<threat_model>`. Скрипт сверки (T-7-46) удаляет только по флагам, тестами закрыты: без флагов ничего не меняется, сироты моложе часа не удаляются, указатели перечитываются перед удалением, `assets/` и `images/` не удаляются.

## Deferred human verification

Не выполнено, ждёт пользователя; исполнитель не одобрял. Исполнитель ничего не коммитил, не пушил, не деплоил, не менял env Vercel, не выполнял SQL и скрипты на проде и не подключался к проду и Supabase.

### Runbook выкатки фазы 7 (D-27, Task 4 плана 07-16, каркас 04-14 Task 4)

Шаги идут строго по порядку, каждый следующий — после успеха предыдущего. Инвентаризация `assets:refs` идёт до деплоя (D-19).

1. **Read-only на проде, до любых записей.**
   - SQL из `07-CONTEXT.md` `<specifics>`:
     - п. 1: префиксы бакета `SELECT split_part(name, '/', 1) AS prefix, count(*) FROM storage.objects WHERE bucket_id = 'main' GROUP BY 1 ORDER BY 2 DESC;` и счётчики `answer_keys.json`, `settings.json`, `topics/%/assets/%`;
     - п. 2: публичность бакета `SELECT id, public FROM storage.buckets;`;
     - п. 7, 8: устаревшие указатели и дыры в порядке (запросы — в пунктах 07-10 ниже);
     - п. 9;
     - п. 10: формы значений аватаров (запрос — в пунктах 07-08 ниже).
   - SQL 07-11 Task 4 п. 1–2 (ниже): все переопределения прав; владельцы `tests.*` и `groups.manage_groups` без `users.read`. Решение пользователя — до merge.
   - Префикс бакета вне `images`, `topics`, `avatars` → стоп (D-19).
   - Ключи с символами вне строгого алфавита: `SELECT name FROM storage.objects WHERE bucket_id = 'main' AND name !~ '^[A-Za-z0-9._/-]+$';` и то же условие по `questions.prompt_path`, `questions.explanation_path`, `users.avatar`, `users.avatar_cropped`. Ключ с `%`, `?` или `#` новый код не отдаёт (SEC-01, `07-REVIEW-DISPOSITION.md`) — стоп, решение пользователя до merge. Тот же признак проверяется в отчёте `assets:refs` шага 3.
   - История мигратора: `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 3;`. Верхняя запись — `0023_attempt_results_version` (when `1791111589181`), иначе стоп.
   - Выяснить, на какую базу смотрит `DATABASE_URL` server-проекта Vercel в среде Preview: прод или отдельная база.
   - Коммиты по границам планов 07-01…07-16 — локально, без push.
2. **Миграция.** `yarn workspace @bio-exam/server drizzle:migrate` с миграцией `0024_question_asset_refs` на проде:
   - если по шагу 1 preview смотрит в прод — до push ветки. Push сразу поднимает preview-деплой нового server, который без 0024 падает на `questions.assets_indexed`;
   - иначе — до merge в master.

   0024 аддитивна, текущий прод-код с ней работает. Повторно read-only: последняя запись мигратора — 0024 (hash `caa886d35aaa04844dd65d142dd71cb12c13929e3ef92785f385a211ce2755d3`, created_at `1791121706458`).
3. **Инвентаризация ссылок.** После шага 2 и до merge: `yarn workspace @bio-exam/server assets:refs` без флага из локальной ветки против прода, команда ничего не пишет. Непустой список ссылок вне `images/`, `topics/*/*/assets/`, `avatars/` или непустой `nonServable` — STOP ASSET-02 (D-19), решение пользователя до деплоя. Признак — последняя строка `[asset-refs] STOP D-19: …`.
4. **Удаление сохранённых JSON при публичном бакете.** Если по шагу 1 бакет `main` публичный: сразу, до push, `yarn workspace @bio-exam/server storage:reconcile --delete-legacy-json` из локальной ветки против прода. Команда удаляет `answer_keys.json` и `settings.json`, которые новый код не читает (`<specifics>` п. 2). Прежний код при экспорте с ответами пишет `answer_keys.json` снова, поэтому шаг повторяется в шаге 8.
5. **Push и preview.** Push ветки, PR в master, зелёный CI на HEAD; merge пока не делается. Preview ветки удобно проверить вместе с отложенными preview фаз 2–4. Если preview смотрит в прод, переименование, перенос и удаление — только на тестовой теме, тестовых вопросах и тестовых картинках. Проверки:
   - загрузка картинки в редакторе и показ в тесте;
   - отказ удаления используемой картинки в медиатеке: текст «Изображение используется в вопросах» в диалоге, кнопки «Удалить» нет, «Отмена» закрывает (07-09). До бэкфилла — отказ «Удаление недоступно: ссылки на изображения ещё не проиндексированы»;
   - переименование slug тестовой темы с файлами: промпты открываются по новому slug, под старым префиксом остались только `assets/`, `settings.json`, `answer_keys.json` (07-12). Время переименования самой крупной темы при `maxDuration: 30`. Число вопросов по темам: `SELECT t.slug, count(q.id) FROM topics t JOIN tests s ON s.topic_id = t.id JOIN questions q ON q.test_id = s.id GROUP BY 1 ORDER BY 2 DESC LIMIT 5;`. При превышении — решение пользователя (`COPY_CONCURRENCY` в `relocate.ts`, повтор безопасен). Неудачный перенос отменяет переименование тостом «Не удалось перенести файлы, переименование отменено»;
   - ZIP теста с картинками (07-14):
     - в архиве есть `images/…`, при пропусках — `missing-files.txt`;
     - `settings.json` сгенерирован заново;
     - `answer_keys.json` есть только при выгрузке с ответами;
     - сохранённые в бакете JSON в архив не попадают;
   - ZIP самой крупной темы с картинками: архив больше 4 400 000 байт даёт тост «Архив слишком большой для выгрузки, экспортируйте тесты по отдельности», а не обрезанный файл или ошибку платформы (лимит ответа функции Vercel 4,5 МБ);
   - аватар (07-08): загрузка, только кроп, удаление. После удаления под `avatars/<userId>/` объектов нет, в `users.avatar` новой загрузки лежит ключ, `/api/auth/me` отдаёт URL `/api/docs/assets/proxy?key=…`, а не публичный URL Supabase;
   - `GET /api/users` ролью `user` → 403; `GET /api/users/directory` для любого вошедшего — минимальные поля (07-11, D-20, D-21);
   - при недоступном Supabase страница теста отвечает ошибкой 503, а не пустыми промптами (07-07, `<specifics>` п. 12; фазу не блокирует);
   - адаптер Supabase вживую — критерий успеха 1 на живом бакете (07-02).
6. **Merge в master.** До merge web-проект Vercel настраивается так, чтобы production-деплой web не стал активным сам: Ignored Build Step на коммит merge или отключённое автопродвижение с ручным Promote. Production-деплой server доходит до статуса Ready, картинки и вход на проде работают через старый web. Только после этого — сборка или Promote production-деплоя web.
7. **Бэкфилл индекса.** `yarn workspace @bio-exam/server assets:refs --write` — после того как server и web из шага 6 активны. До бэкфилла удаление в медиатеке отклоняется.
8. **Сверка.** `yarn workspace @bio-exam/server storage:reconcile` без флагов. Отчёт: сироты под `topics/*/*/questions/`, свежие сироты моложе часа, указатели на отсутствующие объекты, сохранённые `answer_keys.json` и `settings.json`, число `assets/`, прочие объекты. `--delete-legacy-json` — повторно, если бакет публичный. `--delete-orphans` — только решением пользователя.
8а. **Приватный бакет.** После шага 6, когда server и web нового кода активны: в Supabase у бакета `main` выключается Public. Проверка: `SELECT id, public FROM storage.buckets;` даёт `false`; картинки в тестах и аватары открываются у вошедшего; прямой URL `…/storage/v1/object/public/main/…` отвечает 400 или 404. Откат кода по шагу 9 требует сначала вернуть бакет в публичный: прежний код отдаёт аватары публичными URL.
9. **Откат, если нужен.** В обратном порядке: сначала web, потом server, через Instant Rollback Vercel на предыдущий production-деплой, не пересборкой.
   - После отката server аватары, загруженные после деплоя, хранятся ключом. Прежний код показывает ключ как относительный URL, такие картинки не открываются до повторной загрузки (07-08).
   - Прежний код не обновляет индекс ссылок. Перед повторной выкаткой — `UPDATE questions SET assets_indexed = false;`, после неё — снова шаг 7 (07-15 Task 4 п. 5).
   - Миграция 0024 не откатывается: она аддитивна.
10. **Подтверждения решений, принятых автономно:** CONTEXT `<specifics>` п. 1–14, D-01…D-27 с пометкой [авто]. В частности:
    - D-06: `/proxy` и `/signed` не отдают `.md` и `.json` из `topics/`;
    - D-14: список, загрузка и удаление в медиатеке только с `tests.write`;
    - D-20, D-21: справочник `/api/users/directory`;
    - `<specifics>` п. 11: удалить ли `POST /api/tests/:id/assets` (07-14);
    - решения исполнителя этого плана (раздел выше).

### Отложенные пункты планов 07-01…07-15

Не выполнено, ждёт пользователя; исполнитель не одобрял.

- **07-01.** Локальная разработка без Supabase: в локальном `.env` задать `STORAGE_DRIVER=local` и абсолютный `STORAGE_LOCAL_DIR`, запустить `yarn dev`, открыть страницу теста и медиатеку редактора. Прод не меняется: в env Vercel заданы `SUPABASE_URL` и `SUPABASE_SERVICE_KEY`.
- **07-02.** Живой адаптер Supabase проверяется на preview (шаг 5). В `yarn verify` он проходит набор на подделке клиента.
- **07-06.**
  - Read-only инвентаризация бакета и проверка публичности — шаг 1.
  - Подтвердить D-06 и D-14 — шаг 10.
  - Статика `/uploads` и rewrite удалены: картинки, сохранённые раньше в `app/web/public/uploads`, больше не открываются.
- **07-07.** 503 при недоступном Supabase — шаг 5.
- **07-08.**
  - Формы значений аватара, только чтение:
    `SELECT CASE WHEN avatar LIKE 'http%' THEN 'url' WHEN avatar LIKE '/uploads/%' THEN 'legacy_local' ELSE 'key' END AS kind, count(*) FROM users WHERE avatar IS NOT NULL GROUP BY 1;`
    и тот же запрос по `avatar_cropped`. После деплоя значения `legacy_local` не откроются.
  - Проверка аватара на preview — шаг 5.
  - Риск для Milestone 2: на локальном адаптере URL аватара относительный, и `PATCH /api/users/profile` (`z.string().url()`) его отклонит. Решение пользователя нужно до включения локального адаптера.
  - Откат — шаг 9.
- **07-09.** Диалог удаления с отказом 409 на preview — шаг 5. Под учеником кнопки «Медиатека» в редакторе нет.
- **07-10.** Read-only до выкатки:
  - `SELECT count(*) FILTER (WHERE prompt_path IS NULL) AS no_prompt, count(*) FILTER (WHERE prompt_path !~ '^topics/[^/]+/[^/]+/questions/[0-9a-f-]{36}/prompt\.md$') AS noncanonical FROM questions;`
  - `SELECT count(*) FROM (SELECT test_id FROM questions GROUP BY test_id HAVING count(*) <> count(DISTINCT "order") OR max("order") <> count(*) - 1 OR min("order") <> 0) t;`

  Тесты с дырами в порядке выравниваются при следующей записи.
- **07-11.**
  - Все переопределения прав: `SELECT role_key, domain, action, allow FROM rbac_role_grants ORDER BY 1, 2, 3;` и `SELECT user_id, domain, action, allow FROM rbac_user_grants ORDER BY 1, 2, 3;`.
  - Запрос владельцев `tests.read`, `tests.write`, `tests.manage_assignments`, `groups.manage_groups` без `users.read` и без `admin` — полный текст в `07-11-SUMMARY.md`, пункт 2. Непустой результат — решение пользователя до выкатки: выдать `users.read` переопределением или принять пустой список.
  - Web при 403 от `/api/users`: `GroupSheet.tsx` и `useTestEditorModel.ts` молча показывают пустой список — отдельная задача по решению пользователя.
  - Подтвердить D-20 и D-21.
  - Пересмотр гейта `/admin/users` — вне фазы.
- **07-12.** Переименование темы и замер времени — шаг 5.
- **07-13.** На копии прод-данных проверить, что тесты с дырами или дублями `order` выравниваются в 0…n-1 после удаления вопроса, переноса в тест и из теста и reorder (SQL — `07-CONTEXT.md` `<specifics>` п. 8).
- **07-14.**
  - ZIP теста и крупной темы — шаг 5.
  - Удаление `POST /api/tests/:id/assets` — шаг 10.
- **07-15.** Шаги миграции 0024, инвентаризации, бэкфилла и отката вошли в runbook: шаги 1, 2, 3, 7, 9.
- **Все планы 07-01…07-16.** Коммит файлов делает пользователь или оркестратор.

## Файлы к коммиту

- `scripts/storage-no-private-access.test.mjs` (новый)
- `app/server/src/services/storage/storage.ts` (удалён)
- `app/server/src/services/storage/storage-known-defects.test.ts`
- `app/server/src/routes/tests/exam-flow.test.ts`
- `app/server/src/services/question-content/reconcile.ts` (новый)
- `app/server/src/services/question-content/reconcile.test.ts` (новый)
- `app/server/src/services/question-content/index.ts`
- `app/server/src/scripts/storage-reconcile.ts` (новый)
- `app/server/package.json`
- `app/server/README.md`

## Self-Check: PASSED

- FOUND: `scripts/storage-no-private-access.test.mjs`, `app/server/src/services/question-content/reconcile.ts`, `reconcile.test.ts`, `app/server/src/scripts/storage-reconcile.ts`.
- DELETED: `app/server/src/services/storage/storage.ts`.
- `git status --porcelain --untracked-files=all` в worktree — ровно 10 путей из списка «Файлы к коммиту».
- Коммиты: не выполнялись (правило пользователя), `actuals.commits: 0`.

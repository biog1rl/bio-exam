---
phase: 08-client-requests-runtime-and-decomposition
plan: FIX-B
subsystem: api, web
tags: [review-fixes, attempts, pagination, sidebar]
status: complete
deferred_human_gate: true
requires:
  - 08-REVIEW-DISPOSITION.md, пакет B
  - 08-FIX-A (lib/settings/sidebar-items.ts, ADMIN_LINK)
provides:
  - "GET /api/tests/admin/attempts: limit, offset, q, topic, student, from, to, status; ответ rows, total, limit, offset, summary, scopeTotal, facets"
  - "escapeLike экспортируется из services/search"
  - "lib/tests/admin-api.ts: adminTestsKeys.attempts(filters, offset), parseAdminAttempts, adminAttemptsFetcher, fetchAdminAttemptsPage, attemptsDayRange, mergeAttemptPages, ATTEMPTS_PAGE_SIZE, ATTEMPTS_LOAD_ERROR, DEFAULT_ATTEMPTS_FILTERS"
  - "lib/settings/sidebar-items.ts: activeSidebarUrl(urls, pathname)"
affects:
  - "/admin/attempts: SSR первой страницы, фильтры на сервере, «Показать ещё»"
  - "AppSidebar: подсветка только пункта текущего адреса"
tech-stack:
  added: []
  patterns:
    - "первая страница через useSWR со строковым ключом, следующие — request() в локальном состоянии под тем же ключом"
    - "валидация query через zod внутри обработчика, цепочка middleware не меняется"
key-files:
  created:
    - app/server/src/routes/tests/admin-attempts-list.test.ts
    - e2e/tests/attempts-list.spec.ts
  modified:
    - app/server/src/routes/tests/admin/attempts.ts
    - app/server/src/services/search/database-search.ts
    - app/server/src/services/search/index.ts
    - app/server/README.md
    - app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx
    - app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts
    - app/web/app/(internal)/(protected)/admin/attempts/page.tsx
    - app/web/lib/tests/admin-api.ts
    - app/web/lib/tests/admin-api.test.ts
    - app/web/lib/settings/sidebar-items.ts
    - app/web/lib/settings/sidebar-items.test.ts
    - app/web/components/AppSidebar.tsx
decisions:
  - "status по умолчанию на сервере all (существующие вызовы ?limit=100 сохраняют total = rows.length); web всегда шлёт status, по умолчанию active"
  - "q ищет по studentNameIn(scope), названию теста и темы; логин отдельным ILIKE только при scope.all"
  - "ветка логина — по scope.all из testScope(req), как в studentNameIn (SEC-06 фазы 07.1), без второго вызова access-policy (hasGlobalZone)"
  - "escapeLike экспортирован из services/search (database-search.ts), а не скопирован"
  - "догрузка без useSWRInfinite: ошибка ревалидации первой страницы молчит, ошибка догрузки — тост"
  - "useDebounce взят из components/editor/editor-hooks/use-debounce.ts (lodash), файла lib/hooks/use-debounce.ts нет"
  - "заголовок блока ошибки и запасной текст тоста — «Не удалось загрузить попытки»"
  - "activeSidebarUrl выбирает самый длинный совпавший адрес; флаг isActive из базы на подсветку не влияет"
metrics:
  duration: ~70 мин
  completed: 2026-10-05
actuals:
  tasks: 3
  commits: 0
plan_head_before: af98c1c
plan_head_after: af98c1c
---

# Фаза 8, пакет B (08-FIX-B): список попыток на сервере и подсветка меню

Фильтры списка попыток работают на сервере. Попытка старше последних 100 теперь находится фильтром ученика и поиском. Ответ сервера дополнен сводкой, общим числом попыток в зоне и списками тем и учеников по всей зоне. Экран загружает первую страницу на сервере и догружает следующие кнопкой «Показать ещё». В боковом меню подсвечивается только пункт текущего адреса.

Коммит не выполнялся по правилу пользователя, изменения лежат в рабочем дереве. База — `af98c1c` (удаление `object-access` сделал оркестратор, в этот пакет оно не входит).

## Сервер: `GET /api/tests/admin/attempts`

- Параметры проверяются zod-схемой `AttemptsQuerySchema` внутри обработчика:
  - `limit` 1…100, по умолчанию 50;
  - `offset` — целое ≥ 0;
  - `q` — до 200 символов после `trim`;
  - `topic` — slug;
  - `student` — uuid;
  - `from`, `to` — ISO-время со смещением;
  - `status` — `active` | `inactive` | `all`, по умолчанию `all`.

  Неверное значение даёт 400 `{ error: 'Invalid attempts query', details }`, как в `routes/search.ts`. Повтор параметра (массив) тоже даёт 400.
- Фильтры: `topics.slug`, `users.id`, `submitted_at >= from`, `submitted_at <= to` (обе границы включительно), `users.is_active` по `status`. `q` даёт `ILIKE '%…%'` с `escapeLike` (экранирует `%`, `_`, `\`) по `studentNameIn(scope)`, `tests.title` и `topics.title`. По `users.login` поиск идёт только при `scope.all`. Без `zone.all` логин не попадает ни в имя, ни в поиск, ни в `facets.students`.
- Зона прежняя: `testScope(req)` и `studentAttemptsInScope(scope)`, попытки персонала исключены. Фильтр по чужой теме или чужому ученику у учителя даёт 200 с пустым списком.
- Ответ: прежние `rows`, `total` (с фильтрами), `limit`, `offset`. Новые поля:
  - `summary: { passed, averageScore }` — по отфильтрованному набору, `averageScore` округлён до 0,1, как на панели;
  - `scopeTotal` — число попыток в зоне без фильтров;
  - `facets.topics: [{ slug, title }]` и `facets.students: [{ id, name, isActive }]` — по всей зоне, а не по странице.

  Пустая зона отдаёт те же поля нулями.
- Сортировка: `submitted_at desc, id desc`. Второй ключ нужен, чтобы при равном времени страницы не пересекались.
- Другие потребители маршрута (найдены через `rg` по `app`, `e2e`, `scripts`) не сломались. Это `teacher-zone-tests.matrix.test.ts` (вызовы `?limit=100` без `status`, проверка `total === rows.length`), `registration.characterization.test.ts`, охранные `teacher-zone-guards.test.mjs` (обработчик по-прежнему вызывает `testScope(`) и `attempt-integrity-guards.test.mjs`. Других web-потребителей, кроме страницы списка, нет.
- `escapeLike` в `services/search/database-search.ts` стал экспортируемым и реэкспортирован из `services/search/index.ts`. Тело функции не менялось.
- Цепочка middleware не менялась (валидация внутри обработчика), поэтому `route-inventory.txt` не перегенерировался. Diff снимка пустой, `route-inventory.snapshot`/`route-inventory.test.ts` зелёные в `yarn verify`.
- `app/server/README.md`: в разделе «Попытка теста» добавлен абзац с параметрами и ответом списка.

## Web: `/admin/attempts`

- `page.tsx` (SSR): `serverRequest(adminTestsKeys.attempts(DEFAULT_ATTEMPTS_FILTERS), { parse: parseAdminAttempts })` + `requireServerData`. Первая страница — 50 строк активных учеников. Ключ (`initialKey`) передаётся клиенту.
- Доменный слой `lib/tests/admin-api.ts`:
  - `adminTestsKeys.attempts(filters, offset?)` — строка `/api/tests/admin/attempts?limit=50[&offset=N]&status=…[&q][&topic][&student][&from][&to]`, `q` обрезается;
  - `parseAdminAttempts` проверяет `rows`, `total`, `scopeTotal`, `summary`, `facets` и иначе бросает `MalformedBodyError`;
  - `adminAttemptsFetcher = fetcherWith(parseAdminAttempts)` на уровне модуля;
  - `fetchAdminAttemptsPage(filters, offset)` — `request` с `fallbackMessage: 'Не удалось загрузить попытки'`;
  - `attemptsDayRange(range)` — начало первого и конец последнего выбранного дня в локальном времени как ISO; один день — с 00:00:00.000 до 23:59:59.999;
  - `mergeAttemptPages(pages)` — склейка без повторов по `attemptId`, `loaded` (сырое число строк для `offset`), `total` последней страницы, `hasMore = loaded < total` и последняя страница не пуста.
- `AdminAttemptsClient`:
  - фильтры лежат в строковом ключе `useSWR(key, adminAttemptsFetcher)`;
  - `fallbackData` передаётся только при `key === initialKey`;
  - `revalidateOnMount: false` (первая страница уже пришла с сервера; при смене ключа SWR всё равно запрашивает: проверено по исходнику SWR 2.3, `isInitialMount`);
  - `revalidateOnFocus`/`revalidateOnReconnect` выключены, чтобы первая страница не сдвигалась под догруженными;
  - поиск: поле обновляется сразу, в ключ значение попадает через `useDebounce` (300 мс, lodash). «Сбросить» отменяет отложенный вызов.
- «Показать ещё» догружает `offset = loaded` через `fetchAdminAttemptsPage` и складывает страницы в состояние под ключом запроса:
  - при смене фильтров ключ меняется, догруженные страницы не показываются, список начинается с первой страницы;
  - ответ на устаревший ключ отбрасывается;
  - во время догрузки кнопка `disabled`, `aria-busy`, со спиннером `Loader2`;
  - ошибка догрузки — `toast.error(failureMessage(outcome, 'Не удалось загрузить попытки'))`, загруженные строки остаются, кнопка снова активна;
  - кнопка скрыта, когда загружено `total`.
- Плитки:
  - «всего в базе» — `scopeTotal`;
  - «показано» — `N из total`, при полной загрузке просто `N`;
  - «пройдено» и «средний результат» — из `summary`;
  - «тем» — `facets.topics.length`.

  Списки тем и учеников берутся из `facets` текущего ответа, до него — из ответа SSR, поэтому `Select` не теряет пункты во время загрузки. Ученики фильтруются по статусу через `matchesUserStatus`, смена статуса сбрасывает ученика, как раньше.
- Состояния:
  - `LoadErrorAlert` «Не удалось загрузить попытки» при `error && data === undefined`, повтор — `mutate()`, фокус — на `h1` (`tabIndex={-1}`);
  - ошибка ревалидации при загруженных данных молчит;
  - пока первая страница новых фильтров не пришла, на месте списка `role="status"` «Загрузка...», плитки сводки показывают «—»;
  - пустые состояния и остальные тексты не менялись.

## Меню

- `activeSidebarUrl(urls, pathname)` в `lib/settings/sidebar-items.ts` выбирает самый длинный совпавший внутренний адрес (`pathname === url` или вложенный путь, `/` — только на `/`, хвостовой `/` игнорируется). `AppSidebar` подсвечивает пункт, у которого `url === activeUrl`. Флаг `item.isActive` из базы (это флаг видимости) на подсветку больше не влияет. «Админка» активна на `/admin` и вложенных. Строка `deferred-items.md` про подсветку закрыта этим пакетом.

## Красный → зелёный

- Сервер `routes/tests/admin-attempts-list.test.ts` (новый, `startAuthApp('test_attempts_list')` + `seedTeacherZoneWorld(ctx, 'atl')`). 105 попыток `s1` по `tX`, старая попытка (2020-01-15T10:00Z) нового ученика по `tX2` и попытка неактивного ученика вставлены прямо в `test_attempts` через `ctx.pgPool`. Путь через API занял бы 107 пар старт/сдача и не позволил бы задать `submitted_at`. На текущем коде: **11 failed / 1 passed**. Прошёл только обход по `offset`, который работал и раньше. Падения:
  - `нет facets`;
  - `summary`/`scopeTotal` отсутствуют;
  - `topic` и `from`/`to` не фильтровали;
  - админ по логину получил `total` 111 (`q` игнорировался);
  - `limit=0` → 200 вместо 400;
  - тело пустой зоны без `summary`/`scopeTotal`/`facets`.

  После правки 12/12. Соседние `teacher-zone-tests.matrix.test.ts`, `registration.characterization.test.ts` и тесты инвентаря маршрутов: 192 passed. Охранные `teacher-zone-guards`/`attempt-integrity-guards`: 25 pass.
- Web `lib/tests/admin-api.test.ts`, 8 новых тестов: ключ и умолчания, кодирование, `attemptsDayRange`, `parseAdminAttempts`, фетчер и `fetchAdminAttemptsPage` с запасным текстом, `mergeAttemptPages` (повтор на стыке, скрытие при `total`, пустая страница). Красный: `adminTestsKeys.attempts is not a function`, `attemptsDayRange`/`parseAdminAttempts is not a function`, `ATTEMPTS_PAGE_SIZE` undefined.
- Web `lib/settings/sidebar-items.test.ts`, 3 новых теста: флаг `isActive` из базы не подсвечивает, «Админка» на `/admin/*`, самый точный из вложенных, корень. Красный: `activeSidebarUrl is not a function`. После правки оба файла 72/72.
- e2e `e2e/tests/attempts-list.spec.ts` (новый, desktop и mobile):
  1. Поиск уходит на сервер с `q` и `status=active`, неизвестный запрос показывает «Ничего не найдено», «Сбросить» возвращает список.
  2. «Показать ещё» через `page.route` (первая страница из 1 строки при `total` 2). Первая догрузка отвечает 500: тост «Не удалось загрузить попытки», строка остаётся, кнопка активна. Вторая догрузка добавляет строку, кнопка исчезает. Перехват работает на клиентском запросе после смены фильтра (SSR перехватить нельзя).

  На старом коде спецификация не запускалась. Старый экран фильтровал локально и не слал запрос с `q`, поэтому `waitForRequest` первого сценария не дождался бы запроса, а кнопки «Показать ещё» не было.

## Проверки

- `yarn verify` в worktree: `yarn verify: OK` с первого прогона, флейка 57P01 не было. Шаги lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests — passed. Тесты: web 81 файл / 1460, server 80 / 1696, exam-core 605, rbac 9, script-tests 217. После добавления e2e-спецификации и README `yarn verify` перезапущен — снова OK.
- `yarn e2e` в worktree: 196 passed (до новой спецификации), затем 200 passed (2.5m) с `attempts-list.spec.ts`.
- `oxfmt --check .` чистый; lint web и server без новых предупреждений в затронутых файлах.

## Отклонения от плана

1. **[Rule 2] `id desc` вторым ключом сортировки.** Без него страницы по `offset` при равном `submitted_at` могли пересекаться или терять строки.
2. **Решения исполнителя (автономно):**
   - заголовок блока ошибки — «Не удалось загрузить попытки»: строки для этого экрана в UI-SPEC нет, взята формулировка фазы 6 (UI-SPEC:531);
   - при загрузке первой страницы новых фильтров — «Загрузка...» на месте списка и «—» в плитках сводки: раньше экран не загружал данные на клиенте;
   - «показано» — `N из total`;
   - хук `useDebounce` взят из `components/editor/editor-hooks/use-debounce.ts`: файла `lib/hooks/use-debounce.ts` нет, переносить хук не стал (`useLatestRef` импортируют тесты по текущему пути).
3. **README сервера** дополнен описанием параметров списка. Это вне таблицы пакета, но контракт маршрута изменился.

## Deferred human verification

- **Коммит пакета.** Не выполнено, ждёт пользователя; исполнитель не одобрял. Файлы — ниже. Удаление `object-access` уже в `af98c1c` и в этот пакет не входит.

## Файлы к коммиту

Изменённые:
- `app/server/README.md`
- `app/server/src/routes/tests/admin/attempts.ts`
- `app/server/src/services/search/database-search.ts`
- `app/server/src/services/search/index.ts`
- `app/web/app/(internal)/(protected)/admin/attempts/AdminAttemptsClient.tsx`
- `app/web/app/(internal)/(protected)/admin/attempts/attempts-types.ts`
- `app/web/app/(internal)/(protected)/admin/attempts/page.tsx`
- `app/web/components/AppSidebar.tsx`
- `app/web/lib/settings/sidebar-items.test.ts`
- `app/web/lib/settings/sidebar-items.ts`
- `app/web/lib/tests/admin-api.test.ts`
- `app/web/lib/tests/admin-api.ts`

Новые:
- `app/server/src/routes/tests/admin-attempts-list.test.ts`
- `e2e/tests/attempts-list.spec.ts`

Вне git (общий `.planning`): `08-FIX-B-SUMMARY.md`, строка в `deferred-items.md`.

## Self-Check: PASSED

- Новые файлы на месте (`git status`: 2 untracked, 12 modified).
- Коммитов нет по правилу пользователя: `commits: 0` при изменениях в рабочем дереве — ожидаемо.

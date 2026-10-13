---
phase: 08-client-requests-runtime-and-decomposition
plan: FIX-A
subsystem: web, api
tags: [review-fixes, editor, groups, sidebar, search, export, rate-limit]
status: complete
deferred_human_gate: true
requires:
  - 08-REVIEW-DISPOSITION.md, пакет A
provides:
  - TOGGLE_TRANSFORMERS и $toggleMarkdown (components/editor/utils/markdown-toggle.ts)
  - EMOJI_ALIAS_PATTERN с обязательной буквой
  - groupSaveDisabled({ saving, editing, membersReady }), groupMembersSeed
  - topicSaveFailure, TOPIC_SLUG_TAKEN (lib/tests/bank-view.ts)
  - lib/settings/sidebar-items.ts (ADMIN_LINK, sidebarNavItems, sidebarReloadFailure, moveSidebarItem, SIDEBAR_RELOAD_ERROR)
  - SEARCH_DB_CONCURRENCY = 2, rateLimiter на GET /api/search
  - EXPORT_CONCURRENCY = 2, EXPORT_BUSY_MESSAGE в routes/tests/admin/export.ts
  - rateLimiter: необязательный clientKey(req)
affects:
  - 08-BENCHMARKS.md / 08-28: maxConcurrentQueries поиска «после» теперь 2, а не 5
tech-stack:
  added: []
  patterns:
    - семафор на процесс в обработчике маршрута, освобождение в finally и по close ответа
    - свежая загрузка состава группы на каждое открытие, засев один раз
key-files:
  created:
    - app/web/components/editor/utils/markdown-toggle.ts
    - app/web/components/editor/utils/markdown-toggle.test.ts
    - app/web/lib/settings/sidebar-items.ts
    - app/web/lib/settings/sidebar-items.test.ts
    - app/server/src/routes/search-limits.test.ts
  modified:
    - app/web/components/editor/plugins.tsx
    - app/web/components/editor/plugins/actions/markdown-toggle-plugin.tsx
    - app/web/components/editor/transformers/markdown-emoji-transformer.ts
    - app/web/components/editor/utils/emoji-table.ts
    - app/web/components/editor/utils/emoji-table.test.ts
    - app/web/components/editor/utils/mdx-emoji-load.test.ts
    - app/web/components/groups/GroupSheet.tsx
    - app/web/lib/groups/group-form.ts
    - app/web/lib/groups/group-form.test.ts
    - app/web/lib/tests/bank-view.ts
    - app/web/lib/tests/bank-view.test.ts
    - app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx
    - app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx
    - app/web/components/AppSidebar.tsx
    - app/web/components/Search/SearchDialog.tsx
    - app/server/src/services/search/database-search.ts
    - app/server/src/services/search/database-search.test.ts
    - app/server/src/middleware/rateLimiter.ts
    - app/server/src/routes/search.ts
    - app/server/src/routes/tests/admin/export.ts
    - app/server/src/routes/tests/export-routes.test.ts
    - app/server/route-inventory.txt
decisions:
  - "CR-03: переключатель markdown получил свой модуль markdown-toggle.ts со списком TOGGLE_TRANSFORMERS, где AUTOCOMPLETE стоит перед EMOJI; список MarkdownShortcutPlugin не менялся"
  - "CR-08: 409 разбирается на web (setSlugError), серверная константа TOPIC_SLUG_EXISTS осталась английской, чтобы не трогать relocate.test.ts и admin-api.test.ts"
  - "CR-05: состав группы грузится запросом groupDetailFetcher при каждом открытии, без useSWR; SWR mutate() не годится, потому что при сбое возвращает старые данные из кэша"
  - "Поиск: ограничитель 60 в минуту считается по пользователю (clientKey = id сессии), без сессии — по IP; rateLimiter получил необязательный clientKey, имя middleware не изменилось"
  - "Экспорт: 429 отдаётся прямым res.status(429).json, как 403 в том же обработчике; место занимается после проверки прав и до prepare…Archive"
  - "«Админка» добавляется при рендере поверх пунктов из базы и видна, даже если GET /api/sidebar не ответил"
metrics:
  duration: ~75 мин
  completed: 2026-10-05
actuals:
  tasks: 10
  commits: 0
---

# Фаза 8, пакет A (08-FIX-A): правки по ревью кода

Переключатель markdown больше не переносит подсказку автодополнения в текст вопроса. Цифровые соотношения (`1:100:1`, `9:3:3:1`) не считаются алиасами эмодзи. Форма группы сохраняет только состав, полученный в этом открытии. Занятый адрес темы показывается у поля. Список пунктов меню откатывается и сообщает о сбое. В меню есть встроенный пункт «Админка». Поиск занимает не больше двух соединений пула и стоит под ограничителем частоты. Экспорт ZIP пропускает не больше двух сборок одновременно.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Строки таблицы

### CR-03: подсказка автодополнения в переключателе markdown

- Сделано: логика `handleMarkdownToggle` вынесена в `$toggleMarkdown(shouldPreserveNewLinesInMarkdown)` (`components/editor/utils/markdown-toggle.ts`). Список `TOGGLE_TRANSFORMERS` теперь включает `AUTOCOMPLETE` перед `EMOJI`. `MarkdownTogglePlugin` больше не принимает `transformers`, `plugins.tsx` передаёт только `shouldPreserveNewLinesInMarkdown`. Список `MarkdownShortcutPlugin` не тронут.
- Тест: `components/editor/utils/markdown-toggle.test.ts` (по образцу пробы `da08code/cr03-toggle.test.ts`, вызывается настоящий `$toggleMarkdown`). Проверяется абзац `trace text` с `AutocompleteNode('books (TAB)')`: после первого нажатия в блоке кода и в MDX слушателя нет `books`/`(TAB)`, после второго MDX равен `trace text`.
- Красный → зелёный: сначала код перенесён как есть, со старым списком без `AUTOCOMPLETE`. Тест упал: `Expected: "trace text"`, `Received: "trace textbooks (TAB)"`. После добавления `AUTOCOMPLETE` 2/2 passed.
- После `yarn verify` и `yarn e2e` в тот же файл добавлена проверка: `TOGGLE_TRANSFORMERS` совпадает с `MDX_TRANSFORMERS` по составу и порядку, чтобы списки снова не разошлись. Файл 3/3, `tsc --noEmit` web чистый, `oxfmt --check .` чистый. Изменение только в тесте, поэтому `yarn verify` не перезапускался.

### CR-12 и «Пропущено»: цифровые алиасы эмодзи

- Сделано: `EMOJI_ALIAS_PATTERN` = `/:[a-z0-9_]*[a-z][a-z0-9_]*:/`. В `EMOJI.importRegExp` и `EMOJI.regExp` та же форма с группой. Алиас без буквы не ждёт чанк таблицы и не заменяется, даже если таблица содержит `100` и `1234`.
- Тест: в `emoji-table.test.ts` — шаблон на `1:100:1`, `9:3:3:1`, `:1234:`, `:1st_place_medal:`, `:smile:`. В `mdx-emoji-load.test.ts` — для трёх строк `mdxToEditorState` при незавершающейся загрузке таблицы разрешается без вызова `load`, и текст остаётся как был. При загруженной таблице с цифровыми алиасами текст не меняется. `:smile:` рядом с `1:100:1` превращается в `😄`.
- Красный → зелёный: 7 падений. Шаблон совпадал с цифровыми строками. Конвертация ждала таблицу и упиралась в таймаут 5 с. `Соотношение 1:100:1` → `Соотношение 1💯1`, `Код :1234: без букв` → `Код 🔢 без букв`. После правки 4 файла, 48 тестов passed (вместе с `mdx-golden.test.ts`).

### CR-05: форма группы и устаревший состав

- Сделано: `GroupSheet` на каждое открытие с группой запрашивает `groupDetailFetcher(groupsKeys.detail(id))`. Состав засевается в `selectedIds` один раз на открытие: `groupMembersSeed` и `seededForRef`, флаги сбрасываются при закрытии. «Сохранить группу» выключена, пока в этом открытии не пришёл ответ (`groupSaveDisabled({ saving, editing, membersReady })`). Сбой запроса показывает «Не удалось загрузить участников группы», кнопка остаётся выключенной. После успешного сохранения `mutate(groupsKeys.detail(group.id))` через `useSWRConfig`.
- Тест: `lib/groups/group-form.test.ts`. Для `groupSaveDisabled`: правка без свежего состава выключена, новая группа не ждёт. Для `groupMembersSeed`: засев один раз, ответ для чужой группы не засевает.
- Красный → зелёный: 3 падения. `groupSaveDisabled({ saving: false, editing: true, membersReady: false })` вернул не `true`: старая формула смотрела на `membersLoading`/`membersFailed`. Кроме того, `groupMembersSeed is not a function`. После правки 12/12.
- Решение исполнителя (автономно): `useSWR` для детали заменён явным запросом. Причина: ни `isValidating`, ни `mutate()` из SWR не гарантируют свежий ответ. Повторное открытие в пределах `dedupingInterval` переиспользует завершённый запрос, а `mutate()` при сбое отдаёт старые данные кэша. Других потребителей ключа `groupsKeys.detail` в web нет.

### CR-08: занятый адрес темы

- Сделано: в `lib/tests/bank-view.ts` добавлен `topicSaveFailure(failure)`. На `http` 409 он даёт `{ slugError: 'Тема с таким адресом уже существует', toast: '' }`, на остальные отказы — тост `failureMessage(…, 'Ошибка сохранения')`. `TopicFormDialog` ставит `setSlugError` у поля адреса, тоста при 409 нет.
- Тест: `lib/tests/bank-view.test.ts`, 409 с английским телом сервера, 500, 400 с английским `error`, `auth`.
- Красный → зелёный: `TypeError: topicSaveFailure is not a function`. Старый путь `failureMessage(409, 'Ошибка сохранения')` давал «Ошибка сохранения» без указания на поле. После правки 42/42.

### CR-10: список пунктов меню после сбоя

- Сделано: `lib/settings/sidebar-items.ts`. `sidebarReloadFailure({ loaded, kind })` возвращает `silent` для `auth`/`aborted`, `block` для первой загрузки и `toast` для перезагрузки после первой загрузки. Тост — «Ошибка загрузки пунктов меню». `moveSidebarItem(items, activeId, overId)` возвращает новый массив с пересчитанным `order` и не меняет исходный. `SidebarSettingsClient.handleDragEnd` сохраняет `previousItems` до оптимистичного порядка, при отказе записи откатывает к ним, затем перезагружает список. `arrayMove` из `@dnd-kit/sortable` больше не импортируется.
- Тест: `lib/settings/sidebar-items.test.ts`.
- Красный → зелёный: `Cannot find module './sidebar-items'`. Модуля не было, а `loadItems` после первой загрузки молчал. После правки 8/8.

### CR-15: «Ищем…» при исходе `auth`

- Сделано: в `SearchDialog.runSearch` для `auth` сначала `setLoading(false)`, потом `return`. `aborted` выходит без изменений.
- Тест: по таблице нет, проверено `yarn verify`.

### CR-16 (часть): мёртвые `object-access.ts` и тест — НЕ выполнено

- Удаление `app/web/lib/session/object-access.ts` и `app/web/lib/session/object-access.test.ts` отклонил классификатор прав среды исполнения («Irreversible Local Destruction»). Обходить запрет не стал. Импортов этих файлов вне собственного теста нет, их удаление `yarn verify` не ломает. Шаг перенесён в «Deferred human verification».

### Поиск (решение пользователя)

- Сделано: в `services/search/database-search.ts` добавлен `SEARCH_DB_CONCURRENCY = 2`. Категории выполняются через `mapBounded(scopes, SEARCH_DB_CONCURRENCY, …)` из `services/question-content/index.js` (как в `scored-attempt/facts.ts`). Порядок категорий и быстрый отказ при ошибке сохранены. На `GET /api/search` после `sessionRequired()` стоит `rateLimiter({ maxAttempts: 60, windowMs: 60_000, keyPrefix: 'search', clientKey })`, имя `rateLimiter(search,60/60000ms)`. Ключ — `user:<id>` из сессии, без сессии — IP.
- Тесты:
  - `services/search/database-search.test.ts` (счётчик шва из 08-08): ожидания `maxConcurrent` 5/5/3 заменены на `SEARCH_DB_CONCURRENCY`, у случайных задержек — `≤ 2`. Добавлена проверка `SEARCH_DB_CONCURRENCY === 2`.
  - `routes/search-limits.test.ts`, новый. `instrumentPool(ctx.pgPool)` из `scripts/bench/probes.ts` — тот же счётчик, что у бенчмарка 08-08/08-28. Вызов поиска администратора даёт `{ queries: 5, maxConcurrent: 2 }` на настоящем пуле. 60 запросов одного пользователя с разных IP проходят, 61-й получает 429 с `Retry-After`, второй пользователь в ту же минуту получает 200.
- Красный → зелёный: в тесте шва 4 падения (`maxConcurrent` 5, «прогон 0: 5», `SEARCH_DB_CONCURRENCY` не экспортирован). В тесте маршрута 61-й запрос получил 200 вместо 429. Тест пула на `instrumentPool` писался после правки `mapBounded`, его красный не снимался: ту же одновременность закрывает красный тест шва. После правок 7/7 и 2/2.
- Что видит пользователь при 429: тело сервера английское (`Too many requests. Please try again later.`), `failureMessage` его отбрасывает, и `SearchDialog` показывает блок `LoadErrorAlert` с текстом «Запрос отклонён (код 429).» и кнопкой «Повторить».
- Решение исполнителя (автономно): ключ ограничителя — пользователь, а не IP. В таблице «на пользователя или IP», а ученики класса за одним NAT иначе делили бы 60 запросов в минуту. Для этого `rateLimiter` получил необязательный `clientKey(req)`. Остальные ограничители (`invite-accept`, `password-change`) не изменились, формат имени `rateLimiter(...)` прежний (`route-inventory.test.ts` зелёный).
- Цифры 08-28 и `08-BENCHMARKS.md` («после»: `maxConcurrentQueries` = 5 у администратора) теперь не действуют, бенч не перезапускался. Ожидаемое значение после пакета A — 2, `queriesPerCall` прежние.

Снимок маршрутов (`node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server routes:inventory`):

```diff
-GET /api/search  sessionRequired > <anonymous>
+GET /api/search  sessionRequired > rateLimiter(search,60/60000ms) > <anonymous>
```

Маршруты экспорта не изменились: семафор стоит внутри обработчика, не в цепочке middleware.

### SEC-02: одновременные экспорты

- Сделано: в `routes/tests/admin/export.ts` добавлены `EXPORT_CONCURRENCY = 2` и счётчик на процесс. Место занимается после проверки прав (`canReadTest` / `testScope`) и до `prepare…Archive`. Третий одновременный экспорт (теста или темы) получает `429 { error: 'Экспорт уже выполняется, повторите позже' }` без заголовков ZIP. Место освобождается в `finally` и по событию `close` ответа (обрыв клиентом). Освобождение идемпотентно.
- Тесты в `routes/tests/export-routes.test.ts`, блок `EXPORT_ZIP_MAX_BYTES=0`. Первый: два потока по 48 × 256 КБ остановлены противодавлением после первого чанка; третий экспорт теста и экспорт темы получают 429 JSON с точным текстом; после дочитывания первого новый экспорт отдаёт 200 с тем же содержимым. Второй: при обрыве двух остановленных потоков клиентом место освобождается, следующий экспорт отдаёт 200 и корректный ZIP.
- Красный → зелёный: оба теста упали, третий запрос получил 200 вместо 429. После правки 14/14. Первая версия теста сравнивала 12-мегабайтный архив с эталоном через `archiveToBuffer` и упёрлась в 413 потолка буфера. Тест переведён на сравнение с дочитанным первым потоком, к поведению маршрута это отношения не имеет.

### «Админка» (решение пользователя)

- Сделано: `sidebarNavItems(items, perms)` в `lib/settings/sidebar-items.ts` добавляет `ADMIN_LINK` (`Админка`, `/admin`, иконка `ShieldCheck`, `_self`) после пунктов из базы при `canAccessSection(perms, 'admin')`. Если в базе уже есть пункт с `url === '/admin'`, второй не добавляется. `AppSidebar` хранит пункты из базы, права берёт из `useAuth().perms` и строит ссылки через `useMemo`; ключ `<li>` — `id` пункта вместо названия. Подсветка: `ADMIN_LINK.isActive = false`, поэтому пункт активен по `pathname === '/admin'` или `pathname.startsWith('/admin/')`.
- Тест: `lib/settings/sidebar-items.test.ts`. Права строятся из `ROLE_REGISTRY`, как в `route-permissions.test.ts`. Администратор и учитель видят «Админку» последней, `user` и пустой набор прав — нет. Пункт `/admin` из базы не дублируется. Без пунктов из базы «Админка» остаётся единственной.
- Красный → зелёный: тот же красный, что у CR-10 (модуля не было). После правки 8/8.
- Решение исполнителя (автономно): «Админка» строится при рендере поверх данных `/api/sidebar` и видна, даже если запрос пунктов не прошёл.

## Отклонения от плана

1. **CR-16 не выполнен.** Удаление двух файлов отклонено правами среды. Шаг ждёт пользователя.
2. **[Rule 2] `rateLimiter.clientKey`.** Без него ограничитель считал бы только по IP, а таблица требует «на пользователя». Добавлен необязательный параметр, поведение остальных ограничителей не изменилось.
3. **Тест шва 08-08 изменён по решению пользователя.** Ожидания `maxConcurrent` 5/5/3 закрепляли прежнюю одновременность (D-20), это не характеризация выдачи. Характеризация `search-results.characterization.test.ts` не менялась и зелёная.

## Находки вне области

Записаны в `deferred-items.md`:
- `AppSidebar` подсвечивает все пункты из базы как активные (`item.isActive` — флаг видимости, а `/api/sidebar` отдаёт только видимые). Так было до фазы, не исправлялось.
- Строка 08-16 про `TOPIC_SLUG_EXISTS` закрыта на стороне web.

## Проверки

- `yarn verify` в worktree: `yarn verify: OK` с первого прогона. Все шаги passed: lockfile, env-contract, docs-commands, ci-workflow, format-check, lint-typecheck-test, migrations, script-tests. Тесты: web 82 файла / 1455, server 79 / 1684, exam-core 605, rbac 9, script-tests 217. Флейка 57P01 не было.
- `yarn e2e` в worktree: 196 passed (1.8m) с первого прогона.
- `oxfmt --check .`: все файлы отформатированы.
- Охранные `scripts/*.test.mjs` не менялись.

## Deferred human verification

- **CR-16 (часть).** Не выполнено, ждёт пользователя; исполнитель не одобрял. В worktree `wt-phase-08` удалить `app/web/lib/session/object-access.ts` и `app/web/lib/session/object-access.test.ts` (например, `git rm` этих двух путей при коммите пакета), затем `yarn verify`. Импортов вне собственного теста у файлов нет.
- **Коммит пакета.** Не выполнено, ждёт пользователя; исполнитель не одобрял. Файлы к коммиту перечислены ниже.

## Файлы к коммиту

Изменённые:
- `app/server/route-inventory.txt`
- `app/server/src/middleware/rateLimiter.ts`
- `app/server/src/routes/search.ts`
- `app/server/src/routes/tests/admin/export.ts`
- `app/server/src/routes/tests/export-routes.test.ts`
- `app/server/src/services/search/database-search.test.ts`
- `app/server/src/services/search/database-search.ts`
- `app/web/app/(internal)/(protected)/admin/sidebar/SidebarSettingsClient.tsx`
- `app/web/app/(internal)/(protected)/admin/tests/components/TopicFormDialog.tsx`
- `app/web/components/AppSidebar.tsx`
- `app/web/components/Search/SearchDialog.tsx`
- `app/web/components/editor/plugins.tsx`
- `app/web/components/editor/plugins/actions/markdown-toggle-plugin.tsx`
- `app/web/components/editor/transformers/markdown-emoji-transformer.ts`
- `app/web/components/editor/utils/emoji-table.test.ts`
- `app/web/components/editor/utils/emoji-table.ts`
- `app/web/components/editor/utils/mdx-emoji-load.test.ts`
- `app/web/components/groups/GroupSheet.tsx`
- `app/web/lib/groups/group-form.test.ts`
- `app/web/lib/groups/group-form.ts`
- `app/web/lib/tests/bank-view.test.ts`
- `app/web/lib/tests/bank-view.ts`

Новые:
- `app/server/src/routes/search-limits.test.ts`
- `app/web/components/editor/utils/markdown-toggle.test.ts`
- `app/web/components/editor/utils/markdown-toggle.ts`
- `app/web/lib/settings/sidebar-items.test.ts`
- `app/web/lib/settings/sidebar-items.ts`

К удалению (CR-16, ждёт пользователя):
- `app/web/lib/session/object-access.ts`
- `app/web/lib/session/object-access.test.ts`

Вне git (общий `.planning`): `08-FIX-A-SUMMARY.md`, две строки в `deferred-items.md`.

## Self-Check: PASSED

- Созданные файлы на месте (5 новых в `git status`).
- Коммитов нет по правилу пользователя: `commits: 0` при изменениях в рабочем дереве — ожидаемое состояние, а не потеря изменений.

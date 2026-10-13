---
phase: 07-storage-and-question-content
reviewed: 2026-10-04T14:46:13Z
depth: deep
worktree: wt-phase-07 (gsd/phase-07, HEAD 0f1640c)
files_reviewed: 36
files_reviewed_list:
  - app/server/src/services/storage/port.ts
  - app/server/src/services/storage/index.ts
  - app/server/src/services/storage/keys.ts
  - app/server/src/services/storage/links.ts
  - app/server/src/services/storage/zip.ts
  - app/server/src/services/storage/adapters/memory.ts
  - app/server/src/services/storage/adapters/local.ts
  - app/server/src/services/storage/adapters/supabase.ts
  - app/server/src/services/question-content/index.ts
  - app/server/src/services/question-content/paths.ts
  - app/server/src/services/question-content/order.ts
  - app/server/src/services/question-content/read.ts
  - app/server/src/services/question-content/write.ts
  - app/server/src/services/question-content/relocate.ts
  - app/server/src/services/question-content/move.ts
  - app/server/src/services/question-content/remove.ts
  - app/server/src/services/question-content/export.ts
  - app/server/src/services/question-content/asset-refs.ts
  - app/server/src/services/question-content/asset-index.ts
  - app/server/src/services/question-content/reconcile.ts
  - app/server/src/services/assets/images.ts
  - app/server/src/services/assets/avatars.ts
  - app/server/src/routes/docs/assets.ts
  - app/server/src/routes/users/avatar.ts
  - app/server/src/routes/users/profile.ts
  - app/server/src/routes/users/index.ts
  - app/server/src/routes/tests/index.ts
  - app/server/src/routes/tests/public.ts
  - app/server/drizzle/0024_question_asset_refs.sql
  - app/server/src/db/schema.ts
  - app/server/src/scripts/asset-refs.ts
  - app/server/src/scripts/storage-reconcile.ts
  - app/web/lib/image-signed-url-cache.ts
  - app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx
  - app/web/lib/assets/delete-error.ts
  - app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Фаза 7: ревью кода

**Дата:** 2026-10-04T14:46:13Z
**Глубина:** deep (вызовы прослежены через модули)
**Worktree:** `wt-phase-07`, ветка `gsd/phase-07`, HEAD 0f1640c. Ниже пути указаны от корня репозитория.
**Статус:** issues_found

## Сводка

Просмотрены порт хранилища и его адаптеры, модуль `question-content`, сервисы ассетов, маршруты, миграция 0024 и скрипты. Тесты не запускались: в worktree идёт `yarn verify`. Выводы получены чтением кода и трассировкой вызовов.

Схема «копирование → переключение → удаление» при записи вопроса (`write.ts`) корректна, потому что у новых ключей случайная ревизия. При переносе (`relocate.ts`) целевые ключи детерминированы, а компенсация удаляет их без проверки ссылок. Из-за этого две пересекающиеся одинаковые операции переноса удаляют уже закоммиченные файлы (CR-01).

Порядок блокировок согласован: сначала строки тестов по возрастанию id, затем темы. Сценария взаимной блокировки между операциями модуля не нашёл. Объекты `assets/**` защищены функцией `isProtected` при удалении и в `isMediaLibraryKey` на маршруте.

Шкала: BLOCKER, MAJOR, MINOR, INFO. Во фронтматтере `critical` = BLOCKER, `warning` = MAJOR + MINOR, `info` = INFO.

| ID | Severity | Файл:строка | Кратко |
|----|----------|-------------|--------|
| CR-01 | BLOCKER | `app/server/src/services/question-content/relocate.ts:93-96, 134, 210, 216-220, 231-233` | Компенсация переноса удаляет детерминированные целевые ключи, которыми уже владеет параллельная закоммиченная операция |
| CR-02 | MINOR | `app/server/src/services/assets/images.ts:87-94`, `asset-index.ts:110-119` | Проверка «картинка используется» и удаление не атомарны с сохранением вопроса; LIKE по черновикам не ловит закодированные формы |
| CR-03 | MINOR | `app/server/src/services/storage/links.ts:49-60`, `asset-refs.ts:3` | Абсолютный proxy-URL и alt с `]` не попадают в индекс ссылок: используемую картинку можно удалить, в ZIP её нет |
| CR-04 | MINOR | `app/server/src/services/question-content/export.ts:121, 128-132` | В ZIP попадает любой ключ из текста промпта (аватары, промпты других тестов, легаси `answer_keys.json`) даже при `withAnswers=false` |
| CR-05 | MINOR | `write.ts:352-355, 385-404`; `relocate.ts:316-320, 384-389, 454-458` | Гонка одинаковых slug: вместо 409 возвращается 500 (23505) |
| CR-06 | MINOR | `app/server/src/services/question-content/relocate.ts:399-426` | Сохранение настроек без переноса пишет без условия: устаревший запрос возвращает старый slug или перетирает `version` |
| CR-07 | MINOR | `app/server/src/routes/users/avatar.ts:25-29`, `avatars.ts:92-105` | Нечисловое поле кропа даёт NaN: 500 и NaN в колонках кропа |
| CR-08 | INFO | `app/server/src/services/question-content/relocate.ts:209, 228` | Общий легаси-файл `questions/<testId>/prompt.md` удаляется при переносе одного вопроса, хотя через fallback его читают другие вопросы |
| CR-09 | INFO | `app/server/src/services/question-content/remove.ts:32-34` | `isProtected` защищает любой сегмент `assets`: у теста или темы со slug `assets` файлы никогда не удаляются |
| CR-10 | INFO | `app/web/.../test-editor/useTestEditorModel.ts:407-418` | `mutateTest()` после `router.replace` перезапрашивает старый ключ by-slug (404, ошибку глотает `console.warn`) |
| CR-11 | INFO | `app/server/src/services/storage/links.ts:110-114` | `storedAvatarValue` принимает ключ `avatars/<чужой userId>/…` |
| CR-12 | INFO | `app/server/src/routes/users/index.ts:203-206` | Фильтр `canReadUser` по строкам ничего не отсекает, а при появлении построчной политики `total` разойдётся с `rows` |
| CR-13 | INFO | `app/server/src/services/storage/index.ts:167` | `cacheNonce=Date.now()` в каждом `storageUrl`: `/me` и списки отдают новый URL аватара на каждый ответ, кэш браузера не работает |
| CR-14 | INFO | `app/server/src/services/question-content/move.ts:81-96` | Если передать несуществующий `targetTestId` вместе с `targetTopicId`, вопрос без ошибки уходит в тему |

## Критичные

### CR-01: компенсация переноса удаляет уже закоммиченные объекты другой операции (BLOCKER)

**Файл:** `app/server/src/services/question-content/relocate.ts:93-96, 134, 210, 216-220, 231-233` (вызывается из `updateTopic`, `updateTestSettings`, `moveQuestion`)

**Суть.** Целевой ключ строится детерминированно: `questionPrefix(новый префикс, row.id) + '/' + targetFileName(source)`, а `targetFileName` сохраняет имя источника `prompt-<rev>.md` (строки 93-96 и 134). Две операции, которые переносят одни и те же объекты, получают одинаковые `to`. Компенсация срабатывает в двух местах:
- при сбое копирования (строка 219) удаляется `attempted`;
- при сбое транзакции (строка 232) удаляется `targets`.

Обе ветки удаляют эти ключи без проверки, ссылается ли на них БД.

**Сценарий отказа.** Два администратора или две вкладки одновременно переименовывают тест `s → s2` или тему `t → t2`, либо переносят один вопрос в один и тот же тест:
1. Запросы A и B читают одно состояние и строят одинаковый план. Оба копируют в `topics/t/s2/questions/q/prompt-abc.md`.
2. A коммитит: указатели переключены на `…/s2/…`, затем A удаляет источники `…/s/…` как неиспользуемые.
3. B в транзакции получает 409:
   - при переименовании теста — в `lockPlannedTest`, slug уже `s2`;
   - при переименовании темы — в `assertTopicSlugs`;
   - при переносе вопроса — в `switchPointers`.
4. Ветка `catch` в B вызывает `removeObjects(targets)` и удаляет `…/s2/…/prompt-abc.md`, на которые теперь указывают строки A.

Если B копирует уже после удаления источников в шаге 2, `copy` падает с `StorageNotFoundError`, и ветка строки 219 удаляет те же живые ключи. Итог: у всех вопросов теста или темы `prompt_path` и `explanation_path` указывают на несуществующие объекты. Источники уже удалены, версий в хранилище нет, восстановить нечем. В UI кнопки блокируются на время запроса, но две вкладки или два администратора этот сценарий воспроизводят. Тесты `relocate.test.ts:380-430` и `move-remove.test.ts:600-650` проверяют гонку правки и создания с переносом, а двух одинаковых переносов среди них нет.

**Минимальная правка.** Подойдёт любой из двух вариантов.
1. Уникальная ревизия цели на каждую операцию. Тогда компенсация удаляет только свои объекты:
   ```ts
   function targetFileName(_source: string, kind: ContentKind, rev: string): string {
   	return `${kind}-${rev}.md`
   }
   // planRelocation: const rev = newRevision() один раз на операцию (или на вопрос)
   ```
   Ревизию можно делать новой на каждый вопрос. Ограничение «имена в ZIP без ревизии» (D-18) не затрагивается: экспорт и так пишет `questions/<id>/prompt.md`.
2. Если нужно сохранить имена, перед удалением в обеих ветках отфильтровать ключи, на которые есть ссылки:
   ```ts
   const orphaned = await db.transaction((tx) => unreferencedKeys(tx, targets))
   await removeObjects(orphaned)
   ```
   Этот вариант слабее: вторая операция всё ещё может перезаписать объект первой во время копирования. Содержимое при этом совпадает, поэтому данные не теряются.

Нужен регрессионный тест: два параллельных `PATCH /:id/settings` с одинаковым новым slug, после этого все `prompt_path` читаются.

## Предупреждения

### CR-02: удаление картинки медиатеки не атомарно с сохранением вопроса (MINOR)

**Файл:** `app/server/src/services/assets/images.ts:87-94`, `app/server/src/services/question-content/asset-index.ts:110-119`

**Сценарий отказа.**
1. `deleteImage` читает `assetUsage(path)`: 0 вопросов, 0 черновиков.
2. Параллельно `updateQuestion` или `createQuestion` коммитит промпт с `images/x.webp`. Запись в `question_asset_refs` попадает в ту же транзакцию.
3. `deleteImage` вызывает `storage().remove([path])`.

В сохранённом вопросе остаётся ссылка на удалённый объект, нарушен инвариант STOR-05. Отдельно: `drafts` считается через `payload::text LIKE '%images/x.webp%'`. Черновик, где `src` записан как proxy-URL (`path=images%2Fx.webp`) или Supabase-URL с кодированием, проверку не проходит, хотя `parseStorageLink` приводит такие формы к тому же ключу.

**Минимальная правка.** Сериализовать операции по ключу картинки:
- в `deleteImage`: `db.transaction` → `SELECT pg_advisory_xact_lock(hashtext(key))` → `assetUsage(key, tx)` → `remove` до commit (или commit, затем `remove`, пока блокировка удерживается);
- в `indexQuestionAssets`: та же advisory-блокировка на каждый ключ перед `insertRefs`.

Для черновиков можно извлекать ссылки через `extractAssetRefs` из payload вместо LIKE. Другой вариант — индексировать черновики в той же таблице.

### CR-03: формы ссылок, которые не попадают в индекс (MINOR)

**Файл:** `app/server/src/services/storage/links.ts:49-60`, `app/server/src/services/question-content/asset-refs.ts:3`

**Сценарий отказа 1.**
1. Администратор копирует фрагмент отрендеренного вопроса и вставляет его в редактор. Браузер кладёт в буфер `<img src>` с абсолютным URL: `https://<site>/api/docs/assets/proxy?path=images%2Fx.webp&cacheNonce=…`.
2. Lexical сохраняет его как есть.
3. `parseHttpUrl` не находит путь Supabase и возвращает `external`, поэтому ссылка не попадает в `question_asset_refs`.

Картинку можно удалить из медиатеки при живой ссылке, `buildTestArchive` её не выгружает. Показ при этом работает: `/signed` отдаёт URL как есть.

**Сценарий отказа 2.** Alt с `]` (`![a]b](images/x.webp)`) импортирует regex редактора (`markdown-image-transformer.ts`: `[^[]*`), а `MARKDOWN_IMAGE` с `[^\]]*` такую ссылку не находит.

**Минимальная правка.**
- В `parseHttpUrl`: если `url.pathname === PROXY_PATH`, возвращать `keyLink(url.searchParams.get('path'))`, как в `parseProxyUrl`. Хост проверять по origin приложения или не проверять: ключ всё равно проходит `normalizeKey`.
- В `MARKDOWN_IMAGE`: разрешить в alt любые символы, кроме `[`, по аналогии с импортом редактора.

### CR-04: экспорт упаковывает любой ключ из текста, а не только картинки (MINOR)

**Файл:** `app/server/src/services/question-content/export.ts:121, 128-132`

**Сценарий отказа.** `extractAssetRefs` возвращает любой нормализованный ключ: `avatars/<uid>/…`, `topics/<другой тест>/questions/<id>/prompt-x.md`, легаси `topics/x/y/answer_keys.json`. Все такие ключи без проверки уходят в `sharedAssetKeys` и читаются в ZIP. Промпт с `![](topics/a/b/answer_keys.json)` выгружает ключи ответов чужого теста при `withAnswers=false` любому, у кого есть `tests.read`. Proxy и `/signed` такие ключи не отдают: `isServableImageKey`. В экспорте этой проверки нет.

**Минимальная правка.**
```ts
for (const key of extractAssetRefs(found.text)) if (isServableImageKey(key)) refs.add(key)
```

Мелочь рядом: `buildZip` мутирует переданный `options.missing` (`zip.ts:58, 68`). Лучше копировать: `const missing = [...(options.missing ?? [])]`.

### CR-05: гонка уникального slug отвечает 500 вместо 409 (MINOR)

**Файл:**
- `app/server/src/services/question-content/write.ts:352-355, 385-404` (`createTestWithQuestions`);
- `app/server/src/services/question-content/relocate.ts:316-320, 360-364` (`updateTopic`);
- `app/server/src/services/question-content/relocate.ts:384-389, 454-458` (`updateTestSettings`).

**Сценарий отказа.** Проверка `TEST_SLUG_EXISTS` или `TOPIC_SLUG_EXISTS` выполняется до транзакции. Два одновременных запроса с одним slug проходят её оба. Второй падает на `tests_topic_slug_uniq` или `topics_slug_uniq` с кодом 23505 и уходит в `next(e)` как 500. Файлы компенсация удаляет, данные целы, но клиент видит «внутреннюю ошибку» вместо «slug занят». В `move.ts:56-63` для этого уже есть `isUniqueViolation`.

**Минимальная правка.** Вынести `isUniqueViolation` в общий модуль и в трёх местах обернуть insert и update:
```ts
catch (e) { if (isUniqueViolation(e)) throw new ApiError(409, ERROR_MESSAGES.TEST_SLUG_EXISTS); throw e }
```

### CR-06: сохранение настроек без переноса перетирает параллельный перенос (MINOR)

**Файл:** `app/server/src/services/question-content/relocate.ts:399-426`

**Сценарий отказа.**
1. Запрос B (без смены slug) читает тест со slug `s`.
2. Параллельный запрос A переименовывает `s → s2` и коммитит.
3. B делает `UPDATE tests SET slug = 's', … WHERE id = …` без условия и возвращает старый slug. `version` и `isPublished` тоже пишутся по устаревшему чтению.

После этого указатели вопросов лежат под `…/s2/…`, а префикс теста снова `s`. Чтение не ломается, указатели абсолютные. Но экспорт ищет собственные ассеты по префиксу `s`, новые файлы пишутся под `s`, и содержимое теста оказывается разбросано по двум префиксам.

**Минимальная правка.** Условный update:
```ts
.where(and(eq(tests.id, testId), eq(tests.slug, existingTest.slug), eq(tests.topicId, existingTest.topicId), eq(tests.version, existingTest.version)))
```
Пустой `returning` → 409 `CONTENT_CHANGED_MESSAGE`. В ветке переноса `version` тоже надо сверять внутри транзакции после `lockPlannedTest`.

### CR-07: нечисловое поле кропа аватара даёт 500 и NaN в БД (MINOR)

**Файл:** `app/server/src/routes/users/avatar.ts:25-29`, `app/server/src/services/assets/avatars.ts:92-105, 161-164, 187-190`

**Сценарий отказа.** `cropX=abc` → `parseFloat` возвращает `NaN`, `cropBox` не равен null. В `renderCrop`:
- `Math.max(0, Math.round(NaN))` даёт `NaN`;
- проверка `width <= 0` для `NaN` ложна;
- sharp бросает обычную ошибку `Expected integer…`, и ответ — 500 «Ошибка при загрузке аватара».

Если `rotation=abc` при остальных числовых полях, вызов `sharp.rotate(NaN)` тоже падает. Если NaN приходит в `zoom`, `viewX` или `viewY`, `cropColumns` записывает `NaN` в колонки `real`: Postgres это принимает, а web получает `NaN` в `cropParams`.

**Минимальная правка.**
```ts
const n = parseFloat(String(value)); if (!Number.isFinite(n)) throw new ApiError(400, 'Некорректные параметры кропа'); return n
```

## Информационные

### CR-08: общий легаси-файл промпта удаляется при переносе одного вопроса (INFO)

**Файл:** `app/server/src/services/question-content/relocate.ts:209, 228` и `paths.ts:42`

`unreferencedKeys` смотрит только на `prompt_path` и `explanation_path`. Если у нескольких вопросов `prompt_path = NULL` и они читают один fallback `topics/t/s/questions/<testId>/prompt.md`, перенос одного из них удаляет этот файл как неиспользуемый. Остальные вопросы теряют промпт. Раскладка редкая, легаси с одним вопросом на тест. Правка: перед переносом в `moveQuestion` материализовать указатели у таких вопросов либо не включать в `stale` ключи, которые являются кандидатами для оставшихся строк с `NULL`-указателем.

### CR-09: сегмент `assets` в slug защищает весь контент теста или темы (INFO)

**Файл:** `app/server/src/services/question-content/remove.ts:32-34`

`key.split('/').includes('assets')` срабатывает и для `topics/assets/<test>/questions/…`, и для `topics/<t>/assets/questions/…`. После удаления такой темы или теста их промпты остаются сиротами. Правка: защищать только четвёртый сегмент: `segments[0]==='topics' && segments[3]==='assets'`.

### CR-10: `mutateTest()` после переноса перезапрашивает старый URL (INFO)

**Файл:** `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts:407-418`

`mutateTest` привязан к ключу `/api/tests/by-slug/<старый topic>/<старый test>`. После `router.replace` на новый slug этот запрос отдаёт 404, ошибку глотает `console.warn`. Новые данные загрузит уже новая страница. Ветку можно удалить или вызывать `mutate` с новым ключом.

### CR-11: `storedAvatarValue` принимает чужой ключ аватара (INFO)

**Файл:** `app/server/src/services/storage/links.ts:110-114`, `app/server/src/routes/users/profile.ts:81`

Через Supabase-форму URL в `PATCH /api/users/profile` можно записать себе `avatars/<другой userId>/x.png`. Удалить чужой объект нельзя: `ownedKeys` фильтрует по своему префиксу. `recropAvatar` при этом читает чужой оригинал и публикует его кроп в своём публичном префиксе. Правка: передавать `userId` и принимать только `avatars/<userId>/`.

### CR-12: построчный фильтр `canReadUser` и `total` (INFO)

**Файл:** `app/server/src/routes/users/index.ts:203-206`

Маршрут уже требует `users.read`, а `canReadUser` проверяет то же право, поэтому фильтр сейчас ничего не отсекает. Если политика станет построчной, `total` останется числом до фильтра и пагинация разойдётся. Правка: фильтровать в SQL или пересчитывать `total`.

### CR-13: `cacheNonce=Date.now()` в каждом URL хранилища (INFO)

**Файл:** `app/server/src/services/storage/index.ts:167`

`/api/auth/me`, `/api/users`, `/api/users/directory` и список медиатеки при каждом ответе отдают новый URL аватара или картинки. Браузер каждый раз скачивает объект заново, а SWR-компоненты перерисовывают `<img>`. Поведение перенесено из старого `buildProxyUrl`. Правка: убрать nonce или строить его из стабильного значения (ревизия ключа, `updatedAt`).

### CR-14: несуществующий `targetTestId` молча откатывается к теме (INFO)

**Файл:** `app/server/src/services/question-content/move.ts:81-96`

Если `targetTestId` указывает на удалённый тест и передан `targetTopicId`, вопрос уходит в одноимённый тест темы или в новый тест-приёмник. Web шлёт только одно из двух полей, поэтому сценарий возможен лишь при прямом вызове API. Правка: при заданном `targetTestId`, которого нет, возвращать 409 или 404.

## Проверено, дефектов не найдено

- Порядок блокировок:
  - `lockTest` по возрастанию id, затем `topics … ORDER BY id FOR SHARE/UPDATE` в `updateTopic`, `updateTestSettings`, `moveQuestion` и `deleteTopic`;
  - `createTestWithQuestions` берёт только `FOR SHARE` темы;
  - цикла ожидания между операциями модуля нет.
- `updateQuestion`, `createQuestion`: файлы со случайной ревизией пишутся до транзакции, при сбое срабатывает компенсация, после commit удаляются только `unreferencedKeys`. Гонки с переносом и удалением вопроса заканчиваются 404 или 409 и очисткой своих файлов.
- `deleteQuestion`, `deleteTest`, `deleteTopic`: ключи собираются до транзакции, удаляются только ключи без ссылок и не `assets/**`. Тест или вопрос, перемещённый параллельно, не теряет файлы.
- `keys.ts`: многоступенчатое декодирование отсекает `..`, `\`, абсолютные пути и управляющие символы. Ключ, закодированный больше трёх раз, проходит, но доходит до адаптеров в закодированном виде без обхода префикса.
- Классификатор ошибок Supabase сверен с `@supabase/storage-js` 2.93.2. Для `download` и `exists` 400 и 404 означают «нет объекта», для JSON-запросов сравнивается `statusCode` `404` или `409`, повторяются 5xx и сетевые ошибки. `exists` при других ошибках бросает исключение и уходит в повтор.
- Миграция 0024 аддитивная. `assets_indexed default false` вместе с проверкой `NOT EXISTS` даёт «индекс полон» на пустой базе (D-17). Удаление в медиатеке fail-closed.
- `/api/docs/assets` GET, POST и DELETE требуют `tests.write`. `/proxy` отдаёт только `isServableImageKey` с `nosniff`.

---

_Ревью: 2026-10-04T14:46:13Z_
_Ревьюер: Claude (gsd-code-reviewer)_
_Глубина: deep_

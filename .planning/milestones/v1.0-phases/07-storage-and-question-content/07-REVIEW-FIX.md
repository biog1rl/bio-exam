---
phase: 07-storage-and-question-content
fixed_at: 2026-10-04T20:10:00Z
review_path: .planning/phases/07-storage-and-question-content/07-REVIEW-DISPOSITION.md
iteration: 1
findings_in_scope: 19
fixed: 19
skipped: 0
status: all_fixed
limitations: CR-02
---

# Фаза 7: исправление находок ревью кода

**Источник:** `07-REVIEW-DISPOSITION.md` (решение пользователя о приватном бакете, первая и вторая очередь). Разделы «Отложено» и «Опровергнуто» не трогались.
**Где:** worktree `scratchpad/wt-phase-07`, ветка `gsd/phase-07`, исходный HEAD 0f1640c.
**Коммит:** не выполнялся (правило пользователя), изменения в рабочем дереве.
**Проверки:** `yarn verify` и `yarn e2e` запускались в worktree.
**Счёт:** 19 строк disposition. Первая очередь — 9 строк, строка «Бакет приватный» совпадает с решением пользователя. Вторая очередь — 10 строк. Отдельный раздел «Бакет приватный…» ниже покрывает строку «Бакет приватный» вместе с CR-13.
**Ограничение:** CR-02 исправлен с ограничением, подробности в разделе CR-02.

Каждый перенесённый сценарий проб сначала падал на исходном коде, затем проходил после правки. Логи прогонов лежат в `scratchpad/rf07/` (`*-red.log`, `*-green.log`).

## Первая очередь

### CR-01 (BLOCKER): компенсация переноса удаляла живые объекты параллельной операции — fixed

- **Правка.** `relocate.ts`: цель копирования теперь `contentKey(..., kind, rev)`, то есть `${kind}-${newRevision()}.md`. Ревизия своя для каждого вопроса в каждой операции. Компенсация (`attempted`, `targets`) удаляет только объекты своей операции. Функция `targetFileName` удалена.
- **Файлы:** `app/server/src/services/question-content/relocate.ts`, `relocate.test.ts`.
- **Тесты** (`relocate.test.ts`, describe «два одинаковых переноса подряд не удаляют живые объекты»). Перенесены сценарии CR-01a/b/c/d из `cr.probe.test.ts`:
  - второе переименование во время копирования первого: первое отвечает 409, указатели второго читаются;
  - девять вопросов, второе переименование во время первой пачки копий, вторая пачка первого падает: первое отвечает 503, все указатели читаются;
  - второе переименование темы во время копирования первого;
  - два одновременных `PATCH /:id/settings` с одинаковым slug, 3 раунда.
- **Изменённые утверждения.** Ассерты `base(prior…)` и ожидание имени `prompt.md` при переносе легаси-ключа (`relocate.test.ts`, тесты «смена slug…», «устаревший указатель…», «prompt_path = null…») заменены проверкой `<dir>/<kind>-<12 hex>.md`. Это предписано disposition.
- **Красный прогон:** 4 failed, у каждого непустой список `missingPointers`.
- **Зелёный прогон:** `question-content` и `routes/tests` — 314 passed.

### SEC-01 (HIGH): ключ с `?`, `#` и `%2F` уводил запрос адаптера Supabase на другой объект — fixed

- **Правка.**
  - `keys.ts`: на каждой ступени декодирования отклоняются `?`, `#`, `%2F`/`%2f` и `%5C`/`%5c`. Строгого алфавита нет: `%20` и кириллица проходят.
  - `adapters/supabase.ts`: `urlPath(key)` кодирует каждый сегмент через `encodeURIComponent` только в `write`, `read` и `exists`. В `copy`, `remove`, `list` и `publicUrl` ключ передаётся без изменений.
  - `test-support/supabase-storage-fake.ts`: фейк декодирует сегменты пути, как это делает настоящий Supabase. Без этого фейк расходился с реальным API на ключах с `%20`.
- **Файлы:** `app/server/src/services/storage/keys.ts`, `adapters/supabase.ts`, `app/server/src/test-support/supabase-storage-fake.ts`, `storage.contract.test.ts`, `storage-known-defects.test.ts`, `app/server/README.md` (правила ключа).
- **Тесты:**
  - `hostileKeys` контрактного набора дополнены десятью ключами: `topics/T/S%2Fanswer_keys.json?/assets/x.png`, вариант с `#`, `?` и `#` без кодирования, `%3F`, `%2F`, `%2f`, `%5C`, `%5c`, `%252F`. Проверяются все три адаптера.
  - В контрактный набор добавлен тест «ключ с `%20` и кириллицей — один объект для write, read, exists, copy, list и remove».
  - В `storage-known-defects.test.ts` добавлены ключи в список отклоняемых `normalizeKey`. Легитимные `images/a%20b.webp`, `images/фото.webp`, `topics/т/с/assets/a%20b.png` проверяются как допустимые.
  - Проба `sec01.mts` перенесена тестом адаптера «read, exists and write send the key as one path, without a query or fragment tail»: путь запроса без `search` и `hash`, декодированные сегменты равны сегментам ключа.
  - Легитимные ключи из `storage-known-defects.test.ts:114` и `links.test.ts:43` (кириллица в URL authenticated) остаются зелёными.
- **Красный прогон:** 39 failed. `%5C` уже отклонялся через проверку `\` после декодирования.
- **Зелёный прогон:** `services/storage` и `routes/docs` — 341 passed.

### Бакет приватный, аватары через proxy (решение пользователя) и CR-13 — fixed

- **Правка.** `storage/index.ts` `storageUrl` возвращает `/api/docs/assets/proxy?path=<ключ>` для любого ключа: без ветки `getPublicUrl` и без `cacheNonce` (CR-13). Маршрут `/proxy` требует только `sessionRequired`, поэтому аватары видны всем вошедшим.
- **Сопутствующая правка (решение исполнителя).** Web отправляет в `PATCH /api/users/profile` поле `avatar` из `/api/auth/me`. Раньше на драйвере `supabase` это был публичный абсолютный URL. Теперь это относительный URL proxy, и zod `.url()` отклонял бы сохранение профиля с 400. Схема `avatar` в `profile.ts` теперь принимает и строку, начинающуюся с `/api/docs/assets/proxy?`. Ключ из неё проходит проверку CR-11.
- **Файлы:** `app/server/src/services/storage/index.ts`, `app/server/src/routes/users/profile.ts`, `app/server/README.md` (раздел «Ключ и URL»).
- **Тесты:**
  - `storage-known-defects.test.ts`: «private bucket: in Supabase mode avatars and images resolve to the proxy route without a nonce or a public URL». Драйвер `supabase`, URL аватара — proxy, без `/storage/v1/object/public`, стабилен между вызовами, без запросов к хранилищу.
  - `avatar-urls.test.ts`: «URL proxy своего аватара из /api/auth/me сохраняется обратно ключом».
- **Изменённые утверждения.** Проверки `startsWith(...&cacheNonce=)` и `startsWith(...&)` заменены точным равенством URL proxy. Это предписано CR-13. Файлы: `links.test.ts`, `storage.contract.test.ts`, `routes/docs/assets.test.ts`, `routes/users/avatar-urls.test.ts`, `avatar.characterization.test.ts`, `directory.test.ts`, `routes/uploads.test.ts`.
- **Красный прогон:** 25 failed, плюс 1 failed на сохранении профиля с URL proxy (400 «Некорректный URL аватара»).
- **Зелёный прогон:** зелёный.

### CR-04 / SEC-02: экспорт упаковывал любой ключ из текста — fixed

- **Правка.** `export.ts`: в `refs` попадает ключ, только если `isServableImageKey(key) && !key.startsWith('avatars/')`.
- **Решение исполнителя.** В колонке «Правка» указан только `isServableImageKey`. Но колонка «Тест» требует, чтобы аватара в ZIP не было, а `isServableImageKey` аватар пропускает. Принят тест как критерий приёмки, поэтому аватары исключены отдельно.
- **Файлы:** `app/server/src/services/question-content/export.ts`, `export.test.ts`.
- **Тест:** «ссылки на answer_keys.json, промпт чужого теста и аватар в ZIP не попадают». В ZIP только `settings.json`, промпт и картинка медиатеки, строки `KEY-123` в архиве нет.
- **Красный прогон:** в ZIP были `avatars/…`, `answer_keys.json` и чужой `prompt-….md`.
- **Зелёный прогон:** 14 passed.

### CR-11 / SEC-04: чужой ключ аватара в профиле и recrop чужого оригинала — fixed

- **Правка.**
  - `links.ts`: `storedAvatarValue(value, userId)` принимает ключ хранилища только под `avatars/<userId>/`. Иначе — `ApiError(400, 'Аватар должен быть загружен этим пользователем')`. Внешний URL сохраняется как есть.
  - `profile.ts` передаёт `userId` и отвечает статусом `ApiError` < 500, раньше был 500.
  - `avatars.ts` `recropAvatar`: ключ оригинала не под своим префиксом — 400 «Нет загруженного аватара для редактирования» до чтения хранилища.
- **Файлы:** `app/server/src/services/storage/links.ts`, `app/server/src/routes/users/profile.ts`, `app/server/src/services/assets/avatars.ts`, `links.test.ts`, `avatar-urls.test.ts`.
- **Тесты** (`avatar-urls.test.ts`):
  - «storedAvatarValue: ключ хранилища вне avatars/<userId>/ отклоняется с 400»;
  - «URL чужого аватара или не аватара: 400, значение в БД не меняется»;
  - «в БД ключ чужого аватара: 400…, чужой объект не читается» (`mem.read` не вызывался).
- **Красный прогон:** 3 failed.
- **Зелёный прогон:** 100 passed.

### CR-14 / SEC-03: несуществующий `targetTestId` откатывался к теме — fixed

- **Правка.** `move.ts` `resolveTarget`: `targetTestId` задан, а теста нет — 404 `TEST_NOT_FOUND`.
- **Тест** (`move-remove.test.ts`): «несуществующий targetTestId вместе с targetTopicId: 404, вопрос на месте, тест в теме не создан».
- **Красный прогон:** 200, вопрос уехал в тему.
- **Зелёный прогон:** 226 passed.

### CR-07: нечисловое поле кропа давало 500 и NaN в БД — fixed

- **Правка.** `routes/users/avatar.ts` `numberField`: `parseFloat`, затем `Number.isFinite`, иначе `ApiError(400, 'Некорректные параметры кропа')`.
- **Тесты** (`avatar-urls.test.ts`):
  - `cropX`, `cropRotation`, `cropZoom`, `cropViewX`, `cropWidth` равны `abc`: ответ 400, в БД и хранилище ничего не записано;
  - перекроп с `cropZoom=abc`: 400, `avatar_crop_zoom` в БД остаётся `1`.
- **Красный прогон:** 6 failed (500 или 200 с NaN).
- **Зелёный прогон:** 79 passed.

### CR-05: гонка уникального slug отвечала 500 — fixed

- **Правка.**
  - `isUniqueViolation` перенесён из `move.ts` в `lib/errors.ts`.
  - 23505 превращается в 409:
    - `write.ts`, insert в `createTestWithQuestions` → `TEST_SLUG_EXISTS`;
    - `relocate.ts`, update в `updateTopic` → `TOPIC_SLUG_EXISTS`;
    - `relocate.ts`, update в `updateTestSettings` → `TEST_SLUG_EXISTS`.
  - Компенсация файлов срабатывает как раньше.
- **Файлы:** `app/server/src/lib/errors.ts`, `move.ts`, `write.ts`, `relocate.ts`, `write.test.ts`, `relocate.test.ts`.
- **Тесты:**
  - `write.test.ts`: «второй POST /save с тем же slug во время записи файлов первого: первый 409…, его файлы удалены»;
  - `relocate.test.ts`: «два теста темы переименовываются в один slug…» и «две темы переименовываются в один slug…».
- **Красный прогон:** 3 failed, у каждого 500 с текстом SQL.
- **Зелёный прогон:** 115 passed.

### CR-06: сохранение настроек без переноса перетирало параллельный перенос — fixed

- **Правка.**
  - `relocate.ts`, ветка без переноса: update с условием `id`, `slug`, `topic_id`, `version`; пустой `returning` → 409 `CONTENT_CHANGED_MESSAGE`. Раньше пустой результат давал 404.
  - Ветка переноса: `lockPlannedTest` сверяет `version`. `lockTest` в `order.ts` теперь возвращает `version`.
- **Файлы:** `relocate.ts`, `order.ts`, `relocate.test.ts`.
- **Тесты** (`relocate.test.ts`, describe «устаревшее чтение настроек теста»):
  - сохранение без смены slug после параллельного переименования: 409, slug не откатывается, промпт читается;
  - переименование после параллельной публикации: 409, версия публикации не откатывается.
- **Красный прогон:** 2 failed, устаревшая запись проходила молча.
- **Зелёный прогон:** 321 passed.

## Вторая очередь

### CR-02 + NQ-01: удаление картинки и сохранение вопроса не были атомарны — fixed (с ограничением)

- **Правка.**
  - `asset-index.ts`: добавлен `lockAssetKey(executor, key)` (`pg_advisory_xact_lock(hashtext(key))`). `indexQuestionAssets` берёт блокировку на каждый ключ в отсортированном порядке.
  - `images.ts` `deleteImage`: блокировка ключа, `assetUsage(key, tx)` и `remove` выполняются в одной транзакции под блокировкой.
- **Файлы:** `app/server/src/services/question-content/asset-index.ts`, `app/server/src/services/assets/images.ts`, `asset-index.test.ts`.
- **Тесты** (`asset-index.test.ts`, describe «…сериализуются по ключу (CR-02)»). Блокировку держит отдельный пул, ожидание видно в `pg_stat_activity`, опрос до 5 с.
  - Сохранение первым: удаление ждёт commit сохранения и отвечает 409, вопрос сохранён, картинка на месте, ссылка в индексе.
  - Удаление первым: сохранение ждёт, пока удаление держит ключ.
- **Красный прогон:** блокировки временно убраны. 2 failed, ожидание на блокировке не наблюдалось (`false !== true`).
- **Зелёный прогон:** зелёный.
- **Ограничение.** Если удаление берёт ключ первым, сохранение после его commit запишет ссылку на уже удалённую картинку. Это тот же случай, что сохранение ссылки на отсутствующую картинку: система его допускает, `export.test.ts` сохраняет `images/missing.webp`, отчёт `assets:refs` показывает его в `missingObjects`. Исход «картинки нет и ссылки нет» потребовал бы проверять существование ключа при сохранении. Этого нет в колонке «Правка», и такая проверка сломала бы закреплённое поведение фазы 7. Поэтому она не добавлялась.
- **Не сделано.** Подсчёт черновиков через `LIKE` (вторая часть CR-02) в disposition не предписан и остался прежним.

### CR-03: формы ссылок вне индекса — fixed

- **Правка.**
  - `links.ts` `parseHttpUrl`: путь `/api/docs/assets/proxy` на любом хосте → `keyLink(path)`.
  - `asset-refs.ts`: в alt регулярного выражения `MARKDOWN_IMAGE` теперь `[^[]*?`. Вариант ленивый, чтобы `![a](x) и ](y)` не склеивались в одну картинку.
  - `linkForm` помечает абсолютный URL proxy как `proxy-url`.
- **Тесты:**
  - `links.test.ts`: «абсолютный URL маршрута proxy на любом хосте даёт ключ из path» и «…без path или с traversal — некорректный»;
  - `asset-refs.test.ts`: «alt с ] и абсолютный URL proxy находятся» и «alt с ] не склеивает две картинки в одну».
- **Красный прогон:** 3 failed.
- **Зелёный прогон:** `services` и `routes/docs` — 608 passed.

### CR-08: общий легаси `prompt.md` удалялся при переносе одного вопроса — fixed

- **Правка.** `relocate.ts` `unreferencedKeys`: из `stale` исключаются ключи, которые служат кандидатами чтения для строк с `NULL` в `prompt_path` или `explanation_path`. Строки берутся в темах затронутых ключей, кандидаты вычисляет `questionMarkdownCandidates`.
- **Тест** (`move-remove.test.ts`): «общий легаси prompt.md вопросов без указателя: перенос одного не удаляет файл, оставшийся вопрос читает его».
- **Красный прогон:** файл удалён.
- **Зелёный прогон:** зелёный.

### CR-09: сегмент `assets` в slug защищал весь контент — fixed

- **Правка.** `remove.ts` `isProtected`: защищён ключ вне `topics/` и ключ с четвёртым сегментом `assets`.
- **Тест** (`move-remove.test.ts`): «slug темы или теста «assets»: удаление теста убирает его промпты, assets/ теста на месте».
- **Красный прогон:** промпты оставались.
- **Зелёный прогон:** `question-content` и `routes/tests` — 327 passed.

### CR-10: мёртвый `mutateTest()` после `router.replace` — fixed

- **Правка.** `useTestEditorModel.ts`: ветка `assetsMoved` с `mutateTest()` удалена. `assetsMoved` приходит только при смене slug или темы, и тогда страница всё равно уходит на новый URL. Из `useSWR` убрана деструктуризация `mutate: mutateTest`.
- **Тест:** не требуется по disposition. Lint и typecheck web проходят в `yarn verify`.

### NQ-02: классификатор ошибок Supabase — тесты добавлены

- **Тесты** (`storage-known-defects.test.ts`, describe «retry classifier on scripted responses»):
  - download 401 и 403 — без повтора, `StorageUnavailableError`, один запрос;
  - upload 401 и 403 — то же;
  - 503, затем 200 — успех за два запроса;
  - брошенный fetch, затем 200 — успех за два запроса;
  - fetch бросает всегда — `StorageUnavailableError` после трёх запросов.
- Дефекта нет, поэтому тесты зелёные с первого прогона. Чувствительность проверена мутацией: `isRetryable` → `true` даёт 4 failed, `isRetryable` → `false` даёт 3 failed. Код восстановлен.

### NQ-05: картинка в пояснении и в двух вопросах — тест добавлен

- **Тест** (`routes/docs/assets.test.ts`). Картинка в пояснении одного вопроса, в промпте второго (URL proxy) и в черновике: 409 с `usage: { questions: 2, drafts: 1 }`, объект на месте.
- Дефекта нет, тест зелёный с первого прогона.

### NQ-06: удаление общей картинки после удаления одного вопроса — тест добавлен

- **Тест** (`routes/docs/assets.test.ts`). После удаления одного из двух вопросов с общей картинкой картинка на месте, её удаление отвечает 409 с `usage: { questions: 1, drafts: 0 }`.
- Тест зелёный с первого прогона.

### NQ-07: граница возраста reconcile и пустой `createdAt` — тесты добавлены

- **Тесты** (`reconcile.test.ts`):
  - за 1 мс до `minAgeMs` сирота свежая, ровно в `minAgeMs` удаляется;
  - сирота с пустым `createdAt` считается свежей и не удаляется даже через 100 часов.
- Тесты зелёные с первого прогона.

### SEC-07: дубль номера угрозы — fixed

- `07-17-PLAN.md`: угроза «данные e2e» перенумерована из T-7-48 в T-7-49. T-7-48 остаётся за угрозой ZIP в `07-14-PLAN.md`.

## Не тронуто

- Разделы «Отложено» и «Опровергнуто»: CR-12, NQ-04, SEC-05, латентные части CR-04 и SEC-03, шаги выкатки, строгий алфавит ключей, NQ-03, NQ-08, NQ-10.
- Добавление SQL-проверок в шаг 1 runbook 07-16 отнесено disposition к разделу «Выкатка», поэтому не выполнялось.
- `buildZip` по-прежнему мутирует `options.missing` (мелочь из CR-04): правка не предписана.

## Проверки

Обе проверки запускались в worktree `scratchpad/wt-phase-07`, не в основном дереве.

```
verify summary:
  lockfile: passed
  env-contract: passed
  docs-commands: passed
  ci-workflow: passed
  format-check: passed
  lint-typecheck-test: passed
  migrations: passed
  script-tests: passed
yarn verify: OK
```

Тесты по пакетам:

| Пакет | Файлов | Тестов |
|---|---|---|
| server | 54 | 1119 passed |
| web | 26 | 587 passed |
| exam-core | 11 | 599 passed |
| rbac | 1 | 3 passed |

`yarn e2e` (полный): `138 passed (1.5m)`, код выхода 0.

Логи: `scratchpad/rf07/verify.log`, `scratchpad/rf07/e2e.log`.

## Шаги пользователя при выкатке (не выполнено, ждёт пользователя)

1. Перед выкаткой проверить, есть ли символ `%` в ключах из БД: `questions.prompt_path`, `questions.explanation_path`, `users.avatar`, `users.avatar_cropped` и ссылки в отчёте `assets:refs`.
   - После SEC-01 адаптер Supabase кодирует сегменты ключа. Ключ с литеральным `%` (например `a%20b.webp`) теперь адресует объект `a%20b.webp`, а раньше адресовал `a b.webp`.
   - Ключи, которые создаёт приложение (`<hex>.webp`, `prompt-<hex>.md`, `avatars/<uuid>/<hex>.png`), `%` не содержат.
   - Проверка нужна для легаси-ключей. SQL по `storage.objects` из раздела «Выкатка» покрывает только сторону хранилища.
2. Выкатить код. Правка SEC-01 должна быть на проде до переключения бакета.
3. После выкатки перевести бакет `main` в Supabase в приватный.
4. Проверить, что аватары и картинки открываются у вошедшего пользователя через `/api/docs/assets/proxy`.

## Изменённые файлы

- `app/server/README.md`
- `app/server/src/lib/errors.ts`
- `app/server/src/routes/docs/assets.test.ts`
- `app/server/src/routes/uploads.test.ts`
- `app/server/src/routes/users/avatar-urls.test.ts`
- `app/server/src/routes/users/avatar.characterization.test.ts`
- `app/server/src/routes/users/avatar.ts`
- `app/server/src/routes/users/directory.test.ts`
- `app/server/src/routes/users/profile.ts`
- `app/server/src/services/assets/avatars.ts`
- `app/server/src/services/assets/images.ts`
- `app/server/src/services/question-content/asset-index.test.ts`
- `app/server/src/services/question-content/asset-index.ts`
- `app/server/src/services/question-content/asset-refs.test.ts`
- `app/server/src/services/question-content/asset-refs.ts`
- `app/server/src/services/question-content/export.test.ts`
- `app/server/src/services/question-content/export.ts`
- `app/server/src/services/question-content/move-remove.test.ts`
- `app/server/src/services/question-content/move.ts`
- `app/server/src/services/question-content/order.ts`
- `app/server/src/services/question-content/reconcile.test.ts`
- `app/server/src/services/question-content/relocate.test.ts`
- `app/server/src/services/question-content/relocate.ts`
- `app/server/src/services/question-content/remove.ts`
- `app/server/src/services/question-content/write.test.ts`
- `app/server/src/services/question-content/write.ts`
- `app/server/src/services/storage/adapters/supabase.ts`
- `app/server/src/services/storage/index.ts`
- `app/server/src/services/storage/keys.ts`
- `app/server/src/services/storage/links.test.ts`
- `app/server/src/services/storage/links.ts`
- `app/server/src/services/storage/storage-known-defects.test.ts`
- `app/server/src/services/storage/storage.contract.test.ts`
- `app/server/src/test-support/supabase-storage-fake.ts`
- `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts`
- `.planning/phases/07-storage-and-question-content/07-17-PLAN.md` (в `.gitignore`, общий `.planning`)

---

_Fixed: 2026-10-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

# Фаза 7: разбор находок ревью кода

Область — ветка `gsd/phase-07` (HEAD 0f1640c), коммиты фазы без слияний. Источники:
- `07-REVIEW.md` (CR-01…CR-14);
- аудит безопасности (OPEN_THREATS, SEC-01…SEC-07);
- аудит тестов (NQ-01…NQ-10);
- проверка devils-advocate с пробами в `scratchpad/da7code/` (`cr.probe.test.ts`, `sec01.mts`).

## Решение пользователя (2026-10-04)

**Бакет `main` становится приватным.** Все файлы, включая аватары, отдаются через сервер с проверкой входа. В коде убирается ветка `getPublicUrl` в `storageUrl`: аватары идут через proxy. Переключение бакета в Supabase — шаг пользователя при выкатке, после выкатки кода. Правка SEC-01 обязательна до переключения.

## Чинить в фазе 7

### Первая очередь

| id | Severity | Правка | Тест |
|---|---|---|---|
| CR-01 | BLOCKER | `relocate.ts`: имя цели при копировании `${kind}-${newRevision()}.md` — новая ревизия на каждый вопрос в каждой операции. Отступление от must_have 07-12 «с тем же именем файла»; D-18 не задевает. Обновить ассерты `base(prior…)` в `relocate.test.ts` | Регрессии CR-01a/b/c/d из `scratchpad/da7code/cr.probe.test.ts`: два параллельных `PATCH /:id/settings` с одинаковым slug, сбой копирования, переименование темы — живые объекты не удаляются, указатели читаются |
| SEC-01 | HIGH | `storage/keys.ts`: на всех стадиях нормализации запрет `?`, `#` и кодированных разделителей `%2F`/`%2f`/`%5C`/`%5c`; `%20` и кириллицу не трогать. `adapters/supabase.ts`: `encodeURIComponent` по сегментам только для `read`/`exists`/`write`, не для `copy`/`remove`/`list`/`publicUrl` | Враждебные ключи `topics/T/S%2Fanswer_keys.json?/assets/x.png`, с `#`, с `%2F`, `%5C` — в `hostileKeys` контрактного набора; проба `sec01` как тест адаптера (путь запроса не содержит хвоста после `?`) |
| Бакет приватный | — | `storage/index.ts` `storageUrl`: аватары и любые ключи — через proxy, без `getPublicUrl`. Аватары по-прежнему видны вошедшим; `cacheNonce=Date.now()` убрать (CR-13): ключи неизменяемы | Тест: URL аватара — proxy, без `/storage/v1/object/public` |
| CR-04 / SEC-02 | MINOR | `export.ts`: `refs` только через `isServableImageKey(key)` | Промпт со ссылкой на `answer_keys.json` и на аватар → в ZIP их нет |
| CR-11 / SEC-04 | LOW | `storedAvatarValue(value, userId)` принимает только `avatars/<userId>/`; `recropAvatar` читает только ключ под своим префиксом | Чужой ключ в профиле → 400; recrop чужого → 400 без чтения |
| CR-14 / SEC-03 | LOW | `move.ts`: `targetTestId` задан и не найден → 404, без отката на тему | Тест 404 |
| CR-07 | MINOR | `numberField` с `Number.isFinite`, иначе 400 | `cropX=abc`, `rotation=abc`, `zoom=abc` → 400 |
| CR-05 | MINOR | общий `isUniqueViolation` → 409 в create, `updateTopic`, `updateTestSettings` | Гонка одинакового slug → 409, не 500 |
| CR-06 | MINOR | `relocate.ts` настройки без переноса: условный update по `id`, `slug`, `topic_id`, `version`, пустой `returning` → 409; в ветке переноса сверять `version` после `lockPlannedTest` | Проба CR-06 → 409 |

### Вторая очередь

| id | Правка | Тест |
|---|---|---|
| CR-02 + NQ-01 | `pg_advisory_xact_lock(hashtext(key))` в `deleteImage` (проверка и удаление под блокировкой) и в `indexQuestionAssets` по каждому ключу | Параллельно DELETE картинки и сохранение вопроса со ссылкой: либо 409 и вопрос сохранён, либо картинки нет и ссылки на неё нет |
| CR-03 | `parseHttpUrl`: путь `/api/docs/assets/proxy` → `keyLink(path)`; alt `[^[]*` | Абсолютный proxy-URL и alt с `]` находятся |
| CR-08 | Не включать в `stale` ключи, которые служат кандидатами строкам с `NULL`-указателем | Перенос одного вопроса не удаляет общий легаси `prompt.md` |
| CR-09 | Защищать только `segments[0]==='topics' && segments[3]==='assets'` | Slug `assets` удаляет свои промпты |
| CR-10 | Убрать мёртвый `mutateTest()` после `router.replace` или вызывать с новым ключом | — |
| NQ-02 | — | Классификатор: 401/403 без повтора, успех после повтора, брошенный fetch повторяется |
| NQ-05 | — | Картинка только в пояснении и в двух вопросах → 409, `usage` перечисляет все |
| NQ-06 | — | После удаления одного вопроса удаление общей картинки всё ещё 409 |
| NQ-07 | — | Граница возраста reconcile и пустой `createdAt` (не удаляется) |
| SEC-07 | Перенумеровать угрозу T-7-48 в 07-17-PLAN в T-7-49 | — |

## Отложено

- **Фаза 07.1:**
  - CR-12 — `total` против построчного `canReadUser`;
  - NQ-04 — закрывается в 07.1 без нового права: ключи в экспорте только при `canWriteTest`/`canWriteTopic`, иначе 200 без `answer_keys.json`;
  - латентные части CR-04 и SEC-03 при объектном scope.
- **Фаза 8:**
  - SEC-05 — потоковый ZIP, обрыв сборки по сумме размеров (PERF-04).
- **Выкатка (шаг пользователя):**
  - SQL `SELECT id, public FROM storage.buckets`;
  - после выкатки кода — перевод `main` в приватный;
  - строгий алфавит ключей — только после SQL `SELECT name FROM storage.objects WHERE bucket_id='main' AND name !~ '^[A-Za-z0-9._/-]+$'` и отчёта `assets:refs`. Это добавляется в шаг 1 runbook 07-16.

## Опровергнуто или не делается

- NQ-03 — покрыто тестами `removeObjects`.
- NQ-08 — противоречит D-20/D-21.
- NQ-10 — миграция только DDL.

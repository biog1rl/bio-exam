---
phase: 12-photos-on-session-authentication
plan: 08
subsystem: api
tags: [answer-photos, access-policy, express, drizzle, storage]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-03 answer_photos и ANSWER_PHOTO_VARIANTS; 12-05 answers/ вне общего прокси; 12-06 answerPhotoUrl в клиенте; 12-07 сервис services/answer-photos и putAnswerPhoto"
provides:
  - "GET /api/answer-photos/:photoId/:variant с Content-Type image/webp, Cache-Control private, no-store, nosniff, CORP same-origin, Content-Disposition inline"
  - "Функция шва canReadAnswerPhoto(req, photoId) в AccessScope, scope.ts и services/access-policy/index.ts"
  - "ZoneLoader.answerPhotoSubject(photoId) → { ownerId, attemptId } | null (Drizzle и в памяти), ZoneSnapshot.answerPhotos, тип AnswerPhotoSubject"
  - "readAnswerPhotoFile(photoId, variant) в services/answer-photos"
affects: [12-09, 12-10, 14, 15]

actuals:
  tokens: 10300
  tasks: 3
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Доступ к фото: владелец сессии; иначе только через test_sessions.attempt_id и canReviewAttempt; без попытки ветки проверяющего нет, включая zone.all"
    - "Все отказы раздачи (нет доступа, нет фото, неизвестный variant, нет файла) — один ответ 404 { error: 'Фото не найдено' } из одной функции"

key-files:
  created:
    - app/server/src/routes/answer-photos.ts
    - app/server/src/routes/answer-photos.test.ts
  modified:
    - app/server/src/services/access-policy/zone-loader.ts
    - app/server/src/services/access-policy/scope-rules.ts
    - app/server/src/services/access-policy/scope.ts
    - app/server/src/services/access-policy/index.ts
    - app/server/src/services/access-policy/scope.test.ts
    - app/server/src/services/answer-photos/index.ts
    - app/server/src/routes/index.ts
    - scripts/teacher-zone-guards.test.mjs
    - app/server/route-inventory.txt

key-decisions:
  - "canReadAnswerPhoto написана отдельной функцией, не через zoned(): zoned пропускает zone.all до проверки объекта, и администратор видел бы фото до сдачи (T-12-30)"
  - "Ветка владельца не требует права: у ученика нет tests.read, фото своей сессии он видит всегда (D-17)"
  - "В обработчике первой идёт canReadAnswerPhoto, затем проверка variant; ответ на неизвестный variant тот же 404"

requirements-completed: [PHOTO-05]

coverage:
  - id: D1
    description: "Владелец получает thumb и full отдельным маршрутом с заголовками D-16, байты совпадают с хранилищем"
    requirement: PHOTO-05
    verification:
      - kind: integration
        ref: "app/server/src/routes/answer-photos.test.ts#владелец получает миниатюру и полное фото отдельным маршрутом с private, no-store"
        status: pass
    human_judgment: false
  - id: D2
    description: "Чужой ученик, случайный UUID и неизвестный variant получают тот же 404 и то же тело"
    requirement: PHOTO-05
    verification:
      - kind: integration
        ref: "app/server/src/routes/answer-photos.test.ts#другому ученику того же теста, случайному UUID и неизвестному варианту — тот же 404, что отсутствующему фото"
        status: pass
    human_judgment: false
  - id: D3
    description: "Проверяющий раздела и администратор видят фото только после сдачи, учитель другого раздела — никогда"
    requirement: PHOTO-05
    verification:
      - kind: integration
        ref: "app/server/src/routes/answer-photos.test.ts#проверяющий видит фото только после сдачи и только в разделе своей зоны"
        status: pass
      - kind: unit
        ref: "app/server/src/services/access-policy/scope.test.ts#canReadAnswerPhoto (D-17)"
        status: pass
      - kind: other
        ref: "yarn verify"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 08: Раздача фото ответа владельцу и проверяющим Summary

**`GET /api/answer-photos/:photoId/:variant` отдаёт WebP с `private, no-store` только владельцу сессии и, после сдачи, проверяющему зоны через `canReadAnswerPhoto` в шве `services/access-policy` (по `test_sessions.attempt_id` и `canReviewAttempt`); всем остальным — тот же 404, что на отсутствующее фото**

## Performance

- **Duration:** около 12 мин
- **Started:** 2026-10-16T15:46:00Z
- **Completed:** 2026-10-16T15:58:00Z
- **Tasks:** 3 из 3
- **Files modified:** 11 (2 новых, 9 изменённых)

## Таблица доступа

| Кто | До сдачи | После сдачи |
| --- | --- | --- |
| Владелец сессии (ученик) | 200 | 200 |
| Другой ученик (в том числе с сессией того же теста) | 404 | 404 |
| Учитель раздела теста (`tests.read`, раздел в зоне) | 404 | 200 |
| Учитель другого раздела | 404 | 404 |
| Администратор (`tests.read` + `zone.all`) | 404 | 200 |
| Любой вошедший, случайный `photoId` или `variant` вне `thumb`/`full` | 404 | 404 |
| Без cookie | 401 | 401 |
| `photoId` не UUID | 400 (`validateUUID`) | 400 |

Все 404 — `{ error: 'Фото не найдено' }`; в тесте статус и тело сравниваются `deepEqual` с ответом на несуществующее фото.

## Accomplishments

- `zone-loader.ts`: метод `answerPhotoSubject` в `ZoneLoader`; Drizzle — `answer_photos` `innerJoin` `test_sessions` по `session_id`, поля `test_sessions.user_id` и `test_sessions.attempt_id`, не-UUID → `null`; в памяти — `ZoneSnapshot.answerPhotos`. Тип `AnswerPhotoSubject` реэкспортируется из `scope.ts` и `index.ts`.
- `scope-rules.ts`: `canReadAnswerPhoto` — нет `req.authUser` → `false`; субъекта нет → `false`; владелец → `true`; `attemptId !== null` → `canReviewAttempt(req, attemptId)`; иначе `false`. Мемоизация зоны та же: `canReviewAttempt` читает разделы через `myTopicIds` на `Request`.
- `services/answer-photos/index.ts`: `readAnswerPhotoFile(photoId, variant)` — строка фото по `id` → `answerPhotoKey(row, variant)` → `storage().read(key)` → `data` или `null`. Ключ строится из строки базы, не из параметров запроса.
- `routes/answer-photos.ts`: `validateUUID('photoId')`, `sessionRequired()`, обработчик: `canReadAnswerPhoto` → `variant` из `ANSWER_PHOTO_VARIANTS` → `readAnswerPhotoFile`; все отказы одной функцией `photoNotFound`. Заголовки: `Content-Type: image/webp`, `Content-Length`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` (поверх глобального `cross-origin` helmet), `Content-Disposition: inline`. Маршрут не импортирует хранилище и не использует предикат общего прокси.
- `routes/index.ts`: `router.use('/answer-photos', answerPhotosRouter)`.
- `teacher-zone-guards.test.mjs`: `ANSWER_PHOTO_ROUTES`, запись в `ROUTE_FILES` (`router`, `/api/answer-photos`), запись `INVENTORY` с `OBJECT` и `canReadAnswerPhoto(`, `INVENTORY.length` 45 → 46; пробный тест копирует новый файл через `ROUTE_FILES` и остаётся зелёным.

## Разница снимка маршрутов

```
+GET /api/answer-photos/:photoId/:variant  validateUUID(photoId) > sessionRequired > <anonymous>
```

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: владелец получает миниатюру отдельным маршрутом** — не закоммичено
2. **Task 2: чужим тот же 404, проверяющему только после сдачи** — не закоммичено
3. **Task 3: инвентарь охранного теста, снимок, ворота плана** — не закоммичено

## Проверки

- `answer-photos.test.ts` + `scope.test.ts`: 2 файла, 44 теста, зелёные с первого прогона.
- Мутационная проверка: временно `if (subject.attemptId === null) return hasGlobalZone(req)` в `scope-rules.ts` — падают строка таблицы «zone.all без попытки» и HTTP-тест проверяющего до и после сдачи (2 из 44); файл восстановлен из копии, строка `attemptId === null) return false` на месте.
- `node --test scripts/teacher-zone-guards.test.mjs scripts/api-routes-have-callers.test.mjs scripts/storage-no-private-access.test.mjs`: 24 из 24; `api-routes-have-callers` повторно после перегенерации снимка — 2 из 2 (вызывающий — `answerPhotoUrl` в `app/web/lib/tests/answer-photos-api.ts`).
- Typecheck сервера чистый; lint — только прежнее предупреждение `keys.ts:17`.
- `yarn verify: OK` с первого прогона (server 2087, web 1690, exam-core 745, rbac 37). Серверных тестов до плана 2070 (после 12-07), после 2087 (+17: 4 HTTP и 13 в `scope.test.ts`). Отдельный прогон `with-test-db … server test` не делался: тот же набор идёт в `yarn verify`.
- Критерии приёмки по `grep`: `answerPhotoSubject` в `zone-loader.ts` 3; `canReadAnswerPhoto` в `index.ts` 1; `private, no-store` 1 и `same-origin` 1 в маршруте; `canReadAnswerPhoto(` в охранном тесте 1; строка маршрута в снимке 1.

## CodeGraph

Индекс CodeGraph построен по основному checkout, не по worktree (предупреждение инструмента); файлы шва в нём совпадают с `dev` до плана.

`codegraph impact ZoneLoader` — 33 символа: интерфейс и 8 методов, `createDrizzleZoneLoader:52`, `createInMemoryZoneLoader:147` (`zone-loader.ts`); `countingLoader:44`, `zoneScope:56`, `failingLoader:62` (`scope.test.ts`); `countingLoader:97` (`zone-store.test.ts`); `createAccessScope:40` и функции `scope-rules.ts` (`myGroupIds`, `ownedGroupScope`, `myTopicIds`, `topicInZone`, `canAssignMany`, `testScope`, `canReviewAttempt`, `canManageStudent`, `canWriteTest`, `canReadTest`, `canReadUser`). `countingLoader` в обоих тестах обходит методы динамически, правка понадобилась только `failingLoader` (C4).

`codegraph impact canReviewAttempt` — три определения: метод `AccessScope` (`scope-rules.ts:22`), функция в `createAccessScope` (`scope-rules.ts:128`; `scope.ts:17`, `scope.test.ts`, `index.ts`), константа `scope.ts:23` (маршрут `GET /admin/attempts/:attemptId` в `routes/tests/admin/attempts.ts:311`). Сама функция не менялась, новый вызов — из `canReadAnswerPhoto`.

`codegraph affected` по файлам плана (`zone-loader.ts`, `scope-rules.ts`, `scope.ts`, `access-policy/index.ts`, `answer-photos/index.ts`, `routes/answer-photos.ts`, `routes/index.ts`): 102 файла, из них 66 тестовых (серверные интеграционные через `routes/index.ts`, web-тесты API-клиентов, `e2e/tests/zero-weight.spec.ts`); все серверные и web — в `yarn verify`.

Реализация сверена с `12-RESEARCH.md` § «Pattern 5» и § «Security Domain», `12-PATTERNS.md` § «`canReadAnswerPhoto`» и § «`S/routes/answer-photos.ts`», строкой PHOTO-05 в `12-VALIDATION.md`: заголовки, порядок решения, одинаковый 404 и построение ключа из строки совпадают, дополнительных требований там нет. Литерал `answers/` в `answer-photos.test.ts` (`storedBytes`) — как в `session-photos.test.ts` 12-07: тестовые файлы `storage-no-private-access` не проверяет.

## TDD Gate Compliance

RED не получен: Task 1 по плану уже реализует D-17 целиком, и случаи `<behavior>` Task 2 прошли с первого прогона. Вместо RED тесты проверены мутацией правила (см. «Проверки»): ослабление ветки без попытки ловится и таблицей шва, и HTTP-тестом.

## Files Created/Modified

- `app/server/src/routes/answer-photos.ts` — маршрут раздачи (новый).
- `app/server/src/routes/answer-photos.test.ts` — интеграционные тесты (новый).
- `app/server/src/services/access-policy/zone-loader.ts` — `answerPhotoSubject`, `ZoneSnapshot.answerPhotos`, `AnswerPhotoSubject`.
- `app/server/src/services/access-policy/scope-rules.ts` — `canReadAnswerPhoto`.
- `app/server/src/services/access-policy/scope.ts`, `index.ts` — экспорт.
- `app/server/src/services/access-policy/scope.test.ts` — `answerPhotos` в `WORLD`, `failingLoader`, таблица `canReadAnswerPhoto`, запрос без пользователя, ошибка загрузчика, строки загрузчика в памяти.
- `app/server/src/services/answer-photos/index.ts` — `readAnswerPhotoFile`.
- `app/server/src/routes/index.ts` — монтирование.
- `scripts/teacher-zone-guards.test.mjs` — инвентарь.
- `app/server/route-inventory.txt` — одна строка.

## Deviations from Plan

**1. Порядок проверок в обработчике.** План перечисляет проверку `variant` первой, а `key_links` требует `canReadAnswerPhoto` первой проверкой. Сделано: сначала `canReadAnswerPhoto`, затем `variant`; ответ одинаковый, лишний запрос к базе на неизвестный `variant` — цена порядка.

**2. Экспорт типа `AnswerPhotoSubject`.** Тип результата загрузчика вынесен именем и реэкспортирован из `scope.ts` и `index.ts` рядом с `ZoneLoader`.

**3. Дополнительные строки таблицы шва.** Сверх `<behavior>`: «владелец после сдачи», «другой ученик после сдачи», «учитель раздела без tests.read»; ошибка загрузчика пробрасывается из `canReadAnswerPhoto`; запрос без пользователя не читает загрузчик.

**4. Отдельный полный серверный прогон** не делался — его покрывает `yarn verify` того же состояния.

## Issues Encountered

Нет.

## Не проверено

- Раздача через Next rewrites и Caddy в браузере (CORP `same-origin` рассчитан на то, что клиент ходит на `/api` своего origin) — проверит e2e 12-09/12-10.
- Адаптер `local` и `supabase` для `answers/` в этом плане не проверялись: тесты идут на `memory`; чтение идёт тем же `storage().read`, что закреплён контрактными тестами хранилища.

## Next Phase Readiness

- 12-09: миниатюра — `answerPhotoUrl(photoId, 'thumb')` (`/api/answer-photos/<id>/thumb`), ответ `image/webp`, без кэша; отказ — 404 JSON, `<img>` покажет ошибку загрузки.
- Фаза 14: доступ проверяющего уже идёт через `test_sessions.attempt_id`; заполнение `answer_photos.attempt_id` при сдаче на правило не влияет.
- Фаза 15: просмотр фото проверяющим — тот же маршрут; новых правил доступа не нужно.

## Команды для ведущей сессии

Нет: заглушек, пропущенных тестов и незапущенных `<verify>` не осталось, записей в `.planning/WINDOWS.md` не требуется.

## Предлагаемое сообщение коммита

`feat: Раздача фото ответа GET /api/answer-photos/:photoId/:variant с private, no-store: владельцу сессии и проверяющему зоны только после сдачи через canReadAnswerPhoto в шве доступа, остальным тот же 404, что на отсутствующее фото`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/server/src/routes/answer-photos.ts
- FOUND: app/server/src/routes/answer-photos.test.ts
- Коммиты: не закоммичено (по правилу)

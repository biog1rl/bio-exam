---
phase: 12-photos-on-session-authentication
plan: 05
subsystem: api
tags: [storage, access, adr-0004, guards]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01: раздел ADR-0004 «Обработка фото и память»; 12-02: охранный тест без мёртвого маршрута"
provides:
  - "NAMESPACE_READERS в services/storage/keys.ts: images, avatars — signed-in; topics — signed-in-assets-only; answers — owner-and-reviewers"
  - "answers в STORAGE_NAMESPACES: ключи answers/… нормализуются и пишутся, но isServableImageKey = false, storageUrl бросает Error"
  - "Раздел ADR-0004 «Кто читает пространство»; литерал answers/ в маршрутах ловит storage-no-private-access"
affects: [12-07, 12-08, 12-10]

actuals:
  tokens: 2500
  tasks: 2
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Доступ к пространству хранилища — одна таблица NAMESPACE_READERS (satisfies Record<StorageNamespace, NamespaceReader>), предикаты выводятся из неё"

key-files:
  created: []
  modified:
    - app/server/src/services/storage/keys.ts
    - app/server/src/services/storage/index.ts
    - app/server/src/services/storage/links.test.ts
    - app/server/src/routes/docs/assets.test.ts
    - scripts/storage-no-private-access.test.mjs
    - docs/adr/0004-storage-port-two-adapters.md

key-decisions:
  - "Имя isServableImageKey сохранено (не дублируется isProxyReadableKey), логика выведена из таблицы через namespaceReader"
  - "Добавлен экспорт namespaceReader(key): им пользуется storageUrl, его возьмёт 12-07/12-08 при необходимости"

requirements-completed: [DEBT-07, PHOTO-05]

coverage:
  - id: D1
    description: "answers/ с файлом в хранилище не отдаётся через /api/docs/assets/proxy и /signed (400)"
    requirement: PHOTO-05
    verification:
      - kind: integration
        ref: "app/server/src/routes/docs/assets.test.ts#файл answers/… лежит в хранилище, но proxy и signed отвечают 400"
        status: pass
    human_judgment: false
  - id: D2
    description: "Таблица читателей в коде и в ADR-0004, storageUrl и resolveImageLink отказывают answers/"
    requirement: DEBT-07
    verification:
      - kind: unit
        ref: "app/server/src/services/storage/links.test.ts#кто читает пространство"
        status: pass
      - kind: other
        ref: "yarn verify"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 05: Кто читает пространство хранилища Summary

**Правило чтения пространств — таблица `NAMESPACE_READERS` в `keys.ts`; `answers/` пишется адаптерами, но общий прокси и `/signed` отвечают ему 400, `storageUrl` бросает ошибку программиста; ADR-0004 получил раздел «Кто читает пространство», охранный тест ловит литерал `answers/` в маршрутах**

## Performance

- **Duration:** около 6 мин
- **Started:** 2026-10-16T11:29:00Z
- **Completed:** 2026-10-16T11:35:00Z
- **Tasks:** 2 из 2
- **Files modified:** 6

## Таблица читателей

| Пространство | `NAMESPACE_READERS` | Кто читает | Как отдаётся |
| --- | --- | --- | --- |
| `images/` | `signed-in` | любой вошедший | общий прокси, `storageUrl` |
| `avatars/` | `signed-in` | любой вошедший | общий прокси, `storageUrl` |
| `topics/` | `signed-in-assets-only` | любой вошедший, только `…/assets/…` | общий прокси, `storageUrl` |
| `answers/` | `owner-and-reviewers` | владелец сессии, после сдачи проверяющие по `canReviewAttempt` | только отдельный маршрут фото; `storageUrl` бросает `Error` «storageUrl: пространство answers не отдаётся общим прокси» |

## Accomplishments

- `keys.ts`: `answers` в `STORAGE_NAMESPACES`; тип `NamespaceReader`; `NAMESPACE_READERS … as const satisfies Record<StorageNamespace, NamespaceReader>`; `namespaceReader(key)`; `isServableImageKey` выводится из таблицы (проверки нормализации и расширения прежние).
- `storage/index.ts`: `storageUrl` отказывает пространству `owner-and-reviewers` ошибкой `Error` (не `ApiError`); реэкспорт `NAMESPACE_READERS`, `namespaceReader`, типов `NamespaceReader`, `StorageNamespace`.
- `links.test.ts`: `test.each` для `isServableImageKey` (`images/a.webp`, `avatars/u/a.png`, `topics/b/c/assets/x.png` — да; `topics/b/c/d.png`, `answers/s/q/p/full.webp` — нет), `storageUrl('answers/…')` бросает не `StorageKeyError`, `resolveImageLink('answers/…')` — `StorageKeyError`.
- `routes/docs/assets.test.ts` (tracer): ключ `answers/<uuid>/<uuid>/<uuid>/full.webp` записан в память; `GET /proxy` → 400 без байтов файла, `GET /signed` → 400 «Invalid path».
- ADR-0004: раздел «Кто читает пространство» перед «Обработка фото и память» (раздел 12-01 не тронут).
- `storage-no-private-access.test.mjs`: шаблон `(?:topics|avatars|answers)\/`, подпись «литерал ключа хранилища topics/, avatars/ или answers/ в маршруте» в правиле и обоих образцах VIOLATING, новый образец `` `answers/${sessionId}/${questionId}` ``, который правило обязано отклонить (C5).

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: таблица читателей, answers/ закрыт для прокси** — не закоммичено
2. **Task 2: ADR-0004 и охранный тест** — не закоммичено

## CodeGraph

`codegraph impact isServableImageKey` — 21 символ: `keys.ts` `isServableImageKey:75`; `links.ts` `resolveImageLink:97`; `links.test.ts`; `services/assets/images.ts` `resolveImageUrl:95`, `readServableImage:87`; `services/question-content/export.ts` `isExportableAsset:41`, `collectParts:133`; `test-support/export-reference.ts` `isExportableAsset:85`, `collectTestParts:152`; `routes/docs/assets.ts` (`GET /api/docs/assets/proxy:62`); `services/assets/index.ts`; `services/question-content/asset-index.ts` `inventoryAssetRefs:162`.

`codegraph impact storageUrl` — 23 символа: `storage/index.ts` `storageUrl:158`; `storage-known-defects.test.ts`, `storage.contract.test.ts`; `services/assets/images.ts` `listImages:60`, `resolveImageUrl:95`; `routes/docs/assets.ts` (`GET /api/docs/assets:24`); `services/assets/index.ts`; `links.ts` `resolveImageLink:97`, `avatarUrl:109`; `links.test.ts`; `routes/auth/me.ts` (`GET /api/auth/me:11`); `routes/users/profile.ts` (`PATCH /api/users/profile:67`).

Ни один из вызывающих не передаёт ключи `answers/`: экспорт архива и индекс ссылок берут `isServableImageKey` и для `answers/` получают `false`, как для неизвестного ключа раньше.

`codegraph affected` по `keys.ts` и `storage/index.ts`: 155 тестовых файлов (хранилище импортируют почти все маршруты); все в наборе `yarn verify`.

## Проверки

- Tracer: `src/services/storage` и `src/routes/docs/assets.test.ts` — 7 файлов, 363 теста, зелёные.
- `node --test scripts/storage-no-private-access.test.mjs scripts/check-docs-structure.test.mjs`: 19 из 19.
- Typecheck сервера чистый; lint — только прежнее предупреждение `no-control-regex` в `keys.ts` (строка сдвинулась с 8 на 17).
- `yarn verify: OK` с первого прогона при load average около 30 (server 2056, web 1649, exam-core 745, rbac 37).
- Критерии приёмки по `grep`: `'answers'` в `keys.ts` — 1; `satisfies Record<StorageNamespace` — 1; `answers/` в `assets.test.ts` — 2; «Кто читает пространство», `canReviewAttempt`, `NAMESPACE_READERS` в ADR — по 1; `answers` в охранном тесте — 6.

## Files Created/Modified

- `app/server/src/services/storage/keys.ts`, `app/server/src/services/storage/index.ts` — таблица читателей и отказ `storageUrl`.
- `app/server/src/services/storage/links.test.ts`, `app/server/src/routes/docs/assets.test.ts` — тесты.
- `scripts/storage-no-private-access.test.mjs` — правило литерала `answers/`.
- `docs/adr/0004-storage-port-two-adapters.md` — раздел «Кто читает пространство».

## Deviations from Plan

- Добавлен экспорт `namespaceReader(key)` (нормализует ключ и возвращает читателя из таблицы): одна точка для `isServableImageKey` и `storageUrl`, без дубля разбора пространства. В `<interfaces>` его не было.

## Issues Encountered

Нет.

## Не проверено

Ничего сверх `yarn verify`.

## Next Phase Readiness

- 12-07: ключи `answers/{sessionId}/{questionId}/{photoId}/{full,thumb}.webp` проходят `normalizeKey` и пишутся `storage().write`; литерал `answers/` допустим только вне `routes` (в `services/answer-photos`).
- 12-08: маршрут раздачи читает `storage().read(key)` напрямую; `storageUrl` и `resolveImageLink` для `answers/` не использовать.
- Навык `bio-exam-api` (строка про пространства `images/`, `topics/`, `avatars/`) правит 12-10.

## Предлагаемое сообщение коммита

`feat: Правило чтения пространств хранилища одной таблицей NAMESPACE_READERS: answers/ пишется, но общий прокси и signed отвечают 400, storageUrl не строит ссылку; раздел ADR-0004 «Кто читает пространство», литерал answers/ в маршрутах ловит охранный тест`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: NAMESPACE_READERS в app/server/src/services/storage/keys.ts
- FOUND: «Кто читает пространство» в docs/adr/0004-storage-port-two-adapters.md
- Коммиты: не закоммичено (по правилу)

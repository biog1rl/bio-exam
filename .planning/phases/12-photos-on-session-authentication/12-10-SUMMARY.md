---
phase: 12-photos-on-session-authentication
plan: 10
subsystem: docs
tags: [skills, e2e, ci, photo-memory-bench, phase-gate]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01 … 12-09: приём изображений, пространства, фото ответа (сервис, маршруты, раздача), клиент и блок фото"
provides:
  - "Навыки bio-exam-api, bio-exam-data, bio-exam-web описывают фото ответа и приём изображений"
  - "Ворота фазы: полный e2e, yarn verify, шаги CI job build, скомпилированный замер"
  - "Шаги пользователя вне репозитория"
affects: [13, 14, 16]

actuals:
  tokens: 2600
  tasks: 2
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-data/SKILL.md
    - .agents/skills/bio-exam-web/SKILL.md

key-decisions:
  - "Строка навыка api о пространствах дописана здесь: в dev она перечисляла только images/, topics/, avatars/"
  - "Полный e2e прогнан двумя частями по 18 и 19 спеков (все 37 файлов), чтобы каждый вызов уложился в 10 минут инструмента"

requirements-completed: [PHOTO-04, DEBT-07]

coverage:
  - id: D1
    description: "Скомпилированный замер запускается командой образа"
    requirement: PHOTO-04
    verification:
      - kind: other
        ref: "node app/server/dist/scripts/photo-memory-bench.js --series 5"
        status: pass
    human_judgment: false
  - id: D2
    description: "Навыки по фактам фазы, пути существуют"
    requirement: DEBT-07
    verification:
      - kind: other
        ref: "node --test scripts/check-docs-structure.test.mjs; node scripts/check-docs-commands.mjs"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 10: Ворота фазы, навыки и шаги пользователя Summary

**Скомпилированный замер работает командой образа, полный e2e (desktop и mobile) и `yarn verify` зелёные, шаги CI job build зелёные; навыки api, data и web описывают приём изображений, пространство `answers/`, фото ответа и блок фото**

## Performance

- **Duration:** около 15 мин
- **Started:** 2026-10-16T16:13:00Z
- **Completed:** 2026-10-16T16:28:00Z
- **Tasks:** 2 из 2
- **Files modified:** 3

## Что сделано

- `bio-exam-api`:
  - «Доступ»: `canReadAnswerPhoto` в списке функций шва и отдельная строка о правиле (владелец сессии; проверяющий через `canReviewAttempt` только при `attempt_id`).
  - «Попытка теста»: строка окна фото больше не говорит «маршрутов фото пока нет»; добавлены сервис `services/answer-photos` (идемпотентность по `photoId`, лимит 5 и окно под `FOR UPDATE`, удаление, `removeUserAnswerPhotos`, `readAnswerPhotoFile`), маршруты `session-photos.ts` и раздача `GET /api/answer-photos/:photoId/:variant`.
  - «Содержимое вопроса и файлы»: пространства с `answers/` и `NAMESPACE_READERS` со ссылкой на ADR-0004 «Кто читает пространство»; модуль приёма `image-intake.ts` (профили, отказы 400/413/415/503, ограничитель, `cache(false)`); `singleFileUpload`; скрипт замера `photo-memory-bench`.
- `bio-exam-data`: раздел «Фото ответа» (`answer_photos`, миграция `0031_answer_photos`, ключи и правила удаления, индекс, RLS, кто пишет и читает, раскладка файлов `answers/…`); в «Удаление пользователя» — `removeUserAnswerPhotos`.
- `bio-exam-web`: в «Прохождение теста» — `PhotoBlock`, очереди сессии (`useAnswerPhotoSession`, `useAnswerPhotos`), `createPhotoUploadQueue`, `prepareForUpload`, `answer-photos-api.ts`, `uploadWindowRefusalText`, правило «`img`, не `next/image`».
- Факты сверены с кодом: статусы отказов `acceptImage` (400 нераспознанный/повреждённый, 413 пиксели, 415 распознанный, но не принятый тип), профили `IMAGE_PROFILES`, флаги скрипта замера (`--series`, `--dir`, `--out`), значения `NAMESPACE_READERS`, пути маршрутов.

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: замер в сборке и полный e2e** — не закоммичено
2. **Task 2: навыки, шаги пользователя, ворота CI** — не закоммичено

## Проверки

### Скомпилированный замер

`yarn workspace @bio-exam/rbac build && yarn workspace @bio-exam/exam-core build && yarn workspace @bio-exam/server build`, `test -f app/server/dist/scripts/photo-memory-bench.js` — есть; `node app/server/dist/scripts/photo-memory-bench.js --series 5` — код 0, хвост вывода (macOS, не образ API):

```
| PNG 49 МП | 0.6 | — | 1 | 1 | ok | ok | webp 2560×2560, 0 МБ | 63 | 227 |
| PNG 49 МП | 0.6 | — | 2 | 2 | ok | ok | webp 2560×2560, 0 МБ | 149.4 | 233 |
| WebP lossless 48 МП | 0 | 6 | 1 | 1 | ok | ok | webp 1920×2560, 0 МБ | 307.8 | 332 |
| WebP lossless 48 МП | 0 | 6 | 2 | 2 | ok | ok | webp 1920×2560, 0 МБ | 595.9 | 348 |
| WebP q80 48 МП | 23.2 | 6 | 1 | 1 | ok | ok | webp 1920×2560, 1.2 МБ | 310.5 | 1417 |
| WebP q80 48 МП | 23.2 | 6 | 2 | 2 | ok | ok | webp 1920×2560, 1.2 МБ | 602.2 | 1435 |
| PNG 64 МП | 0.8 | — | 1 | 1 | 413 | 413 | — | 0.7 | 2 |

Итог серии: RSS 164.4 → 192.6 МБ, среднее 605 мс, около 99 фото в минуту при concurrency 1
```

Правок скрипта не понадобилось.

### Полный e2e

Все 37 спеков `e2e/tests`, двумя вызовами `yarn e2e` (по 18 и 19 файлов, каждый с setup 18 аккаунтов на оба проекта):

- часть 1 (`answer-durability` … `mobile-layout`, включая `answer-photos`, `bank`, `deadline-finalised`): 136 passed (2,7 мин);
- часть 2 (`navigation` … `zero-weight`, включая `teacher-zone`, `review`, `timed-attempt`): 272 passed (3,5 мин).

Падений и флейков нет; `chromium-desktop` и `chromium-mobile` зелёные. `bank.spec.ts` и `teacher-zone.spec.ts` в этом worktree зелёные. В логе части 2 строки `[WebServer] ⨯ Error: Server request for /admin/attempts/not-a-uuid failed: status 400` — ожидаемые запросы сценария с неверным id, тесты прошли.

### Документы, verify, CI

- `node --test scripts/check-docs-structure.test.mjs`: 11 pass, 0 fail; `node scripts/check-docs-commands.mjs`: `check-docs-commands: OK`.
- `yarn verify: OK` с первого прогона: rbac 37, exam-core 745, web 1690, server 2087, script-tests 236.
- Шаги CI job build: `check-rbac-dist` — «rbac dist OK … 15 экспортов»; `check-exam-core-dist` — «exam-core dist OK … 98 экспортов»; сборка сервера и web без ошибок; `yarn editor:budget` — «editor bundle OK» (raw 2612074, gzip 731146 на обоих маршрутах редактора).
- Критерии приёмки по `grep`: `canReadAnswerPhoto` — 2, `NAMESPACE_READERS` — 1, `image-intake` — 1, `photo-memory-bench` — 1, `answer-photos` — 3, `0004` — 3 в навыке api; `0031_answer_photos` — 1 в навыке data; `PhotoBlock` — 1 в навыке web.

`codegraph affected` по основным файлам фазы (`image-intake.ts`, `services/answer-photos/index.ts`, `routes/tests/session-photos.ts`, `routes/answer-photos.ts`, `storage/keys.ts`, `upload-queue.ts`, `PhotoBlock.tsx`): «Affected test files (163)», среди них `app/server/src/routes/answer-photos.test.ts`, `app/server/src/routes/docs/assets.test.ts`, `app/server/src/db/user-deletion-rule.test.ts`, `app/server/src/routes/route-inventory.snapshot.test.ts`, тесты попытки `app/server/src/routes/tests/*`. Все они входят в `yarn verify`, который прошёл. Индекс CodeGraph — основного checkout.

## Шаги пользователя

1. Замер на Linux-образе API после сборки образа с фазой 12: отдельный контейнер из того же образа с лимитом памяти, как у контейнера API, команда `node dist/scripts/photo-memory-bench.js` (по умолчанию синтетика 12 и 48 МП, параллельность 1 и 2, серия 30); не на работающем контейнере API и не во время занятий. Таблицу — в ADR-0004 строкой «Образ API (Linux)» (раздел «Обработка фото и память»).
2. Реальные снимки iPhone и Android (большой JPEG, HEIC): `node dist/scripts/photo-memory-bench.js --dir <каталог снимков> --out <каталог результатов>`; посмотреть читаемость тетрадной страницы при 2560 px; число HEIC среди снимков — основание для пересмотра D-12.
3. Mac Safari: в раннере выбрать фото HEIC — уходит JPEG и фото принимается (клиент уменьшает через canvas); если приходит отказ HEIC — сообщить.
4. Лимит памяти контейнера API — решение по замеру шага 1 (профиль сервера правит пользователь).
5. Лимит тела запроса в Caddy не ниже лимита загрузки фото (10 МБ) с запасом на multipart.
6. Выкатка: миграция 0031 аддитивная (новая таблица), выкатка по правилам профиля сервера; после выкатки — загрузка фото открытого вопроса из раннера (вопрос open в проде до фазы 17 неактивен, проверка — на e2e или копии данных).

### Решение владельца по замеру 12-01

WebP 48 МП тратит около 310 МБ на одну обработку sharp (две одновременные — около 600 МБ), JPEG и PNG 48 МП — около 70 МБ. Лимит 50 МП (D-11, D-13) не менялся. Варианты: отдельный меньший лимит пикселей для WebP либо не принимать WebP у фото ответа (клиент всегда шлёт JPEG). Решать после Linux-замера (шаг 1).

## Остаток для фазы 14

- «Завершить» при идущей загрузке не ждёт очередь фото.
- Просмотр крупного фото (вариант `full`) в интерфейсе.
- Отсчёт окна для фото до сдачи: `uploadClosesAt` клиент получает только после сдачи.

## Команды для ведущей сессии

Нет: план не требует записей через gsd-tools.

## Files Created/Modified

- `.agents/skills/bio-exam-api/SKILL.md` — доступ к фото, фото ответа в попытке, пространства, приём изображений, `singleFileUpload`, замер.
- `.agents/skills/bio-exam-data/SKILL.md` — раздел «Фото ответа», файлы фото при удалении пользователя.
- `.agents/skills/bio-exam-web/SKILL.md` — блок фото, очереди, уменьшение, клиент API, правило `img`.

## Deviations from Plan

1. Полный `yarn e2e` выполнен двумя вызовами по списку файлов (все 37 спеков), а не одним: предел одного вызова инструмента — 10 минут; суммарно около 6 минут прогона.
2. В навыке api строка о пространствах обновлена здесь (в dev она не содержала `answers/`); ADR-0004 не менялся — разделы 12-01, 12-05 и 12-07 там уже есть.

## Не проверено

- Замер в Linux-образе, реальные снимки, HEIC в Safari, лимиты контейнера и Caddy, выкатка 0031 — шаги пользователя выше.

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: .agents/skills/bio-exam-api/SKILL.md, .agents/skills/bio-exam-data/SKILL.md, .agents/skills/bio-exam-web/SKILL.md (изменены)
- FOUND: app/server/dist/scripts/photo-memory-bench.js (после сборки)
- Коммиты: не закоммичено (по правилу)

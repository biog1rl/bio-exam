---
phase: 13-token-qr-and-phone-page
plan: 09
subsystem: docs
status: complete
tags: [skills, adr, upload-links, answer-photos]
requires:
  - "13-02: readPhotoSlot, answer_upload_links, uploaded_via"
  - "13-03: services/upload-links, uploadTokenRequired, /api/upload/*, лимиты, redact"
provides:
  - "навык bio-exam-api: раздел «Ссылка загрузки фото», readPhotoSlot, canUserReadTest, answer-photo-intake, контракт ссылки в exam-core"
  - "навык bio-exam-data: раздел «Ссылки загрузки фото», answer_photos.uploaded_via"
  - "ADR-0004: читатель answers/ по ссылке — только миниатюры своего слота"
affects: [13-08]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .agents/skills/bio-exam-api/SKILL.md
    - .agents/skills/bio-exam-data/SKILL.md
    - docs/adr/0004-storage-port-two-adapters.md
decisions:
  - "ссылка загрузки описана отдельным разделом навыка api после «Попытка теста», а не вписана в неё"
  - "устаревшая строка навыка api про лимит ANSWER_PHOTO_MAX_COUNT заменена фактом: лимит — max_photos вопроса, запрет — allow_photos"
metrics:
  duration: "~10 мин"
  completed: 2026-10-17
estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 4000
  tasks: 2
  commits: 0
plan_head_before: 8ec1d207ed14b6f71cbff0d8970efd3201e9a27c
plan_head_after: 8ec1d207ed14b6f71cbff0d8970efd3201e9a27c
---

# Phase 13 Plan 09: документация серверной части ссылки загрузки Summary

Навыки `bio-exam-api` и `bio-exam-data` и ADR-0004 описывают то, что построено в 13-02 и 13-03: правило слота `readPhotoSlot` до транзакции, таблицу `answer_upload_links` и `answer_photos.uploaded_via`, правило живости ссылки (потолок 24 ч от `created_at`, ссылка, выданная до сдачи, после сдачи мертва), лимиты `upload-ip`/`upload-unknown`/`upload-link`/`upload-link-issue`, единый 404, `X-Upload-Token` в redact журнала и нового читателя `answers/` по ссылке.

Коммиты: не закоммичено (коммитит ведущая сессия), `actuals.commits: 0` намеренно.

## Что изменено

| Файл | Изменение |
|------|-----------|
| `.agents/skills/bio-exam-api/SKILL.md` | «Доступ»: `canUserReadTest` и `createUserTestRead`. «Попытка теста»: `readPhotoSlot`, `placeOfSession`, `uploadAnswerPhoto(…, via)` с лимитом `max_photos` и запретом `allow_photos`, исходы `deleteAnswerPhoto` (`refused`, `absent`, `deleted`), `readAnswerPhotoFile(…, slot?)`, отказы слота cookie-маршрутов, `routes/answer-photo-intake.ts`. Новый раздел «Ссылка загрузки фото»: токен и хеш, `services/upload-links`, живость, `uploadTokenRequired`, лимиты, выдача, маршруты `/api/upload/*`, redact, охранный тест. «Содержимое вопроса и файлы»: `answers/` раздают два маршрута. «exam-core как контракт HTTP»: схемы и константы ссылки. В `description` — «ссылка загрузки фото с телефона» |
| `.agents/skills/bio-exam-data/SKILL.md` | последняя миграция — `0034_answer_upload_links.sql`; `answer_photos.uploaded_via` в «Фото ответа»; новый раздел «Ссылки загрузки фото» (столбцы, индексы, RLS, каскад без ключа на `users`, единственный писатель, ротация, `last_used_at`) |
| `docs/adr/0004-storage-port-two-adapters.md` | строка `answers/` таблицы «Кто читает пространство»: держатель ссылки читает только миниатюры своего слота через `GET /api/upload/photos/:photoId/thumb`, полноразмерных по ссылке нет, общий прокси `answers/` не отдаёт (таблицу выровнял `oxfmt`) |

## Проверки

- `node --test scripts/check-docs-commands.test.mjs scripts/check-docs-structure.test.mjs` — 23 из 23.
- `node scripts/check-env-contract.mjs` — `check-env-contract: OK`; `git diff --stat -- app/server/.env.example app/web/.env.example` пусто.
- `yarn format:check` — чисто (после `oxfmt` по трём файлам).
- Критерии приёмки: в навыке api есть `uploadTokenRequired`, `readPhotoSlot`, `upload-links`; в навыке data — `answer_upload_links` и `uploaded_via`; в ADR-0004 — `/api/upload/photos/:photoId/thumb`.

## Шаги владельца для выкатки (в документы репозитория не записаны)

1. **Миграция 0034** (`answer_upload_links`, `answer_photos.uploaded_via`) применяется на сервере вместе с выкаткой фазы 13; файл начинается с `SET LOCAL lock_timeout = '5s'`.
2. **Журнал Caddy:** выяснить, включён ли `log` у сайта; если да — фильтр, удаляющий заголовок `X-Upload-Token` из записи (`request>headers>X-Upload-Token delete`), для путей `/photo-upload*` и `/api/upload/*`. После выкатки проверить запись журнала на обычном запросе и после искусственного 502 (ошибки reverse_proxy пишут заголовки запроса): значения токена в журнале нет.
3. **Заголовки после выкатки:** у `/photo-upload` ответ с `Referrer-Policy: no-referrer` и `X-Robots-Tag`/`robots` noindex, Caddy не перекрывает `Referrer-Policy`; тело запроса к `/api/upload/*` не меньше лимита загрузки фото.
4. **Аварийный отзыв всех ссылок** (например, если токен попал в журнал):
   ```sql
   UPDATE answer_upload_links SET revoked_at = now() WHERE revoked_at IS NULL;
   ```
   Открытые страницы телефонов переходят в «Ссылка недействительна», новые ссылки ученики получают, снова открыв QR.

## Deviations from Plan

### Auto-fixed Issues

Нет.

### Отклонения по исполнению

1. Ссылка загрузки описана отдельным разделом «Ссылка загрузки фото» навыка api, а не только пунктами в «Попытка теста» и «Доступ»: раздел длинный, отдельное место проще находить. В «Доступ» и «Попытка теста» остались пункты о `canUserReadTest` и `readPhotoSlot`.
2. В навыке api заменена устаревшая строка о лимите `ANSWER_PHOTO_MAX_COUNT` (5): лимит слота — `max_photos` вопроса, запрет — `allow_photos` (так работает код после W1 и 13-02). Строка о раздаче `answers/` в «Содержимое вопроса и файлы» дополнена маршрутом миниатюры по ссылке.

## Known Stubs

Нет.

## Issues Encountered

Нет.

## User Setup Required

См. «Шаги владельца для выкатки».

## Next Phase Readiness

Навык web (страница телефона, диалог QR, транспорт ссылки) дописывает 13-08.

## Self-Check: PASSED

- Изменены три файла из `files_modified`, других правок нет.
- Коммитов нет намеренно (правила фазы).

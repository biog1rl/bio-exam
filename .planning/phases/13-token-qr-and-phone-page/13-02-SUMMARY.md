---
phase: 13-token-qr-and-phone-page
plan: 02
subsystem: api
status: complete
tags: [answer-photos, access-policy, migration, exam-core, test-support]
requires:
  - "W1: questions.allow_photos, questions.max_photos, миграция 0033 (b771666)"
provides:
  - "answer_upload_links (0034), answer_photos.uploaded_via"
  - "readPhotoSlot, placeOfSession, PhotoSlot, PhotoSlotRefusal, AnswerPhotoSource"
  - "canUserReadTest, createUserTestRead"
  - "exam-core: UPLOAD_TOKEN_HEADER, UPLOAD_LINK_INVALID_MESSAGE, UploadLinkIssueResponseSchema, UploadLinkContextSchema"
  - "call(): headers, form"
affects: [13-03]
tech-stack:
  added: []
  patterns:
    - "правило слота от места (AnswerPhotoPlace) и userId, не от Request"
    - "полный readPhotoSlot(db) до транзакции, под FOR UPDATE сессии только окно, правило вопроса и счёт через tx"
key-files:
  created:
    - app/server/drizzle/0034_answer_upload_links.sql
    - app/server/drizzle/meta/0034_snapshot.json
    - app/server/src/services/answer-photos/slot.ts
    - app/server/src/services/answer-photos/slot.test.ts
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - app/server/src/services/answer-photos/index.ts
    - app/server/src/services/access-policy/scope-rules.ts
    - app/server/src/services/access-policy/scope.ts
    - app/server/src/services/access-policy/index.ts
    - app/server/src/routes/tests/session-photos.ts
    - app/server/src/test-support/auth-app.ts
    - packages/exam-core/src/answer-photos.ts
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
decisions:
  - "readPhotoSlot проверяет по порядку: активность владельца, checkAttemptAccess, сессию владельца, вопрос теста и шаблон open, окно; доступ раньше сессии, чтобы ответы cookie-маршрутов не изменились"
  - "AnswerPhotoOwner и AnswerPhotoPlace переехали в slot.ts и реэкспортируются из index.ts (без цикла импортов)"
  - "canUserReadTest берёт права через accessPolicy.accessFor(userId) без кэша на запрос; zone.all читается только при tests.read"
metrics:
  duration: "~25 мин"
  completed: 2026-10-17
estimate:
  tokens: 150000
  tasks: 3
actuals:
  tokens: 9000
  tasks: 3
  commits: 0
plan_head_before: 5dddd7d9f533d7ad9e826f3b0bbde7004208a8e6
plan_head_after: 5dddd7d9f533d7ad9e826f3b0bbde7004208a8e6
---

# Phase 13 Plan 02: слот фото, миграция 0034 и контракт ссылки Summary

Одна функция `readPhotoSlot(executor, place)` решает, принимает ли слот фото (активность владельца, назначение или `tests.read` по `userId`, вопрос теста с шаблоном `open`, правило вопроса, сырое окно); миграция 0034 создаёт `answer_upload_links` (только `sha256` токена) и `answer_photos.uploaded_via`; exam-core получил контракт выдачи и контекста ссылки, тестовый `call()` — заголовки и multipart.

Коммиты: не закоммичено (коммитит ведущая сессия). `actuals.commits: 0` — изменения лежат в рабочем дереве worktree намеренно, по `13-EXEC-RULES.md`. `actuals.tokens` — chars/4 по диффу и новым файлам без сгенерированного `0034_snapshot.json` (117 КБ, с ним ~38 тыс.).

## Задачи

| # | Задача | Итог |
|---|--------|------|
| 1 | Миграция 0034 и источник фото | `answerUploadLinks` и `answerPhotos.uploadedVia` в `schema.ts`; `drizzle:generate --name=answer_upload_links`; первой строкой `lock_timeout`; запись в манифесте (`when` 1792170601656 > 1792165213670 у 0033); `uploadAnswerPhoto(..., via)` пишет `uploadedVia` |
| 2 | `readPhotoSlot` от места и `userId` | `slot.ts` (`readPhotoSlot`, `placeOfSession`, `readPhotoRule`, `PhotoSlot`); `createUserTestRead` и `canUserReadTest`; `uploadAnswerPhoto`, `deleteAnswerPhoto`, `listAnswerPhotos` и `answerPhotoTarget` через `readPhotoSlot`; `findPhotoTarget` удалён |
| 3 | Контракт ссылки и `call()` | `UPLOAD_TOKEN_HEADER`, `UPLOAD_LINK_INVALID_MESSAGE`, `UploadLinkIssueResponseSchema`, `UploadLinkContextSchema` и типы; четыре имени в `EXPECTED_EXPORTS`; `call()` принимает `headers` и `form` |

## SQL 0034

```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "answer_upload_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "answer_upload_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD COLUMN "uploaded_via" text DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_upload_links" ADD CONSTRAINT "answer_upload_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_upload_links" ADD CONSTRAINT "answer_upload_links_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_upload_links_token_uniq" ON "answer_upload_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_answer_upload_links_active_slot" ON "answer_upload_links" USING btree ("session_id","question_id") WHERE "answer_upload_links"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_uploaded_via_check" CHECK ("answer_photos"."uploaded_via" IN ('session', 'link'));--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_upload_links" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
```

sha256 файла: `77eaf1349a895488661085dac7f8a6e06227946eb5d8814144f70e1b789c3ff4`. Ключа на `users` нет: `user-deletion-rule.test.ts` зелёный без новых исключений.

## Вызывающие `findPhotoTarget` и `canReadTest`

Индекса CodeGraph (`.codegraph/`) в worktree нет, `codegraph init` не запускался; вместо `codegraph impact` — поиск `rg` по `app/server/src` и `scripts`.

- `findPhotoTarget`: определение в `services/answer-photos/index.ts`, вызовы — `listAnswerPhotos` в том же файле и `answerPhotoTarget` в `routes/tests/session-photos.ts`. Других вызывающих нет, функция удалена.
- `canReadTest(req, testId)`: маршруты `routes/tests/public.ts` (9 вызовов), `assignments.ts`, `admin/scoring-rules.ts`, `admin/tests-by-slug.ts`, `admin/tests-core.ts`, `admin/export.ts`, `admin/question-types.ts` (2), `routes/notifications.ts` (через `services/notifications/kinds.ts` и `read.ts`), тесты `access-policy/scope.test.ts`; охранные скрипты `teacher-zone-guards`, `attempt-integrity-guards`, `storage-no-private-access` ищут его по имени. Из `session-photos.ts` вызов ушёл в `readPhotoSlot` (`canUserReadTest`). Сигнатура `canReadTest(req, testId)` и кэш зоны на запрос прежние.

## Второе место правила «читает тест по userId»

`createUserTestRead` в `access-policy/scope-rules.ts` (`tests.read`; `zone.all` — да; иначе тема теста в зоне) и цикл в `access-policy/review-recipients.ts` (`attemptReviewers` W2: `tests.read`, `zone.all`, иначе тема попытки в зоне учителя плюс ученик в его группе) повторяют одно правило зоны. После слияния W2 свести чтение теста в `review-recipients.ts` через `canUserReadTest`/`createUserTestRead` (условие про группу ученика остаётся своим). В этом плане `review-recipients.ts` не правился.

## Проверки

- Задача 1: `vitest run slot.test.ts user-deletion-rule.test.ts session-photos.test.ts` — 3 файла, 29 тестов, все прошли; `check-migrations: OK`.
- Задача 2: `vitest run src/services/answer-photos session-photos attempt-access-matrix attempt-access-revoke src/services/access-policy` — 9 файлов, 132 теста, все прошли; `node --test teacher-zone-guards attempt-integrity-guards` — 27 из 27.
- Задача 3: сборка exam-core, `check-exam-core-dist` (117 экспортов), `typecheck` сервера — без ошибок.
- Дополнительно: весь набор сервера (`with-test-db … server test`) — 113 файлов, 2142 теста, все прошли; все `scripts/**/*.test.mjs` — 236 из 236; `lint` сервера — только прежнее предупреждение `storage/keys.ts:17` (не моё); `format:check` — чисто после `oxfmt slot.test.ts`.
- `session-photos.test.ts` без правок; `git diff -- app/server/drizzle/00*.sql` пуст (0000–0033 не тронуты).

`slot.test.ts` (`test.each`, восемь строк): админ без назначения и учитель в зоне без назначения — `slot`; ученик со снятым назначением — `not_assigned`; заблокированный ученик — `user_inactive`; вопрос другого теста и вопрос не `open` — `slot_missing`; закрытая без сдачи сессия — `slot` с `window.reason === 'session_closed'`; `allow_photos = false` — `rule.allowPhotos === false`. Отдельно: при `max_photos = 2` третья загрузка — `{ kind: 'limit', max: 2 }`; `placeOfSession` строит место из владельца сессии и отдаёт `null` для неизвестной; источник `session`/`link` в базе и CHECK `answer_photos_uploaded_via_check` (23514).

## Deviations from Plan

### Auto-fixed Issues

Нет.

### Отклонения по исполнению

1. **Порядок шагов `readPhotoSlot`.** План перечисляет сессию первой; сделано: активность владельца, затем `checkAttemptAccess`, затем сессия, вопрос, окно. Причина: прежний маршрут отвечал 404 `Test not found`/403 `Тест не назначен` раньше 404 `ANSWER_PHOTO_TARGET_MISSING`; с сессией первой ответы на ошибочных путях изменились бы. Для cookie активность всегда истинна (`sessionRequired`), поэтому её место ответов не меняет.
2. **Повторная проверка слота в сервисе.** `answerPhotoTarget` и `uploadAnswerPhoto`/`deleteAnswerPhoto` оба вызывают `readPhotoSlot(db)` (как требует план: сервис самодостаточен для ссылки 13-03). Повторный запрос до транзакции — цена этого; под блокировкой второго соединения нет.
3. **`drizzle:generate --name=answer_upload_links`** вместо переименования файла: имя и тег журнала сразу верные.
4. **`codegraph impact`** заменён поиском `rg`: индекса в worktree нет.
5. **`deleteAnswerPhoto`** до транзакции отказывает `missing` только по `refused`; окно проверяется под блокировкой через `tx`, как раньше.

## Known Stubs

Нет. `answer_upload_links` пока никто не пишет: таблицу заполняет сервис ссылок плана 13-03.

## Threat Flags

Нет новой поверхности сверх `<threat_model>`: маршрутов не добавлено; `answer_upload_links` под RLS `deny_direct_access`, только хеш токена.

## Issues Encountered

Нет.

## User Setup Required

Выкатка миграции 0034 на сервер — шаг владельца (вне репозитория), вместе с остальной фазой.

## Next Phase Readiness (заметки для 13-03)

- Ссылка строит место через `placeOfSession(db, sessionId, questionId)`, затем `readPhotoSlot(db, place)`; `session_closed` в `slot.window.reason` отображать в 404 до `uploadWindowRefusal` (Pitfall 6); `refused` любой причины — 404.
- `uploadAnswerPhoto(place, photoId, buffer, 'link')`. Сервис — второй рубеж, не единственный: повтор с уже известным `photoId` отвечает `existing` до `readPhotoSlot` (прежнее поведение cookie, сохранено), поэтому `uploadTokenRequired` сам проверяет слот через `readPhotoSlot`. `sendUploadOutcome` пока локальная функция `session-photos.ts`, для переиспользования её нужно вынести.
- `call(ctx, method, path, { headers: { [UPLOAD_TOKEN_HEADER]: token }, form })` — multipart без `content-type`; `body` вместе с `form` бросает ошибку.
- `canReadAnswerPhoto` не менялся.

## Self-Check: PASSED

- FOUND: app/server/drizzle/0034_answer_upload_links.sql
- FOUND: app/server/drizzle/meta/0034_snapshot.json
- FOUND: app/server/src/services/answer-photos/slot.ts
- FOUND: app/server/src/services/answer-photos/slot.test.ts
- Коммитов нет намеренно (правила фазы).

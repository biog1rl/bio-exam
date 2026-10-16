---
phase: 12-photos-on-session-authentication
plan: 03
subsystem: database
tags: [drizzle, postgres, migration, exam-core, zod, answer-photos]

requires:
  - phase: 12-photos-on-session-authentication
    provides: "12-01: модуль приёма image-intake.ts, профиль answerPhoto"
provides:
  - "Таблица answer_photos (миграция 0031) и Drizzle-объект answerPhotos"
  - "Контракт фото в @bio-exam/exam-core: ANSWER_PHOTO_MAX_COUNT, ANSWER_PHOTO_MAX_BYTES, ANSWER_PHOTO_MAX_SIDE, ANSWER_PHOTO_VARIANTS, ANSWER_PHOTO_LIMIT_MESSAGE, схемы строки фото и ответов PUT/списка/DELETE"
  - "Профиль answerPhoto берёт длинную сторону из ANSWER_PHOTO_MAX_SIDE"
affects: [12-06, 12-07, 12-08, 12-09, 14, 16]

actuals:
  tokens: 4500
  tasks: 2
  commits: "не закоммичено"

tech-stack:
  added: []
  patterns:
    - "Фото ответа: строка на сессию и вопрос, id — UUID клиента без значения по умолчанию"

key-files:
  created:
    - app/server/drizzle/0031_answer_photos.sql
    - app/server/drizzle/meta/0031_snapshot.json
    - packages/exam-core/src/answer-photos.ts
  modified:
    - app/server/src/db/schema.ts
    - app/server/drizzle/meta/_journal.json
    - app/server/drizzle/migrations-manifest.json
    - scripts/check-migrations.mjs
    - packages/exam-core/src/index.ts
    - scripts/check-exam-core-dist.mjs
    - app/server/src/services/assets/image-intake.ts

key-decisions:
  - "Допущение 1 оставлено по умолчанию: UploadWindowRefusalSchema не меняется, поля message нет, текст отказа окна строит web (12-06)"
  - "when миграции 0031 из drizzle-kit (1792149370263) больше 1791292874244, поправка не понадобилась"

requirements-completed: [PHOTO-02, PHOTO-06]

coverage:
  - id: D1
    description: "Миграция 0031 answer_photos: цепочка 0000…0031 с пустой test_* базы сходится со schema.ts"
    requirement: PHOTO-02
    verification:
      - kind: integration
        ref: "node scripts/check-migrations.mjs"
        status: pass
      - kind: integration
        ref: "app/server/src/db/user-deletion-rule.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Контракт фото в exam-core и в dist, лимит 5 — одна константа"
    requirement: PHOTO-06
    verification:
      - kind: other
        ref: "yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-16
status: complete
---

# Phase 12 Plan 03: Таблица answer_photos и контракт фото в exam-core Summary

**Миграция 0031 создаёт `answer_photos` (UUID клиента, сессия и вопрос cascade, попытка set null, `uploaded_at` от базы, RLS `deny_direct_access`); контракт фото (5 штук, 10 МБ, 2560 px, схемы ответов) живёт в `@bio-exam/exam-core`, профиль приёма берёт длинную сторону оттуда**

## Performance

- **Duration:** около 8 мин
- **Started:** 2026-10-16T11:13:00Z
- **Completed:** 2026-10-16T11:21:00Z
- **Tasks:** 2 из 2
- **Files modified:** 10 (3 новых, 7 изменённых)

## Accomplishments

- Предусловие выполнено: последняя запись журнала — `idx 30`, `0030_attempt_upload_window`; в `app/server/drizzle` неотслеживаемых файлов не было.
- `schema.ts`: `answerPhotos` после `testSessions`, именованные внешние ключи, индекс, `denyDirectAccessPolicy()`, `.enableRLS()`; импорта `@bio-exam/exam-core` в схему не добавлено.
- drizzle-kit сгенерировал 0031 без вопросов и без изменений существующих объектов; первой строкой добавлен `SET LOCAL lock_timeout = '5s'`.
- `packages/exam-core/src/answer-photos.ts`, экспорт из `index.ts`, 9 новых рантайм-имён в `EXPECTED_EXPORTS` (по алфавиту).
- `image-intake.ts`: `maxSide: ANSWER_PHOTO_MAX_SIDE` в профиле `answerPhoto`.

## Task Commits

Не закоммичено (коммитит ведущая сессия).

1. **Task 1: таблица answer_photos, миграция 0031** — не закоммичено
2. **Task 2: контракт фото в exam-core** — не закоммичено

## Миграция 0031

`when`: 1792149370263 (из журнала drizzle-kit, больше 1791292874244). sha256 файла: `5e45048a31ddf941225c2bb2a1c6a37bd6faac1e9e6610102769e5d2dbffadad`.

```sql
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "answer_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"attempt_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "answer_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_answer_photos_session_question" ON "answer_photos" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_photos" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
```

Вывод `node scripts/check-migrations.mjs`:

```
ok - manifest
ok - chain-vs-schema
ok - idempotency
ok - generate-no-diff
[check-migrations] generate-no-diff: No schema changes, nothing to migrate 😴
ok - drizzle-check
[check-migrations] drizzle-check: Everything's fine 🐶🔥
check-migrations: OK
```

## Проверки

- `check-migrations: OK` (после Task 1 и шагом `migrations` в `yarn verify`).
- `user-deletion-rule.test.ts`: 9 тестов, зелёные; `LEGACY_EXCEPTIONS` не менялся.
- `yarn workspace @bio-exam/exam-core build && node scripts/check-exam-core-dist.mjs`: «exam-core dist OK … 98 экспортов в ESM и CJS».
- `yarn workspace @bio-exam/exam-core test`: 15 файлов, 745 тестов; typecheck exam-core и сервера чистые.
- `image-intake.test.ts`: 14 тестов, зелёные.
- `yarn verify: OK` с первого прогона (server 2059, web 1649, exam-core 745, rbac 37).
- Критерии приёмки по `grep` прогнаны буквально: первая строка SQL, 3 имени внешних ключей, `on delete set null`, `row level security`, манифест `idx 31` с `when` больше 1791292874244, 4 константы в `index.ts`, `AnswerPhotoUploadResponseSchema` в `EXPECTED_EXPORTS`, `message` в `upload-window.ts` — 0, `ANSWER_PHOTO_MAX_SIDE` в `image-intake.ts`.
- `git status --porcelain -- app/server/drizzle`: изменены только `meta/_journal.json` и `migrations-manifest.json`, новые — `0031_answer_photos.sql` и `meta/0031_snapshot.json`.

`codegraph affected` по `schema.ts`, `answer-photos.ts`, `index.ts` exam-core, `image-intake.ts`: 191 тестовый файл (схема и `index.ts` exam-core импортируются почти всеми тестами сервера и web); все они в наборе `yarn verify`, который прошёл.

## Files Created/Modified

- `app/server/drizzle/0031_answer_photos.sql`, `app/server/drizzle/meta/0031_snapshot.json` — новая миграция и снимок.
- `app/server/drizzle/meta/_journal.json`, `app/server/drizzle/migrations-manifest.json` — запись `idx 31`.
- `app/server/src/db/schema.ts` — `answerPhotos`.
- `scripts/check-migrations.mjs` — в шапке-комментарии «0000-0030» → «0000-0031».
- `packages/exam-core/src/answer-photos.ts` — константы, схемы, типы.
- `packages/exam-core/src/index.ts` — экспорт.
- `scripts/check-exam-core-dist.mjs` — новые имена в `EXPECTED_EXPORTS`.
- `app/server/src/services/assets/image-intake.ts` — `ANSWER_PHOTO_MAX_SIDE`.

## Deviations from Plan

Нет. План выполнен как написан.

## Issues Encountered

Нет.

## Не проверено

- Применение 0031 на проде (выкатка — шаг пользователя, 12-10).

## Next Phase Readiness

- 12-07: таблица `answer_photos` готова; лимит 5 — `ANSWER_PHOTO_MAX_COUNT`, размер файла для multer — `ANSWER_PHOTO_MAX_BYTES`, ответы PUT/списка/DELETE — схемы `AnswerPhotoUploadResponseSchema`, `AnswerPhotoListResponseSchema`, `AnswerPhotoDeleteResponseSchema`; варианты файла — `ANSWER_PHOTO_VARIANTS` (`thumb`, `full`).
- 12-06/12-09: длинная сторона клиента — `ANSWER_PHOTO_MAX_SIDE`, текст шестого фото — `ANSWER_PHOTO_LIMIT_MESSAGE`.
- `attempt_id` заполняет фаза 14, `expires_at` — фаза 16.

## Предлагаемое сообщение коммита

`feat: Таблица answer_photos миграцией 0031 (сессия и вопрос каскадом, попытка set null, время от базы, RLS) и контракт фото ответа в exam-core: 5 фото, 10 МБ, 2560 px, схемы ответов`

---
*Phase: 12-photos-on-session-authentication*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: app/server/drizzle/0031_answer_photos.sql
- FOUND: app/server/drizzle/meta/0031_snapshot.json
- FOUND: packages/exam-core/src/answer-photos.ts
- Коммиты: не закоммичено (по правилу)

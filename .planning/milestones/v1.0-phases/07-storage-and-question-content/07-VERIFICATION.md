---
phase: 07-storage-and-question-content
verified: 2026-10-04T16:21:29Z
status: passed
human_verification_confirmed: "2026-10-05, пользователь"
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/07-storage-and-question-content/07-01-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-01-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-02-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-02-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-03-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-03-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-04-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-04-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-05-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-05-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-06-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-06-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-07-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-07-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-08-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-08-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-09-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-09-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-10-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-10-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-11-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-11-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-12-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-12-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-13-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-13-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-14-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-14-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-15-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-15-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-16-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-16-SUMMARY.md"
  - ".planning/phases/07-storage-and-question-content/07-17-PLAN.md"
  - ".planning/phases/07-storage-and-question-content/07-17-SUMMARY.md"
  - "app/server/.env.example"
  - "app/server/README.md"
  - "app/server/drizzle/0022_attempt_sessions.sql"
  - "app/server/drizzle/0023_attempt_results_version.sql"
  - "app/server/drizzle/0024_question_asset_refs.sql"
  - "app/server/drizzle/meta/0022_snapshot.json"
  - "app/server/drizzle/meta/0023_snapshot.json"
  - "app/server/drizzle/meta/0024_snapshot.json"
  - "app/server/drizzle/meta/_journal.json"
  - "app/server/drizzle/migrations-manifest.json"
  - "app/server/package.json"
  - "app/server/src/app.ts"
  - "app/server/src/db/asset-refs-migration.test.ts"
  - "app/server/src/db/attempt-session-migration.test.ts"
  - "app/server/src/db/schema.ts"
  - "app/server/src/db/session-backfill.test.ts"
  - "app/server/src/lib/errors.ts"
  - "app/server/src/routes/auth/login-throttle.test.ts"
  - "app/server/src/routes/auth/me-requirePerm-parity.test.ts"
  - "app/server/src/routes/auth/me.ts"
  - "app/server/src/routes/docs/assets.characterization.test.ts"
  - "app/server/src/routes/docs/assets.test.ts"
  - "app/server/src/routes/docs/assets.ts"
  - "app/server/src/routes/tests/attempt-access-matrix.test.ts"
  - "app/server/src/routes/tests/attempt-known-defects.test.ts"
  - "app/server/src/routes/tests/attempt-races.test.ts"
  - "app/server/src/routes/tests/attempt-review.test.ts"
  - "app/server/src/routes/tests/attempt-submit.test.ts"
  - "app/server/src/routes/tests/attempt-time-limit.test.ts"
  - "app/server/src/routes/tests/attempt-view-leak.test.ts"
  - "app/server/src/routes/tests/exam-flow.test.ts"
  - "app/server/src/routes/tests/index.ts"
  - "app/server/src/routes/tests/public.ts"
  - "app/server/src/routes/tests/question-content.characterization.test.ts"
  - "app/server/src/routes/tests/question-relocation.characterization.test.ts"
  - "app/server/src/routes/uploads.test.ts"
  - "app/server/src/routes/users/avatar-urls.test.ts"
  - "app/server/src/routes/users/avatar.characterization.test.ts"
  - "app/server/src/routes/users/avatar.ts"
  - "app/server/src/routes/users/directory.test.ts"
  - "app/server/src/routes/users/index.ts"
  - "app/server/src/routes/users/profile.ts"
  - "app/server/src/routes/users/users-list.characterization.test.ts"
  - "app/server/src/scripts/asset-refs.ts"
  - "app/server/src/scripts/backfill-question-search.ts"
  - "app/server/src/scripts/e2e-seed.ts"
  - "app/server/src/scripts/storage-reconcile.ts"
  - "app/server/src/services/access-policy/policy.test.ts"
  - "app/server/src/services/assets/avatars.ts"
  - "app/server/src/services/assets/images.ts"
  - "app/server/src/services/assets/index.ts"
  - "app/server/src/services/attempt-sessions/access.ts"
  - "app/server/src/services/attempt-sessions/index.ts"
  - "app/server/src/services/attempt-sessions/sessions.ts"
  - "app/server/src/services/attempt-sessions/submit.ts"
  - "app/server/src/services/question-content/asset-index.test.ts"
  - "app/server/src/services/question-content/asset-index.ts"
  - "app/server/src/services/question-content/asset-refs.test.ts"
  - "app/server/src/services/question-content/asset-refs.ts"
  - "app/server/src/services/question-content/export.test.ts"
  - "app/server/src/services/question-content/export.ts"
  - "app/server/src/services/question-content/index.ts"
  - "app/server/src/services/question-content/move-remove.test.ts"
  - "app/server/src/services/question-content/move.ts"
  - "app/server/src/services/question-content/order.ts"
  - "app/server/src/services/question-content/paths.ts"
  - "app/server/src/services/question-content/read.test.ts"
  - "app/server/src/services/question-content/read.ts"
  - "app/server/src/services/question-content/reconcile.test.ts"
  - "app/server/src/services/question-content/reconcile.ts"
  - "app/server/src/services/question-content/relocate.test.ts"
  - "app/server/src/services/question-content/relocate.ts"
  - "app/server/src/services/question-content/remove.ts"
  - "app/server/src/services/question-content/write.test.ts"
  - "app/server/src/services/question-content/write.ts"
  - "app/server/src/services/scored-attempt/facts.ts"
  - "app/server/src/services/scored-attempt/index.ts"
  - "app/server/src/services/scored-attempt/legacy-fact.ts"
  - "app/server/src/services/scored-attempt/legacy.test.ts"
  - "app/server/src/services/scored-attempt/legacy.ts"
  - "app/server/src/services/scored-attempt/read.ts"
  - "app/server/src/services/scored-attempt/storable-fact.ts"
  - "app/server/src/services/scored-attempt/view.test.ts"
  - "app/server/src/services/scored-attempt/view.ts"
  - "app/server/src/services/search/question-documents.ts"
  - "app/server/src/services/storage/adapters/local.ts"
  - "app/server/src/services/storage/adapters/memory.ts"
  - "app/server/src/services/storage/adapters/supabase.ts"
  - "app/server/src/services/storage/index.ts"
  - "app/server/src/services/storage/keys.ts"
  - "app/server/src/services/storage/links.test.ts"
  - "app/server/src/services/storage/links.ts"
  - "app/server/src/services/storage/port.ts"
  - "app/server/src/services/storage/storage-known-defects.test.ts"
  - "app/server/src/services/storage/storage-memory-default.test.ts"
  - "app/server/src/services/storage/storage.contract.test.ts"
  - "app/server/src/services/storage/storage.local.test.ts"
  - "app/server/src/services/storage/zip.ts"
  - "app/server/src/test-support/attempt-world.ts"
  - "app/server/src/test-support/auth-app.ts"
  - "app/server/src/test-support/storage.ts"
  - "app/server/src/test-support/supabase-storage-fake.ts"
  - "app/server/src/test-support/zip.ts"
  - "app/server/vitest.config.ts"
  - "app/web/app/(internal)/(protected)/admin/tests/TestsClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/TopicTestsClient.tsx"
  - "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.ts"
  - "app/web/app/(internal)/(protected)/admin/tests/components/test-editor/useTestEditorModel.ts"
  - "app/web/app/(internal)/login/LoginPageClient.tsx"
  - "app/web/components/editor/editor-ui/image-component.tsx"
  - "app/web/components/editor/plugins/images-plugin/MediaLibrary.tsx"
  - "app/web/components/editor/plugins/toolbar/block-insert/insert-media-library.tsx"
  - "app/web/components/nav-user.tsx"
  - "app/web/components/providers/AuthProvider.tsx"
  - "app/web/components/tests/AttemptReview.tsx"
  - "app/web/components/tests/MdxRenderer.tsx"
  - "app/web/components/tests/TestRunner.tsx"
  - "app/web/components/tests/attempt-review/AttemptQuestionsList.test.ts"
  - "app/web/components/tests/attempt-review/AttemptQuestionsList.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewHero.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewNav.tsx"
  - "app/web/components/tests/attempt-review/AttemptReviewSummary.tsx"
  - "app/web/components/tests/attempt-review/QuestionAnswerReview.tsx"
  - "app/web/components/tests/attempt-review/__snapshots__/review-viewers.test.ts.snap"
  - "app/web/components/tests/attempt-review/attempt-review-utils.test.ts"
  - "app/web/components/tests/attempt-review/attempt-review-utils.ts"
  - "app/web/components/tests/attempt-review/review-viewers.test.ts"
  - "app/web/components/tests/attempt-submit-flow.test.ts"
  - "app/web/components/tests/attempt-submit-flow.ts"
  - "app/web/components/tests/client-attempt-id.test.ts"
  - "app/web/components/tests/client-attempt-id.ts"
  - "app/web/components/tests/runner-result-card.test.ts"
  - "app/web/components/tests/runner-result-card.ts"
  - "app/web/lib/assets/delete-error.test.ts"
  - "app/web/lib/assets/delete-error.ts"
  - "app/web/lib/image-signed-url-cache.test.ts"
  - "app/web/lib/image-signed-url-cache.ts"
  - "app/web/lib/session/redirect.test.ts"
  - "app/web/lib/session/redirect.ts"
  - "app/web/lib/session/route-permissions.test.ts"
  - "app/web/lib/tests/api.ts"
  - "app/web/lib/tests/types.ts"
  - "app/web/next.config.ts"
  - "e2e/fixtures/exam.ts"
  - "e2e/fixtures/seed.json"
  - "e2e/tests/assets.spec.ts"
  - "e2e/tests/auth.spec.ts"
  - "e2e/tests/review.spec.ts"
  - "packages/exam-core/src/attempt-result.test.ts"
  - "packages/exam-core/src/attempt-result.ts"
  - "packages/exam-core/src/index.ts"
  - "packages/exam-core/src/scoring.test.ts"
  - "packages/exam-core/src/scoring.ts"
  - "packages/rbac/src/index.test.ts"
  - "packages/rbac/src/roles.ts"
  - "scripts/attempt-integrity-guards.test.mjs"
  - "scripts/check-exam-core-dist.mjs"
  - "scripts/check-migrations.mjs"
  - "scripts/exam-core-no-private-copies.test.mjs"
  - "scripts/storage-no-private-access.test.mjs"
covered_digest: "v2:sha256:26fdb91318ef4e780b06e182f808ea25b3d0670a947e8c6f99851a8ea943054c"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "CR-12: total в GET /api/users против построчного canReadUser"
    addressed_in: "Phase 07.1"
    evidence: "07-REVIEW-DISPOSITION «Отложено»; SC5 07.1: доступ решает scope.ts по правам и строкам БД"
  - truth: "NQ-04: отдельное право на withAnswers в экспорте"
    addressed_in: "Phase 07.1"
    evidence: "07-REVIEW-DISPOSITION «Отложено»; SC1/SC2 07.1 (зона ответственности учителя)"
  - truth: "Латентные части CR-04 и SEC-03 при объектном scope"
    addressed_in: "Phase 07.1"
    evidence: "07-REVIEW-DISPOSITION «Отложено»"
  - truth: "SEC-05: потоковый ZIP, обрыв сборки по сумме размеров"
    addressed_in: "Phase 8"
    evidence: "07-REVIEW-DISPOSITION «Отложено»; PERF-04 (streaming) в ROADMAP фазы 8"
human_verification:
  - test: "Runbook D-27 шаг 1: read-only SQL на проде (префиксы бакета, SELECT id, public FROM storage.buckets, устаревшие указатели и дыры в порядке, формы аватаров, rbac_role_grants и rbac_user_grants, владельцы tests.*/groups.manage_groups без users.read, история мигратора)"
    expected: "Префиксы только images/topics/avatars; верхняя запись мигратора 0023; переопределения прав не возвращают users.read роли user, либо решение пользователя принято"
    why_human: "Нужен доступ к прод-БД и Supabase; агентам доступа нет"
  - test: "Добавить в шаг 1 runbook проверки из REVIEW-DISPOSITION: SELECT name FROM storage.objects WHERE bucket_id='main' AND name !~ '^[A-Za-z0-9._/-]+$' и поиск символа % в questions.prompt_path, questions.explanation_path, users.avatar, users.avatar_cropped и в отчёте assets:refs"
    expected: "Ключей с % и с символами вне алфавита нет, либо принято решение до выкатки (SEC-01 отклоняет %2F, %5C, ?, #)"
    why_human: "Прод-данные; REVIEW-FIX прямо указывает, что SQL в runbook не добавлен"
  - test: "STOP D-19: yarn workspace @bio-exam/server assets:refs без флага против прода после миграции 0024 и до merge"
    expected: "Нет строки «[asset-refs] STOP D-19: …», nonServable пуст; иначе решение пользователя до деплоя"
    why_human: "Прод-данные; legacy-путь вне нормализованного пространства — STOP ASSET-02 по требованию"
  - test: "Миграция 0024 на проде, затем assets:refs --write (бэкфилл) после активации server и web, затем storage:reconcile без флагов (и --delete-legacy-json при публичном бакете)"
    expected: "Мигратор показывает 0024; после бэкфилла удаление в медиатеке перестаёт отвечать «ссылки ещё не проиндексированы»; отчёт сверки без неожиданных сирот"
    why_human: "Запись в прод-БД и прод-бакет; только пользователь"
  - test: "Перевод бакета main в приватный — строго после выкатки кода (решение пользователя 2026-10-04)"
    expected: "Картинки и аватары открываются через /api/docs/assets/proxy у вошедших; прямой /storage/v1/object/public отвечает отказом"
    why_human: "Настройка Supabase, шаг пользователя при выкатке"
  - test: "Исправить формулировку runbook D-27 шаг 5: «/api/auth/me отдаёт публичный URL Supabase» устарело после решения о приватном бакете"
    expected: "Ожидание в runbook: /api/auth/me отдаёт /api/docs/assets/proxy?path=avatars/<userId>/…"
    why_human: "Иначе при проверке на preview будет искаться публичный URL, которого код больше не выдаёт"
  - test: "Preview: загрузка картинки в редакторе и показ в тесте; отказ удаления используемой картинки в диалоге; переименование slug тестовой темы с файлами и замер времени крупнейшей темы; ZIP теста с картинками и missing-files.txt; аватар (загрузка, кроп, удаление); 403 на /api/users для user и минимальные поля /directory; 503 при недоступном Supabase"
    expected: "Как в runbook D-27 шаг 5"
    why_human: "Живой деплой и живой Supabase; e2e идёт только на local-адаптере"
  - test: "Живой адаптер Supabase (критерий 1 на живом бакете)"
    expected: "Чтение, запись, копирование, листинг > 100 объектов и удаление на preview работают как на подделке клиента"
    why_human: "Контрактный набор в yarn verify идёт на supabase-fake; изоляция тестов запрещает живой Supabase"
  - test: "ZIP самой крупной темы с картинками"
    expected: "Архив до 4 400 000 байт скачивается целым; больше — тост «Архив слишком большой…» (413), не обрезанный файл"
    why_human: "Размер зависит от прод-контента; лимит ответа функции Vercel"
  - test: "Вёрстка медиатеки и диалога удаления на 375px"
    expected: "Текст отказа виден, кнопки «Удалить» нет, «Отмена» закрывает; нет горизонтальной прокрутки"
    why_human: "Визуальная проверка"
  - test: "Подтвердить judgment-запреты планов (вердикт верификатора не авторитетный): 07-06 /signed не делает исходящих запросов; 07-08 значения users.avatar не переписываются; 07-09 web не заменяет проверку прав сервера; 07-09 без редизайна медиатеки; 07-11 минимальный DTO не расширен; 07-17 код приложения в плане e2e не менялся"
    expected: "Пользователь подтверждает или отклоняет каждый"
    why_human: "Запреты уровня judgment требуют человеческого решения"
---

# Фаза 7: Storage and question content — отчёт верификации

**Цель фазы:** файлы идут через один модуль хранилища с двумя адаптерами; вопрос создаётся, правится, переносится и удаляется одним модулем; медиатека и справочник пользователей больше не раскрывают и не уничтожают то, что не должны.
**Проверено:** 2026-10-04T16:21:29Z, ветка `dev`, HEAD 0d633ed (коммиты `93de4ad..0d633ed` без слияний и d80e2bf)
**Статус:** human_needed
**Повторная верификация:** нет, первичная

## Достижение цели

### Наблюдаемые истины (критерии успеха ROADMAP)

| # | Критерий | Статус | Доказательство |
|---|---|---|---|
| 1 | Один контрактный набор проходит на Supabase и local; `../`, кодированный traversal, абсолютные пути и чужие префиксы не читают, не пишут и не удаляют вне корня; маршруты не трогают `fs` и не строят путь хранилища | ✓ VERIFIED | `storage.contract.test.ts`: `describe.each` по `local`, `supabase-fake`, `memory`; блок «hostile keys never reach the adapter» проверяет write/read/exists/remove/copy/list/listPage, ноль вызовов адаптера и неизменный снимок каталога. `keys.ts`: до 3 ступеней декодирования, запрет `..`, `/`, `\`, буквы диска, управляющих символов, `?`, `#`, `%2F`, `%5C`, пространства только `images/topics/avatars`. `storage.local.test.ts`: symlink наружу, ловушка общего префикса. В `routes/**` (без тестов) нет `fs`, `process.cwd`, `path.join`, литералов `topics/`, `images/`, `avatars/`. Охранный тест `scripts/storage-no-private-access.test.mjs` — 8/8 pass. Живой Supabase — human_needed |
| 2 | Смена slug вопроса или темы переносит файлы; сбой записи не оставляет полусостояния; порядок без дыр после переноса и удаления; правка вопроса не удаляет старый промпт до записи нового (D6) | ✓ VERIFIED | `write.ts` `updateQuestion`: `writeContentFiles` с новой ревизией → транзакция с указателями → `removeObjects(stale)` после commit; при сбое компенсация удаляет только свои ключи. `order.ts` `resequenceQuestions` — один механизм 0…n-1. Тесты зелёные: `STOR-D6a`, `STOR-D6b` (KNOWN_DEFECTS пуст), `STOR-rename-topic-files`, «смена slug темы переносит файлы всех тестов темы», «сбой копирования при смене slug темы: 503, slug темы прежний», «строка удалена, порядок без дыр», «в существующий тест: … источник без дыр», регрессии CR-01 (параллельные переименования не удаляют живые объекты) |
| 3 | Web получает готовые URL от API; ZIP теста включает картинки его вопросов; медиатека отказывает в удалении используемой картинки | ✓ VERIFIED | В `app/web` нет `storage/v1`, `getStoragePathFromSupabaseUrl`, `isStoragePath`, импортов `@supabase`; `lib/image-signed-url-cache.ts` берёт URL у `/api/docs/assets/signed`. `export.ts` собирает ZIP из БД и хранилища, картинки через `extractAssetRefs` + `isServableImageKey` без аватаров, `missing-files.txt`, без записей в хранилище. `images.ts` `deleteImage`: `pg_advisory_xact_lock` по ключу, `assetUsage`, 409 `AssetInUseError`; при неполном индексе 409. Тесты «картинка из промпта вопроса: 409 с usage», «…в пояснении, в двух вопросах и в черновике: 409», `export.test.ts` — зелёные |
| 4 | Загружать и удалять ассеты могут только владельцы права на управление контентом; устаревшие пути картинок открываются | ✓ VERIFIED | `routes/docs/assets.ts`: GET/POST/DELETE под `requirePerm('tests','write')`; `POST /api/tests/:id/assets` под `canWriteTest`. Имена `images/<32 hex>.webp` генерирует `uploadImage`. Матрица прав в `assets.test.ts` (user, user+allow, admin, admin+deny). Блок `LEGACY` в `assets.test.ts`: «устаревшая ссылка … открывается через proxy». STOP по прод-ссылкам вне пространств — human_needed |
| 5 | Справочник для обычного пользователя отдаёт только минимальные поля и не даёт `users.read`; админские экраны сохраняют полные данные через админское право | ✓ VERIFIED | `packages/rbac/src/roles.ts`: `user.grants = {}` (было `{ users: ['read'] }`). `GET /api/users/directory`: только сессия, `q` от 2 символов, лимит 1…20, ровно 7 полей (`id, name, firstName, lastName, initials, avatarColor, avatarCropped`). `GET /api/users` под `users.read` + построчный `canReadUser`. `directory.test.ts` (матрица D-22, сравнение множества ключей) — зелёный. Переопределения прав в `rbac_role_grants` на проде — read-only SQL в runbook, human_needed |

**Счёт:** 5/5 критериев (0 present-but-behavior-unverified). Все поведенческие инварианты (D6, откат переименования, порядок без дыр, 409 на используемую картинку, отказ hostile-ключам) подтверждены именованными зелёными тестами.

### Отложенные пункты

Решены пользователем в `07-REVIEW-DISPOSITION.md` и не считаются gaps.

| # | Пункт | Где | Доказательство |
|---|---|---|---|
| 1 | CR-12: `total` против построчного `canReadUser` | Phase 07.1 | disposition «Отложено»; SC5 07.1 |
| 2 | NQ-04: отдельное право на `withAnswers` в экспорте | Phase 07.1 | disposition «Отложено» |
| 3 | Латентные части CR-04 и SEC-03 при объектном scope | Phase 07.1 | disposition «Отложено» |
| 4 | SEC-05: потоковый ZIP | Phase 8 | disposition «Отложено»; PERF-04 |

### Решения пользователя, принятые как данность

- Бакет `main` становится приватным; `storageUrl` всегда отдаёт `/api/docs/assets/proxy?path=…`, ветки `getPublicUrl` и `cacheNonce` нет (проверено в `services/storage/index.ts`). Переключение бакета — шаг пользователя после выкатки.
- Право управления контентом для медиатеки — `tests.write` (D-14).
- `POST /api/tests/:id/assets` не удаляется (решение пользователя, запрет плана 07-14), маршрут переведён на `uploadImage`.
- Все вызывающие `/api/users` в web — экраны администратора на полном DTO; студенческого вызывающего нет, минимальный DTO не расширялся (D-20, PRIV-02 «reported by caller»).

### Необходимые артефакты

| Артефакт | Назначение | Статус | Детали |
|---|---|---|---|
| `app/server/src/services/storage/{port,index,keys,links,zip}.ts` | Порт, фасад, ключи, правило ключ→URL, ZIP | ✓ VERIFIED | Выбор адаптера без тихого fallback (`StorageConfigError`); `storage.ts` старой оболочки удалён |
| `app/server/src/services/storage/adapters/{supabase,local,memory}.ts` | Три адаптера | ✓ VERIFIED | Подключены через `selectAdapter()` |
| `app/server/src/services/question-content/*` | Жизненный цикл вопроса | ✓ VERIFIED | write/read/move/relocate/remove/order/export/asset-index/reconcile; используется маршрутами `routes/tests/index.ts` и `public.ts` |
| `app/server/src/services/assets/{images,avatars}.ts` | Медиатека и аватары | ✓ VERIFIED | Подключены в `routes/docs/assets.ts`, `routes/users/avatar.ts`, `routes/tests/index.ts` |
| `app/server/drizzle/0024_question_asset_refs.sql` | Индекс ссылок на картинки | ✓ VERIFIED | Только DDL, аддитивна, RLS + deny policy |
| `app/server/src/scripts/{asset-refs,storage-reconcile}.ts` | Инвентаризация и сверка | ✓ VERIFIED | Скрипты `assets:refs`, `storage:reconcile` в `app/server/package.json` |
| `scripts/storage-no-private-access.test.mjs` | Охрана репозитория | ✓ VERIFIED | 8/8 pass |
| `e2e/tests/assets.spec.ts` | e2e медиатеки и справочника | ✓ VERIFIED (существует) | Не запускался мной: `yarn e2e` идёт параллельно |

### Проверка связей

| Откуда | Куда | Через | Статус |
|---|---|---|---|
| `routes/tests/index.ts` (`/save`, `PATCH /:id/settings`, POST/PATCH/DELETE/move/reorder вопроса, `DELETE /:id`, PATCH/DELETE темы, экспорт) | `services/question-content` | `createTestWithQuestions`, `updateTestSettings`, `createQuestion`, `updateQuestion`, `reorderQuestions`, `moveQuestion`, `deleteQuestion`, `deleteTest`, `updateTopic`, `deleteTopic`, `buildTestArchive`, `buildTopicArchive` | WIRED |
| `GET /:id`, `GET /by-slug/...` | `readAdminTest` | один блок чтения (QCON-05) с `canReadTest`/`testScope` | WIRED |
| `routes/tests/public.ts` | `question-content` | `questionMarkdownCandidates`, `readFirstMarkdown` | WIRED |
| `routes/docs/assets.ts` | `services/assets/images.ts` → `storage()` | `uploadImage`, `listImages`, `deleteImage`, `readServableImage`, `resolveImageUrl` | WIRED |
| `routes/auth/me.ts`, `routes/users/*` | `storage/links.ts` | `avatarUrl`, `storedAvatarValue` | WIRED |
| `write.ts`/`indexQuestionAssets` | `question_asset_refs` | в транзакции записи, блокировка ключа | WIRED |
| web `image-signed-url-cache.ts` | `/api/docs/assets/signed` | fetch | WIRED |

### Поток данных (уровень 4)

| Артефакт | Данные | Источник | Реальные данные | Статус |
|---|---|---|---|---|
| ZIP экспорта | промпты, картинки | `questions` + `storage().read` | да | ✓ FLOWING |
| `/directory` | 7 полей | `users` (ILIKE с экранированием) | да | ✓ FLOWING |
| 409 медиатеки | `usage` | `question_asset_refs` + черновики | да | ✓ FLOWING |

### Точечные поведенческие проверки

Тесты запускались через `node scripts/with-test-db.mjs` на одноразовой `test_*` базе, без `DATABASE_URL` из `.env`.

| Поведение | Команда | Результат | Статус |
|---|---|---|---|
| Контракт хранилища, характеризация вопросов/переноса/медиатеки/аватара/списка, справочник | `vitest run storage.contract … directory.test.ts` (7 файлов) | 7 files, 193 passed | ✓ PASS |
| Модуль question-content, маршрут медиатеки, URL аватаров, ключи, local-адаптер | `vitest run src/services/question-content routes/docs/assets.test.ts … storage.local.test.ts` (13 файлов) | 13 files, 368 passed | ✓ PASS |
| Охрана репозитория | `node --test scripts/storage-no-private-access.test.mjs` | 8 passed | ✓ PASS |
| `yarn verify`, `yarn e2e` | не запускались (идут параллельно в основном дереве) | REVIEW-FIX: verify OK, e2e 138 passed в worktree | ? SKIP |

### Запреты планов (prohibitions)

Test-tier, у каждого есть исполнение:

| План | Запрет | Доказательство |
|---|---|---|
| 07-01 | Модуль не импортирует `config/env.js`, нет клиента Supabase в изоляции | `storage.local.test.ts` «…never creates a client», «refuses STORAGE_DRIVER=supabase» |
| 07-01 | Маршруты не меняются, новых env-ключей нет | d80e2bf не трогает `routes/`; в `.env.example` изменены только комментарии |
| 07-02 | Живой Supabase в тестах не вызывается | контракт на `supabase-fake`; изоляция запрещает драйвер supabase |
| 07-03/04/05 | Код приложения не меняется | 53072dd, 73f1033, 1effce4 — только тестовые файлы |
| 07-06 | Новых ключей прав нет; `/proxy`, `/signed` без `tests.write` | `packages/rbac` меняет только `roles.ts`; тесты «user получает …» |
| 07-07 | Маршруты и порядок регистрации не меняются | охранный тест `SCOPED_ROUTES`; характеризация через `app.ts` зелёная |
| 07-08 | Удалить можно только свой аватар | `DELETE /` в `avatar.ts` без параметра пользователя, userId из сессии |
| 07-10 | Нет уникальности `(test_id, order)`, нет миграций | 35529b6 без `drizzle/`; в `schema.ts` нет такого ограничения |
| 07-10 | Формы ответов `/save`, POST, PATCH не меняются | обработчики отдают `201 {test}`, `201 {ok,questionId,order}`, `200 {ok,questionId}` |
| 07-11 | Новых прав нет; `database-search.ts` не меняется | diff `93de4ad..0d633ed` не трогает `database-search.ts` |
| 07-12 | `moveDirectory` не используется | нет вхождений в `app/server/src` |
| 07-13 | Удаление не трогает `images/` и `topics/*/*/assets/` | тесты «…assets и images на месте» |
| 07-14 | Экспорт не пишет в хранилище; `POST /:id/assets` остаётся | в `export.ts` нет `write`; маршрут на месте |
| 07-15 | Применённые миграции не меняются; `assets:refs` без `--write` не пишет | шаг `migrations` с манифестом в verify; `asset-index.test.ts:329` «инвентаризация … ничего не пишет»; `scripts/asset-refs.ts` вызывает `backfillAssetRefs` только с `--write` |
| 07-16 | Сверка без флагов ничего не пишет | `reconcile.test.ts` |

Judgment-tier (вердикт верификатора не авторитетный, флаг «unverified-prohibition — human review recommended»): 07-06 `/signed` без исходящих запросов (в `links.ts`, `images.ts`, `assets.ts` нет `fetch`); 07-08 аватары не переписываются (0024 не трогает `users`, скрипта нет); 07-09 web не заменяет проверку прав; 07-09 без редизайна; 07-11 DTO из 7 полей; 07-17 e2e-коммит 0ec64ce трогает только `e2e/`. Все выглядят соблюдёнными; вынесены на подтверждение человеку.

### Покрытие требований

| Требование | План | Статус | Доказательство |
|---|---|---|---|
| STOR-01 | 07-01, 07-16 | ✓ SATISFIED | порт + 3 адаптера; маршруты без `fs` (охранный тест) |
| STOR-02 | 07-01 | ✓ SATISFIED | `keys.ts`, symlink-тесты, `StorageConfigError` вместо тихого `''`, единые ошибки порта |
| STOR-03 | 07-02 | ✓ SATISFIED | `storage.contract.test.ts` на трёх адаптерах + hostile keys |
| STOR-04 | 07-06, 07-09 | ✓ SATISFIED | web без разбора URL Supabase; охранный тест |
| STOR-05 | 07-14, 07-15 | ✓ SATISFIED | ZIP с картинками; 409 на используемую картинку |
| QCON-01 | 07-07, 07-10, 07-12, 07-13 | ✓ SATISFIED | обработчики делегируют модулю |
| QCON-02 | 07-10, 07-12 | ✓ SATISFIED | перенос slug темы и теста, компенсация, тесты на БД с in-memory адаптером |
| QCON-03 | 07-10, 07-13 | ✓ SATISFIED | `resequenceQuestions` |
| QCON-04 | 07-10 | ✓ SATISFIED | `STOR-D6a`, `STOR-D6b` зелёные |
| QCON-05 | 07-07, 07-10, 07-14 | ✓ SATISFIED | один `readAdminTest`; `settings.json` не пишется; экспорт без записи `answer_keys.json` |
| ASSET-01 | 07-06 | ✓ SATISFIED | `tests.write`, `images/<hex>.webp` |
| ASSET-02 | 07-06, 07-15 | ✓ SATISFIED (STOP — human) | traversal, матрица прав, legacy-тесты; STOP по прод-ссылкам — шаг пользователя |
| PRIV-01 | 07-11 | ✓ SATISFIED | `/directory` 7 полей; `user` без `users.read` |
| PRIV-02 | 07-11 | ✓ SATISFIED | админские экраны на полном DTO, вызывающие перечислены в 07-11-SUMMARY |
| PRIV-03 | 07-11 | ✓ SATISFIED | `directory.test.ts`, матрица D-22 |

Сиротских требований нет: REQUIREMENTS.md относит к фазе 7 ровно эти 15 ID.

### Найденные антипаттерны

| Файл | Строка | Шаблон | Уровень | Влияние |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX` | — | Нет ни одного в 162 файлах фазы |
| `app/web/components/editor/editor-ui/image-component.tsx` | 344 | `TODO` | ℹ️ Info | Добавлен 2026-02-06 (1853492d), вне фазы |
| `app/web/package.json` | 68 | `@supabase/supabase-js` без импортов в web | ℹ️ Info | STOR-04 не нарушает; лишняя зависимость |
| `07-16-SUMMARY.md` (runbook D-27, шаг 5) | — | ожидание «/api/auth/me отдаёт публичный URL Supabase» | ⚠️ Warning | Устарело после решения о приватном бакете; вынесено в human_needed |
| runbook D-27, шаг 1 | — | нет SQL-проверок `%` и строгого алфавита ключей из disposition | ⚠️ Warning | REVIEW-FIX: не добавлено; вынесено в human_needed |
| web `GroupSheet.tsx`, `useTestEditorModel.ts` | — | молчаливый пустой список при 403 от `/api/users` у не-админа с `tests.*` | ⚠️ Warning | Записано в 07-11 как решение пользователя по итогам read-only SQL |
| `routes/auth/login-throttle.test.ts` | — | нестабилен под нагрузкой | ℹ️ Info | `deferred-items.md`, вне фазы 7 |

### Требуется проверка человеком

1. **Runbook D-27, шаг 1 — read-only SQL на проде.** Префиксы бакета, `SELECT id, public FROM storage.buckets`, указатели и дыры в порядке, формы аватаров, `rbac_role_grants`/`rbac_user_grants`, владельцы `tests.*` без `users.read`, история мигратора. Ожидается: префиксы только `images/topics/avatars`, мигратор на 0023, переопределения не возвращают `users.read` роли `user`.
2. **Дополнить шаг 1 runbook SQL из disposition** и проверить символ `%` в `questions.prompt_path`, `questions.explanation_path`, `users.avatar`, `users.avatar_cropped` и в отчёте `assets:refs`; `SELECT name FROM storage.objects WHERE bucket_id='main' AND name !~ '^[A-Za-z0-9._/-]+$'`.
3. **STOP D-19:** `assets:refs` без флага против прода после 0024 и до merge. Строка `STOP D-19` или непустой `nonServable` — решение пользователя до деплоя.
4. **Миграция 0024, `assets:refs --write`, `storage:reconcile`** на проде по порядку runbook.
5. **Перевод бакета `main` в приватный** — только после выкатки кода.
6. **Исправить шаг 5 runbook:** аватар в `/api/auth/me` — URL proxy, не публичный URL Supabase.
7. **Preview:** загрузка и показ картинки, отказ удаления используемой, переименование крупной темы с замером времени, ZIP теста, аватар, 403 на `/api/users` и `/directory`, 503 при недоступном Supabase.
8. **Живой адаптер Supabase** на preview (в `yarn verify` контракт идёт на подделке клиента).
9. **ZIP самой крупной темы:** целый архив или 413 с тостом.
10. **375px:** медиатека и диалог отказа удаления.
11. **Judgment-запреты планов 07-06, 07-08, 07-09, 07-11, 07-17** — подтвердить.

### Итог по пробелам

Пробелов, блокирующих цель, нет. Код фазы и правки ревью (CR-01…CR-11, CR-14, SEC-01…SEC-04, SEC-07, NQ-01, NQ-02, NQ-05…NQ-07) на месте и покрыты зелёными тестами; 561 именованный тест прогнан на `test_*`. Статус `human_needed` из-за шагов выкатки на проде, preview и визуальных проверок, которые агент выполнить не может. Два предупреждения касаются текста runbook D-27 (устаревшее ожидание публичного URL аватара и не добавленные SQL-проверки ключей) и закрываются вместе с шагами выкатки.

---

_Проверено: 2026-10-04T16:21:29Z_
_Верификатор: Claude (gsd-verifier)_

## Закрытие

2026-10-05. Код фазы работает на проде (`bio-exam.ru`, свой сервер, ветка `master`). Пункты раздела «Человеческая проверка» пользователь подтвердил как выполненные; пункты про preview Vercel заменены работой на своём сервере.

`covered_digest` пересчитан на `dev` 41f580a (файлы фазы менялись следующими фазами). Верификатор заново не запускался: на этом коде проходят `yarn verify` и e2e.

`covered_digest` пересчитан на `dev` 1962edd после тестов покрытия, уборки web-тестов и удаления мёртвого кода (b720f21, 3513919, 65f04e5).

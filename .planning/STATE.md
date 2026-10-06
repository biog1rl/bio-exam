---
gsd_state_version: "1.0"
milestone: v3.0
milestone_name: Открытые задания с фото и ручной проверкой
current_phase: 11
current_phase_name: Deadline finalisation, upload window and background jobs
status: executing
stopped_at: Completed 11-08-PLAN.md
last_updated: "2026-10-06T14:23:49.784Z"
last_activity: 2026-10-06
last_activity_desc: Phase 11 execution started
state_head: ea87e8750da8d0ab5c1d6412e9eecf77580edc67
progress:
  total_phases: 11
  completed_phases: 2
  total_plans: 46
  completed_plans: 39
  percent: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-06)

**Core value:** A student's timed test attempt is scored correctly, exactly once, and stays reviewable exactly as it was scored.
**Current focus:** Phase 11 — Deadline finalisation, upload window and background jobs

## Current Position

Phase: 11 (Deadline finalisation, upload window and background jobs) — EXECUTING
Plan: 12 of 18
Status: Ready to execute
Last activity: 2026-10-06 — Phase 11 execution started

Progress: [██░░░░░░░░] 18%

## Performance Metrics

**Velocity:**
- Total plans completed: 170
- Average duration: n/a
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 16 | - | - |
| 4 | 14 | - | - |
| 2 | 9 | - | - |
| 3 | 13 | - | - |
| 5 | 11 | - | - |
| 6 | 11 | - | - |
| 7 | 17 | - | - |
| 07.1 | 21 | - | - |
| 8 | 30 | - | - |
| 9 | 19 | - | - |
| 10 | 9 | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: n/a

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 1 P01 | 8min | 2 tasks | 10 files |
| Phase 1 P02 | 6min | 2 tasks | 5 files |
| Phase 1 P03 | 8min | 3 tasks | 11 files |
| Phase 1 P04 | 6min | 2 tasks | 10 files |
| Phase 1 P05 | 10min | 3 tasks | 5 files |
| Phase 1 P07 | 9min | 2 tasks | 2 files |
| Phase 1 P16 | 3min | 2 tasks | 2 files |
| Phase 1 P06 | 10min | 3 tasks | 12 files |
| Phase 1 P08 | 9min | 3 tasks | 4 files |
| Phase 1 P09 | 16min | 3 tasks | 12 files |
| Phase 1 P10 | 4min | 2 tasks | 5 files |
| Phase 1 P12 | 12min | 3 tasks | 1 files |
| Phase 1 P11 | 15min | 2 tasks | 4 files |
| Phase 1 P13 | 11min | 3 tasks | 11 files |
| Phase 1 P14 | 8min | 3 tasks | 220 files |
| Phase 1 P15 | 6min | 3 tasks | 4 files |
| Phase 02 P04 | n/a | 2 tasks | 0 files |
| Phase 02 P01 | 6min | 2 tasks | 1 files |
| Phase 11 P01 | 4min | 3 tasks | 9 files |
| Phase 11 P02 | 3min | 2 tasks | 2 files |
| Phase 11 P03 | 11min | 3 tasks | 19 files |
| Phase 11 P05 | 4min | 2 tasks | 3 files |
| Phase 11 P11 | 14min | 3 tasks | 7 files |
| Phase 11 P04 | 17min | 3 tasks | 8 files |
| Phase 11 P10 | 18min | 3 tasks | 11 files |
| Phase 11 P12 | 20min | 3 tasks | 12 files |
| Phase 11 P06 | 13min | 3 tasks | 6 files |
| Phase 11 P07 | 7min | 3 tasks | 5 files |
| Phase 11 P08 | 13min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Locked ADR decisions D-01...D-05 and resolved sequencing decisions D-06...D-14 are in the `<decisions>` block of PROJECT.md. Recent ones affecting the start:

- [v3.0 roadmap, 2026-10-06]: 11 phases (9–19) in the research order (`research/SUMMARY.md`), kept despite `granularity: standard` because of hard dependencies; 9 and 10 can run in parallel, 16 and 18 in parallel, 11 before 12 is fixed, readers (9) strictly before attempts "на проверке" exist (14). The `open` type is seeded `is_active = false` and enabled only in Phase 17, so criteria of Phases 9–16 are verified in tests, seeds and dev/e2e.
- [v3.0 roadmap]: Tech debt that touches a new module goes into that module's phase: RES-05 (SEC-04/N3) and `DashboardClient` → 9; PLAT-03/PLAT-04 (SEC-02) and CR-03/CR-05 → 11; DEBT-01 and DEBT-07 → 12; DEBT-02 (404 image, one toaster) → 13; the rest → 18. A composite requirement maps to the phase where its last piece lands (DEBT-02 → 13, DEBT-08 → 18, NOTIF-03 → 15, RET-04 → 16); the "test assigned" journal producer is built in Phase 10.
- [v3.0 roadmap]: `/gsd-plan-phase N --research-phase` for Phases 11, 12, 13, 15 and 19; Phases 9, 10, 14, 16, 18 use standard patterns. Phase 19 must not start before 2026-10-12. PLAT-05 (no cascade from `users` for new tables) is decided once in Phase 9's first plan.
- [v3.0, user decisions 2026-10-06]: an open answer still empty at the window end gets an automatic 0 "нет ответа" and does not enter the queue; no return for correction after the final result (re-grade only); the reference answer and criteria are shown to the student after the attempt's final result; backup policy unchanged, wording "на сайте год, в зашифрованных резервных копиях до 12 месяцев после удаления"; no deadline for a correction round; open question maximum is always 3 points.
- [Phase 9, done 2026-10-06]: projection on `test_attempts` + facts trigger (0026), one writer `materializeAttemptOutcome`, readers via `attemptResultColumns`/`attemptResultSql`; answer shape/size checked by adapter `answerSchema` (`answer_shape_invalid`); new answer shapes (photos) must extend the `open` adapter schema and limits. Release of 0026 is a user step: one batch to master, manual `deploy.sh`, no image-only rollback (rule in the server profile). Phase 10 takes migration 0027.
- [Phase 10, done 2026-10-06]: journal 0027, producers `test.assigned` in `addAssignments` and `recordTestPublished` (D-18: no event for drafts, event on publication), `/api/notifications` + `open` with `checkAttemptAccess`; D-09 confirmed by the user (leaving a group keeps access). Migrations 0028–0029 come from the UX branch on top of 0027.
- [Phase 1, done]: `yarn verify` (8 steps) is the gate for every later phase; it starts its own PostgreSQL 17. `yarn e2e` is separate and pins D1, D2, D5 with `test.fail()`. CI is information-only.
- [Phase 1, done]: Database work only through `TEST_DATABASE_URL` (localhost/127.0.0.1, `test_*`) with `BIO_EXAM_ISOLATED_ENV=1`; `app/server/drizzle/migrations-manifest.json` pins sha256, `when` and `breakpoints` of 0000–0020.
- [Phase 4]: Next auth/DB duplicate (`getMeData`, `/api/auth/me` route, `pg` pool) is deleted in this phase.
- [Phase 5]: The scored-attempt module (C2) ships with plan 004; old attempts need a separate migration.
- [Phase 6]: Plan 005 runs through the client lifecycle module (C7); plan 010 step 3 is dropped.
- Agents never commit; the orchestrator's ingest `finalize` commit step must not run.
- [Phase 02]: 02-04: пользователь одобрил таблицу версий (next/@next/mdx 16.3.8, sharp 0.35.5, multer 2.4.0, express 4.22.3, next-mdx-remote 6.0.0, lodash 4.18.1, postcss 8.5.28), удаления D-06 и транзитивы yarn up -R без замен
- [Phase 02]: 02-01: разметка test.fails в untrusted.test.ts задана константой KNOWN_HOLES (пейлоады 1, 2, 5, 6, 7); 02-08 переключает ровно её
- [Phase 02]: 02-01: ESM-пейлоады 3 и 4 зелёные уже на next-mdx-remote 5 (removeImportsExportsPlugin) и не входят в доказательство «красный на 5, зелёный на 6»
- [Phase 02]: 02-02: загрузки закреплены тестами через настоящий app.ts на test_* и storageService-подделку (isConfigured true -> memoryStorage); на multer 2.0.2 отказы multer дают 500 с текстом, name="" даёт 'Field name missing', обрыв не доходит до errorHandler
- [Phase 02]: 02-03: proxy.ts на Next 16.2.1 обходов не имеет; матрица @proxy (34 теста) без test.fail, /dashboard/ и //dashboard дают 308 на /dashboard, затем 307 на /login
- [Phase 02]: 02-05: Группа 1 применена без коммита; транзитивы вне таблицы 02-04 без install-хуков (brace-expansion 5.0.12, balanced-match 4.0.4, body-parser/qs/side-channel, browserslist-цепочка) приняты по D-03; tiptap-extension-auto-joiner остаётся (вне D-06), решение за 02-09
- [Phase 02]: Транзитивы, которые тянут одобренные пакеты, принимаются без checkpoint при отсутствии lifecycle-скриптов и пишутся в дельту SUMMARY; стоп только на install-скрипте или прямой версии ≠ одобренной (решение пользователя после 02-05)
- [Phase 02]: 02-06: next и @next/mdx подняты до 16.3.8 без правок next.config.ts и proxy.ts; матрица @proxy на 16.3.8 с теми же статусами, что на 16.2.1
- [Phase 02]: 02-06: postcss 8.5.6 у @tailwindcss/postcss снят через yarn up -R postcss; next держит точный postcss 8.5.23
- [Phase 02]: 02-06: до 02-07 в дереве две версии sharp: 0.35.5 у next и 0.34.5 у сервера
- [Phase 02]: Автономный режим (пользователь недоступен): шаги только для человека (коммит, push, preview Vercel, CI на HEAD) в 02-07 Task 2, 02-08 Task 3, 02-09 Task 3 откладываются и записываются в Deferred Verification, не одобряются за пользователя; предусловие 02-08 «тест в HEAD» заменено сверкой sha256 со снимком 02-01; фаза 1 (verification stale из-за манифестов фазы 2) переверяется верификатором один раз после фазы 2
- [Phase 02]: 02-07: multer 2.4.0 и sharp 0.35.5 (одобренные 02-04), правок роутов не понадобилось
- [Phase 02]: 02-07: @types/sharp удалён (sharp 0.35 со своими типами, typecheck зелёный), в yarn.lock одна версия sharp 0.35.5
- [Phase 02]: 02-07: multer 2.4.0 передаёт обрыв загрузки в next(err) — в логе Request error: Request aborted; характеризационный тест не менялся и зелёный
- [Phase 02]: 02-07: Task 2 (preview Vercel, /healthz, аватар, CI на Linux) не выполнен и не одобрен, ждёт пользователя (deferred_human_gate)
- [Phase 02]: 02-08: next-mdx-remote 6.0.0; remarkMdxStyleToEstree перенесён в rehypePlugins после rehypeRaw (style не вырезается blockJS); remarkStripUnsafeJsx первым в remarkPlugins режет script, srcdoc, on*; {выражения} и объектный style={{…}} не выводятся по D-08
- [Phase 02]: 02-09: resolutions не добавлены — в остатке 17 записей (tar 6.2.1, http-cache-semantics, serialize-javascript — build; undici, @fastify/busboy, path-to-regexp 6.2.1, braces — dev через @vercel/node), production-рантайм не достигается (D-13)
- [Phase 02]: MDX ученика: белый список элементов и атрибутов (remarkMdxAllowlist) вместо чёрного списка remarkStripUnsafeJsx, граница ошибок вокруг MDXRemote в MdxRenderer; причина: ревью нашло обходы DEP-03 (svg:script, регистр атрибутов SRC/HREF, base, meta/link/style, маячки через style url()/srcset) и падение страницы при ошибке рендера; class не пропускается (оверлей через классы Tailwind)
- [Phase 03]: Smart discuss фазы 3 выполнен автономно (19 решений [авто]); D-19 (удаление legacy TestScoringRules) оркестратор перенёс в Deferred: PROJECT.md Out of Scope и REQUIREMENTS.md:165 исключают его, удаление API без пользователя не делается
- [Phase 03]: 03-01: custom_multi_3 в характеризации использует validationSchema {minOptions:3,maxOptions:4,exactChoiceCount:3}; схема плана с exactChoiceCount 2 < minOptions 3 сервером отклоняется (400), факт закреплён тестом
- [Phase 03]: 03-02: validateQuestion вынесен дословно в admin/tests/question-validation.ts; D5 закреплён красным тестом через KNOWN_DEFECTS (переключение в 03-10)
- [Phase 03]: 03-03: пакет @bio-exam/exam-core создан по образцу rbac; boundaries.test.ts ловит побочные импорты и require; серверные копии схем остаются до 03-12 и 03-09
- [Phase 03]: 03-12: app/server/vercel-build.sh (не вызывается Vercel) тоже собирает exam-core после rbac, чтобы сборка пакета стояла везде, где явно собирается rbac
- [Phase 03]: 03-05: MISTAKES_UNSCORABLE объявлен в adapters/types.ts и реэкспортирован из scoring.ts (без цикла импортов); TemplateAdapter обобщён TAnswer extends AnswerValue
- [Phase 03]: 03-13: SCORING_TYPES_MAP содержит отдельные типы tiers_unsorted_fractional, one_mistake_clamped, one_mistake_fractional; строка «тип отсутствует» вне *_SCORING_CASES (нет шаблона для обхода в 03-06)
- [Phase 03]: 03-06: computeVerdicts берёт mistakes из countMistakes scoring.ts (диспетчеризация по метрике), при MISTAKES_UNSCORABLE — errorUnits; части choice/matching строятся по content и при ключе null
- [Phase 03]: 03-06: errorUnits sequence_digits считает swapped как ceil(n/2); помощники вердиктов в adapters/verdicts.ts (без цикла review.ts ↔ adapters)
- [Phase 03]: 03-07: тексты проверки при сохранении в листовом authoring-messages.ts (реэкспорт из authoring.ts) против цикла импортов; validateQuestionForSave строга к сырому ключу, вызывающий код сначала toCanonicalKey
- [Phase 03]: 03-08: D-11 исправлен customType jsonbParsedByDriver только для answer_keys.correct_answer (dataType jsonb, fromDriver без разбора); drizzle-kit не предлагает миграцию, запасной вариант через sql не понадобился
- [Phase 03]: 03-10: web-проверка вопроса через validateQuestionForSave; список типов undefined пропускает проверку, пустой даёт «Тип вопроса не настроен в БД»; фикстура таблицы 03-02 переведена на встроенные ключи radio/checkbox; SWR глобальных типов только в режиме создания
- [Phase 03]: 03-09: сервер проверяет вопрос при сохранении через validateQuestionForSave; zod (QuestionKeyPayloadSchema) приводит ключ до проверки; /save по глобальной карте типов, POST/PATCH по карте теста (без выравнивания)
- [Phase 03]: 03-11: разбор sequence_digits показывает «Ошибок: N» по computeVerdicts пакета (getSequenceReview.summaryText), ячейки только при видимом ключе; sr-only цифра ключа только при correctAnswer != null; D2 в e2e — обычный тест
- [Phase 04]: Smart discuss фазы 4 выполнен автономно (24 решения [авто], 12 пунктов «Требует подтверждения»); UI-SPEC нужен узкий
- [Phase 04]: 04-01: AUTH-01-db-error проверяется отдельным admin без кэша прав (fail-open, а не userCache); KNOWN_DEFECTS в auth-known-defects.test.ts, чинящий план удаляет свой id
- [Phase 04]: 04-02: e2e loginContext входит через API без init-скрипта ключа миграции; D3 измеряется на свежем браузере (me и refresh)
- [Phase 04]: 04-03: 0021_auth_sessions — auth_sessions (created_at/last_refreshed_at NOT NULL DEFAULT now()), login_throttle (login nullable, failures NOT NULL DEFAULT 0, updated_at NOT NULL DEFAULT now()), refresh_tokens.session_id nullable FK cascade + used_at; when 0021 = 1791095839799
- [Phase 04]: 04-04: права считает один модуль services/access-policy (computeAccess за швом GrantsLoader); AccessSet несёт snapshot для /api/rbac/user/:id/grants; rbac_role_grants применяются только к прямо назначенным ролям; fail-closed во всех средах
- [Phase 04]: 04-05: SessionUser = { id, login }; sessionOptional всегда проверяет пользователя в БД, ошибка БД → 500; доступ к тестам/настройкам/поиску по праву (tests.read, settings.manage, tests.write|groups.manage_groups); охранный тест D-21 с 5 поимёнными исключениями
- [Phase 05]: Smart discuss фазы 5 выполнен автономно (25 решений [авто], 10 пунктов «Требует подтверждения»); UI-SPEC нужен узкий; sessionId и clientAttemptId обязательны в submit; миграции 0022 (уникальная открытая сессия, одна попытка на сессию, чистка дубликатов) и 0023 (results_version); старые попытки читаются без перезаписи с ключом из истории answer_keys
- [Phase 04]: 04-07: окно гонки refresh 30 с (константа в коде); reused/replay только для живой сессии активного пользователя, иначе rejected; смена пароля обновляет хэш и отзывает остальные сессии в одной транзакции; лимитер смены пароля остаётся in-memory; basic-admin удалён (0 вызывающих)
- [Phase 07]: Smart discuss фазы 7 выполнен автономно (27 решений [авто], 14 пунктов «Требует подтверждения»); STOR-05 входит полностью; файловый маршрут отдаёт только картинки; D6 — неизменяемые ключи промпта с ревизией; роль user теряет users.read, минимальный поиск /api/users/directory; UI-SPEC не нужен
- [Phase 04]: 04-08: троттлинг входа в login_throttle; IP_TRUSTED = false (корзины IP нет, потолок пары 60 с); ключ пары pair:JSON[login, ip]; recordSuccess возвращает резерв в корзину логина (и IP при IP_TRUSTED)
- [Phase 04]: 04-10: logout() из контекста переходит на /login при любом исходе POST /api/auth/logout; тост выхода в nav-user до вызова, тоста ошибки нет (решение исполнителя, автономно)
- [Phase 04]: 04-10: keep-alive при исходе ok с accessExpiresAt = null таймер не ставит; perms в AuthProvider считаются по me?.perms (решение исполнителя, автономно)
- [Phase 07.1]: Запрос клиента «ограниченный админ на цитологию» решается общей фазой 7.1: фиксированные роли «Администратор», «Учитель», «Ученик» без редактора ролей (ответ клиента 10), зоны учителя: разделы (многие ко многим), свои группы, ученики, тесты и вопросы в своих разделах — после фаз 5 и 7, до 8; в фазах 5 и 7 доступ к объекту только через services/access-policy/scope.ts (canReadTest, canWriteTest, canWriteTopic, canReadUser, canReviewAttempt, testScope); открытые задания с фото и ручной проверкой — после переезда на Beget (v2); графики по разделам со столбиками — быстрая задача сейчас, параллельно
- [Phase 04]: 04-11: proxy решает о refresh по payload access без подписи (кандидаты имени cookie), rejected только при 401, очищает все кандидаты access и refresh_token; requireApiOrigin в lib/session/api-origin.ts; при ошибке getServerMe AppLayout передаёт sessionError, защищённый layout бросает ошибку в app/error.tsx
- [Phase 07.1]: Ответы клиента (07.1-CLIENT-ANSWERS.md): роли фиксированные (админ, учитель, ученик), редактор ролей не нужен; разделы создаёт только админ; учитель видит попытки всех учеников по своим разделам, назначает тесты, ведёт свои группы, приглашает учеников, правит вопросы раздела; схема учитель↔раздел многие-ко-многим; открытые задания: 0–3, до 5 фото, до 3 исправлений, очередь проверки
- [Phase 07.1]: Учитель создаёт тесты и вопросы внутри закреплённого за ним раздела; разделы создаёт только админ (ответ пользователя)
- [Phase 04]: 04-12: охранный тест lib/session сужен для route-permissions.ts (только import { can, type PermissionKey } из @bio-exam/rbac); карта D-17 живёт в модуле веб-сессии
- [Phase 04]: 04-12: гард контента при отказе по разделу рендерит children и вызывает router.refresh() один раз на набор perms; rbac.write без rbac.read больше не открывает /admin и /admin/settings/rbac
- [Phase 04]: 04-13: e2e 429 создаёт неудачи fetch со страницы /login (тот же IP, что у клика Войти); break-all только на «{login}»; AlertDialog не закрывается Esc во время запроса
- [Phase 04]: 04-14: app/web без getMeData, Next /api/auth/me, lib/env/server.ts, pg и jsonwebtoken; e2e закрывает DATABASE_URL и AUTH_JWT_SECRET web пустыми строками; packages/rbac без buildPermissionSet; охранный тест D-21 целиком; CI Build web без ключей БД и JWT
- [Phase 07]: 07-01: изолированный процесс без STORAGE_DRIVER получает in-memory адаптер; STORAGE_DRIVER=memory вне изоляции и Supabase в изоляции — StorageConfigError; выход за корень локального адаптера — StorageKeyError (400)
- [Phase 07]: 07-01: классификатор Supabase по форме storage-js 2.93 (download: StorageUnknownError+originalError.status 400/404 → null; JSON: statusCode 404/409); повтор только при 5xx или без статуса
- [Phase 06]: Discuss фазы 6 (30 решений) и UI-SPEC утверждены; пользователь 2026-10-04: строка сохранения у студента, при 409 побеждает текущая вкладка, диалог «Остаться/Выйти», правки существующего вопроса защищены предупреждением при уходе; планирование после слияния фазы 5
- [Phase 07.1]: Discuss фазы 7.1 (32 решения) и UI-SPEC утверждены; пользователь 2026-10-04: учитель видит полную карточку ученика и снимает блок входа/завершает сеансы своих учеников, удаляет только тест без попыток, ищет учеников по имени, раздел «Пользователи» со своими учениками; признаки ownsZone/groupMember от сервера вместо проверок роли; TEACH-01..05 в REQUIREMENTS; планирование после слияния фаз 5 и 7
- [Phase 08]: Discuss фазы 8 (35 решений, UI-SPEC не нужен, ~14-15 планов в 6 волнах); пользователь 2026-10-04: лимит ZIP ключом env (4,4 МБ по умолчанию, 0 на VPS), профиль из поиска по логину, ошибка и «Повторить» на экранах списков, reduced motion только в затронутом
- [Phase 07]: Ревью кода фазы 7: BLOCKER CR-01 (переименование теряет живые файлы при гонке) чинится уникальной ревизией цели; SEC-01 (обход ключа /proxy на Supabase через ?, #, %2F) — узкий запрет символов и кодирование сегментов; решение пользователя 2026-10-04: бакет main приватный, аватары через proxy, перевод бакета — шаг пользователя после выкатки кода
- [Phase 06]: Ревью планов фазы 6: ревизия и перепроверка без блокеров (06-SQUAD-REVIEW.md); исполнение в worktree gsd/phase-06 от dev 0d633ed, коммит на план
- [Phase 07.1]: Выкатка по очереди (решение пользователя 2026-10-05): отдельные релизы 4 → 5 → 7 → 6 → 07.1 по своим runbook, сводного релиза нет; фаза 6 вливается в dev раньше 07.1
- [Phase 07.1]: Ревью планов 07.1: ревизия и перепроверка без блокеров (07.1-SQUAD-REVIEW.md); исполнение последовательно в worktree gsd/phase-07.1 от dev 0d633ed, коммит на план; слияние в dev после фазы 6
- [Phase 08]: Ревью планов фазы 8: ревизия и перепроверка без блокеров (08-SQUAD-REVIEW.md); 28 планов в 9 волнах, исполнение последовательно в worktree gsd/phase-08 от dev eae17fe, коммит на план

### Roadmap Evolution

- 2026-10-05: future milestone v4.0 «Чаты учителя и ученика» added after v3.0 and before PWA (now v5.0); not part of v1.0. Research and decisions: `.planning/research/chat/SUMMARY.md`; requirements CHAT-01...CHAT-12. The v3.0 cabinet notification store is a shared notification-event journal.
- 2026-10-06: v3.0 roadmap created: Phases 9–19 (result foundation, notification journal, deadline finalisation and background jobs, photos, QR and phone page, open question authoring and submit, review, retention, enabling and acceptance, remaining v1.0 tech debt, Supabase and Vercel removal). Traceability filled in `REQUIREMENTS.md` (74/74).

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

Быстрая задача 001 ждёт человека: push и Vercel preview, визуальная проверка графика на дашборде и в профиле (375px и десктоп), пункты `.planning/quick/001-topic-charts/deferred-items.md`.

### Blockers/Concerns

Open questions of the v3.0 research (`research/SUMMARY.md`, "Открытые вопросы") tagged to the phase that must settle them:

- [All phases] Line numbers in `research/*.md` date from commit `1962edd`; the codebase map `.planning/codebase/` from `29563ff`. Re-verify before planning each phase; consider refreshing `/gsd-map-codebase`.
- [Phase 9] Cascades: the chain `users → test_sessions → answer slots` already cascades, but new tables must not cascade from `users` (PLAT-05). Decide one rule in the first plan (recommendation: journal and reviews without cascade, `reviewer_id SET NULL`; slots keep the session cascade, files cleaned explicitly before `db.delete`). Phase 10 follows the same rule.
- [Phase 9] Weight of an open question: the maximum is always 3; reconcile with the existing question weight and the weight-0 case (`zero-weight.spec.ts`, no division by zero).
- [Phase 10] Journal producers: "test assigned" is built in Phase 10 (part of NOTIF-03); the teacher event "ждут проверки" is NOTIF-04 in Phase 15. If the assignment routes make the Phase 10 producer heavy, move it to Phase 15.
- [Phase 11] Autodeploy and open windows: `deploy.sh` looks at open `test_sessions` of the last 4 hours; after a forced submit an open upload window is invisible to it (extended in Phase 17, ROLL-03, user step). Check the Compose `stop_grace_period` on the server.
- [Phase 12] API container memory limit (768 MB today): decided by the user after the `sharp` measurement; HEIC (`heic-decode`) decided after the spike.
- [Phase 13] Phone page behaviour on iPhone Safari, Android Chrome, Samsung, Yandex Browser and messenger viewers is unmeasured; Caddy log and headers for `/photo-upload/*` and `/api/upload/*` unchecked (user steps).
- [Phase 14] Wording of the preliminary "X из Y" for the student to agree with the client.
- [Phase 15] `react-zoom-pan-pinch` 4.x is untested with React 19.2 and Next 16.3.8 (fallback 3.7.0, rotation by CSS).
- [Phase 16, Phase 19] 152-ФЗ: storing photos of minors, term and backup copies, parent consent, Roskomnadzor notification, physical location of the Supabase database. Not checked by a lawyer; affects the urgency of Phase 19.
- [Phase 19] Not before 2026-10-12. `assets:refs` on a copy of production data decides whether the Supabase link parser can be removed; the real content of the restic repository is unverified.

## Deferred Verification

Нет. Фазы 01–08 закрыты 2026-10-05: код на проде (`bio-exam.ru`, свой сервер, `master` ad64f55), ручные проверки подтверждены пользователем. Бэклог правок ревью — в `*-REVIEW-DISPOSITION.md` фаз, раздел «Отложено».

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first. In v3.0 they map to DEBT-01…DEBT-09 (see `REQUIREMENTS.md` and `ROADMAP.md`); the mobile sidebar button is excluded (done in the UX navigation work).

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| deferred_items | 01/deferred-items.md: Мобильная ширина < 1024 px: нет видимой кнопки бокового меню | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 01/deferred-items.md: compare-schema-dump не разбирает многострочные тела функций Supabase | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 01/deferred-items.md: Двойной refresh в AuthProvider (закрыто в 04-10) | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 01/deferred-items.md: Ключи ответов из цифр хранятся как числа JSON | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 02/deferred-items.md: Предупреждения vitest ESM и YN0086; ошибки multer 500 вместо 4xx; CSP для страниц ученика | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 04/deferred-items.md: Cookie в логе ошибок (закрыто в 99d9a3b, logger.test.ts) | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 04/deferred-items.md: Cookie в строке refresh_replay (закрыто в 99d9a3b) | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 04/deferred-items.md: Нет картинки not-found.png на странице 404 | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 04/deferred-items.md: Неиспользуемые переменные в DashboardClient | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 04/deferred-items.md: Два Toaster в защищённой части | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 05/deferred-items.md: Нестабильные тесты под нагрузкой; неиспользуемый импорт appSettings | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 06/deferred-items.md: Подсказка автодополнения в promptText (закрыто в 08-FIX-A, CR-03) | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 07/deferred-items.md: login-throttle.test нестабилен под нагрузкой | acknowledged | 2026-10-06 | v1.0 |
| deferred_items | 08/deferred-items.md: Таблица MDX не идемпотентна; подпись кнопки речи; фокус после повтора темы; InviteClient без try/finally | acknowledged | 2026-10-06 | v1.0 |

## Session Continuity

Last session: 2026-10-06T14:23:49.754Z
Stopped at: Completed 11-08-PLAN.md
Resume file: None

## Operator Next Steps

- Release of Phase 9 (migration 0026) is the user's step: merge the whole phase to master in one batch, manual `deploy.sh`, rehearsal on a fresh dump under `bio_exam`, no image-only rollback after 0026, reconciliation queries (server profile, «Ловушки»).
- Release of Phase 10 (0027) goes with Phase 9 (0026) unless prod is already on 0026; rules in the server profile.
- Phase 11 next (autonomous run, research-phase).
- Plan Phases 11, 12, 13, 15 and 19 with `--research-phase`.
- Phase 19 (Supabase and Vercel removal) must not start before 2026-10-12.

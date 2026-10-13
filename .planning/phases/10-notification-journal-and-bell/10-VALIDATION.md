---
phase: "10"
slug: "notification-journal-and-bell"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Источник: `10-RESEARCH.md` → «Validation Architecture».

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (server, web), `node --test` (scripts), Playwright (e2e) |
| **Config file** | `app/server/vitest.config.ts`, `app/web/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Quick run command** | один файл сервера: `node scripts/with-test-db.mjs yarn workspace @bio-exam/server exec vitest run src/<путь>.test.ts`; web: `yarn workspace @bio-exam/web exec vitest run lib/notifications` |
| **Full suite command** | `yarn verify` (затем отдельно `yarn e2e`) |
| **Estimated runtime** | server ~65 с, web ~10 с, `yarn verify` ~4–5 мин, `yarn e2e` ~4 мин |

---

## Sampling Rate

- **After every task commit:** тест затронутого файла (один серверный файл через `with-test-db`; один файл web)
- **After every plan wave:** `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` + `yarn workspace @bio-exam/web test` + `yarn typecheck` + `yarn lint`
- **Before `/gsd-verify-work`:** `yarn verify: OK` (включая `migrations` и снимок маршрутов), `yarn e2e` зелёный на `chromium-desktop` и `chromium-mobile`
- **Max feedback latency:** 90 seconds для быстрых проверок задач

---

## Per-Task Verification Map

Заполняется по задачам планов при исполнении. Карта требований → тесты из исследования:

| Requirement | Behavior | Test Type | File | Exists |
|-------------|----------|-----------|------|--------|
| NOTIF-01 | Откат причины не оставляет ни назначения, ни события | server integration | `app/server/src/services/notifications/notifications.test.ts` | ✅ |
| NOTIF-01 | Повтор запроса: одна строка, `ref_seq = 1`; повторная причина после снятия: та же строка, `ref_seq = 2`, непрочитано | server integration | `app/server/src/routes/tests/assignment-notifications.test.ts` | ✅ |
| NOTIF-01 | Три пути назначения: события только для вставленных строк; назначающий = получатель события не даёт; отключённый ученик событие получает | server integration | `assignment-notifications.test.ts` | ✅ |
| NOTIF-01 | D-18 (план 10-02): назначение черновика или теста в выключенной теме события не даёт; назначение блокирует строку теста `FOR SHARE` | server integration | `app/server/src/routes/tests/assignment-notifications.test.ts` | ✅ |
| NOTIF-01 | D-18 (план 10-09): публикация пишет событие всем назначенным (`ref_seq = 1`, повторная публикация — `ref_seq + 1`), повторное сохранение опубликованного — без событий; откат публикации — ни публикации, ни событий; гонка назначения и публикации событие не теряет | server integration | `app/server/src/routes/tests/publish-notifications.test.ts` | ✅ |
| NOTIF-01 | Пакет без дубликатов не падает; доставка `inbox` `sent`, `sent_at` обновляется | server integration | `notifications.test.ts` | ✅ |
| NOTIF-01 | Удаление получателя удаляет события и доставки; удаление автора обнуляет `actor_id` | server integration | `app/server/src/db/user-deletion-rule.test.ts` (новые кейсы) | ✅ файл |
| NOTIF-02 | Список только свои, порядок `(last_event_at, id)`, курсор без потерь на микросекундах | server integration | `app/server/src/routes/notifications.test.ts` | ✅ |
| NOTIF-02 | `unread-count` точное; `read`, `read-all`; чужой или неверный id → 404 | server integration | `routes/notifications.test.ts` | ✅ |
| NOTIF-02 | `open`: `href` на тест; после снятия назначения, снятия публикации, удаления теста, чужого/неверного id → ровно `{ error: 'NO_ACCESS' }`; выход из группы доступ сохраняет (D-09) | server integration | `routes/notifications.test.ts` | ✅ |
| NOTIF-02 | Колокольчик, «9+», переход по строке, прочитано, «Прочитать все», «Нет доступа» на 375/768/1280; черновик без уведомления до публикации (D-18) | e2e | `e2e/tests/notifications.spec.ts` + сид | ✅ |
| NOTIF-05 | Префикс `(N) ` / `(9+) ` в заголовке, снимается при нуле, без двойного префикса после перехода | e2e | `e2e/tests/notifications.spec.ts` | ✅ |
| NOTIF-05 | `titlePrefix`, `badgeLabel`, `bellAccessibleName`, `formatNotificationTime`, `isInternalHref` | unit table | `app/web/lib/notifications/format.test.ts` | ✅ |
| NOTIF-06 | Неизвестный `kind` записывается, выводится «Новое уведомление», `open` → `NO_ACCESS`; `collapse_key` сохраняется; поля доставки по умолчанию | server integration | `notifications.test.ts` | ✅ |
| NOTIF-01..06 | Разборщики ответов web (`MalformedBodyError`) | unit | `app/web/lib/notifications/api.test.ts` | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `app/server/src/services/notifications/notifications.test.ts`
- [x] `app/server/src/routes/notifications.test.ts`
- [x] `app/server/src/routes/tests/assignment-notifications.test.ts`
- [x] `app/server/src/routes/tests/publish-notifications.test.ts`
- [x] кейсы в `app/server/src/db/user-deletion-rule.test.ts`
- [x] `app/web/lib/notifications/format.test.ts`, `api.test.ts`
- [x] e2e: аккаунты `bell-student-<p>`, `notify-student-<p>` в конце списка, тема `e2e-notif`, `e2e/tests/notifications.spec.ts`
- [x] `app/server/route-inventory.txt` перегенерирован

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Выкатка миграции 0027 на прод | NOTIF-01 | Сервер вне доступа агентов | Пользователь: обычная выкатка с миграцией (ручной `deploy.sh`, автовыкатка пропускает миграции) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s (быстрые проверки задач)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-06 (аудит gsd-nyquist-auditor: MAJOR-пробелов нет; «после входа» — первая загрузка под сессией в 10-05, повторное открытие сохраняет первый `read_at` через тот же `coalesce`, что у `read`)
